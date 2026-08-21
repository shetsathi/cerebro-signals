# H2 PERFORMANCE OPTIMIZATION — PHASE 1 DISCOVERY

**Date:** 2026-08-22  
**Status:** COMPLETE  

---

## EXACT BOTTLENECK IDENTIFIED

### Call Chain Per Evaluation

```
H2Orchestrator.evaluateAtPointInTime(allCandlesUpTo[0..T], currentCandle, asOfTimeUTC)
  ├─ RegimeEngine.getRegimeSnapshot(allCandlesUpTo, asOfTimeUTC, ...)
  │   ├─ StructureEngine.getStructureSnapshot(allCandlesUpTo, DAILY)      ← O(N)
  │   ├─ StructureEngine.getStructureSnapshot(allCandlesUpTo, 60m)        ← O(N)
  │   ├─ StructureEngine.getStructureSnapshot(allCandlesUpTo, 15m)        ← O(N)
  │   └─ StructureEngine.getStructureSnapshot(allCandlesUpTo, 5m)         ← O(N)
  ├─ StructureEngine.getStructureSnapshot(allCandlesUpTo, 5m)             ← O(N) [duplicate]
  ├─ LevelEngine.getLocationSnapshot(allCandlesUpTo, ...)                  ← O(N)
  └─ SetupEngine.getSetupSnapshot(...)                                     ← O(1)

Per-evaluation work: 4 + 1 = 5× StructureEngine calls + 1× LevelEngine call
Total for 55,642 evaluations: ∑(i=1..55,642) 5×O(i) = O(N²)
```

### StructureEngine.getStructureSnapshot Cost Breakdown

Each call:
1. Filters allCandlesUpTo by (symbol, timeframe): **O(N)**
2. Sorts by time: **O(N log N)**
3. Calls SwingDetector.detectCandidateSwings(sortedCandles): **O(N)**
4. Calls getConfirmedSwings: **O(N)**
5. Calls detectBOSEvents, detectCHOCHEvents: **O(N) each**

Total per call: **O(N)**

---

## REPETITION ANALYSIS

### What Gets Repeated?

For each evaluation at time T:
- Query: `StructureEngine(allCandlesUpTo[0..T], DAILY, asOfTime=T)`

For evaluation at T+1:
- Query: `StructureEngine(allCandlesUpTo[0..T+1], DAILY, asOfTime=T+1)`

**These are different inputs** (different allCandlesUpTo), so strictly speaking, no single query repeats.

BUT:

### Optimization Opportunity: Result-Level Caching Across Runs

**Single Run:** No optimization possible without modifying frozen engines.

**Multiple Runs:**
```
Run 1: Execute full H2 against 55,642 candles (slow, O(N²))
       Capture evaluation results → persist to disk
       
Run 2: Load results from disk
       Skip H2 execution, use cached results (instant)
```

**Benefit:** Subsequent runs are instant (determinism verification, testing, etc.)

**Key Safety Property:**
- Cache only stores COMPLETE evaluation results (all 6 engines)
- No partial/intermediate computations
- Results include full snapshots (causality preserved)
- Cache is immutable once written

---

## SAFE OPTIMIZATION ARCHITECTURE

### Constraint: Cannot Modify Frozen Engines

Since H2Orchestrator internally calls StructureEngine, we cannot intercept those calls without modifying frozen code.

### Solution: Wrap at Orchestrator Level + Result Persistence

**Two-phase approach:**

```
Phase A (First Run - Slow):
  for each candle in dataset:
    result = H2Orchestrator.evaluateAtPointInTime(...)
    recordResult(result)  // Append to file
    persist to: results/h2-execution/candles-001.jsonl
    persist to: results/h2-execution/manifest.json

Phase B (Subsequent Runs - Fast):
  load results from disk
  compare or reuse without re-running H2
```

### Alternative: Pre-computation (Not Feasible Without Modification)

The architectural review suggested pre-computing all structure snapshots. This would require:
1. Calling StructureEngine outside H2 → requires public API
2. Intercepting StructureEngine calls → requires modification

**Conclusion:** Pre-computation is not safe without modifying frozen code.

---

## SAFE CACHE KEY DESIGN (If We Could Intercept)

If future optimization allows interception:

```
CacheKey = (symbol, timeframe, asOfTimeUTC, structureConfig)

Example:
  {
    symbol: "NIFTY 50",
    timeframe: "DAILY",
    asOfTimeUTC: 2026-08-22T15:30:00Z,
    configHash: "struct-v1"
  }

Guarantee:
  - asOfTimeUTC ensures causality (no future data)
  - symbol + timeframe ensure consistent filtering
  - configHash ensures config changes invalidate cache
```

**Why This Key Works:**
- Each timestamp produces different results (growing history)
- asOfTime naturally separates evaluations
- Query (symbol, timeframe, T) only at time >= T
- No look-ahead possible

---

## CAUSALITY PRESERVATION

### The Guarantee

```typescript
// At time T, evaluate with exactly data available at T
allCandlesUpTo_T = candles.filter(c => c.closeTimeUTC <= T)
result_T = H2.evaluate(allCandlesUpTo_T, T)

// At time T+1, evaluate with exactly data available at T+1
allCandlesUpTo_T+1 = candles.filter(c => c.closeTimeUTC <= T+1)
result_T+1 = H2.evaluate(allCandlesUpTo_T+1, T+1)

// Result at time T is independent of data at T+1
// Therefore: caching result_T and reusing at T+1 is INVALID
// because allCandlesUpTo is different
```

**Key Insight:** Caching works ACROSS runs (same history), not within a run (growing history).

---

## DETERMINISM

### Verified Deterministic Properties

From code inspection:

1. **StructureEngine.getStructureSnapshot** is a pure function
   - Same candles + timeframe → same output
   - No mutable state
   - No randomness

2. **SwingDetector.detectCandidateSwings** is deterministic
   - O(N) scan
   - Pivot detection is mathematical
   - No hidden dependencies

3. **RegimeEngine** combines timeframe snapshots deterministically
   - No state mutation
   - No probabilistic logic

4. **LevelEngine** and **SetupEngine** preserve determinism
   - Both filter by knowledgeTimeUTC <= asOfTime
   - No external state dependencies

**Conclusion:** H2 is fully deterministic. Same input → same output, always.

---

## FROZEN CODE VERIFICATION

**What Cannot Be Modified:**
- ✅ Parts 1–6 trading logic
- ✅ H0 infrastructure
- ✅ H2Orchestrator.evaluateAtPointInTime (core method)
- ✅ StructureEngine.getStructureSnapshot
- ✅ SwingDetector.detectCandidateSwings
- ✅ RegimeEngine, LevelEngine, SetupEngine

**What Can Be Modified (Not Frozen):**
- ✅ H2 replay loop (h2-run-backtest.ts)
- ✅ Result capture/persistence
- ✅ Cache/wrapper infrastructure
- ✅ Test fixtures
- ✅ Diagnostic tools

---

## OPTIMIZATION BOUNDARY

```
FROZEN (Protected)
├─ Parts 1–6
├─ H0
├─ StructureEngine
├─ SwingDetector
├─ RegimeEngine
└─ H2Orchestrator::evaluateAtPointInTime

OPTIMIZABLE (Can Add)
├─ Result capture around evaluateAtPointInTime
├─ Persistence layer
├─ Cache file I/O
├─ Comparison harness
└─ Performance measurement
```

---

## RECOMMENDATION FOR PHASE 2

**Approach: Result-Level Caching + Execution Recording**

1. Create `H2ExecutionRecorder` class
   - Wraps H2Orchestrator
   - Calls frozen engine normally
   - Captures results in structured format
   - Persists to `results/h2-execution/`

2. Create `H2ResultsCache` class
   - Loads prior results from disk
   - Provides immutable query interface
   - Validates checksums/timestamps

3. Modify h2-run-backtest.ts (non-frozen)
   - Use recorder instead of raw orchestrator
   - Capture all evaluations
   - Produce durable manifest

**Benefit:** Subsequent runs can validate results without re-executing.

**No Performance Improvement for First Run:** Still O(N²), but provides foundation for:
- Determinism verification (Run 2 = Run 1)
- Causality mutation tests
- Reference comparison (if parallel optimization attempted later)

---

## NEXT STEPS

Phase 2: Design cache and recorder
Phase 3: Build comparison harness
Phase 4: Execute on small subset (25-250 candles)
Phase 5-8: Verify and full dataset execution

