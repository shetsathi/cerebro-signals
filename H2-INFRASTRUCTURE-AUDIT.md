# H2 INFRASTRUCTURE AUDIT — READ-ONLY ASSESSMENT

**Date:** 2026-08-21  
**Scope:** Existing historical validation/replay infrastructure  
**Status:** AUDIT COMPLETE — READY FOR ARCHITECTURE REVIEW

---

## EXECUTIVE SUMMARY

Cerebro Signals already has substantial historical replay infrastructure in place:

**✅ EXISTING COMPONENTS:**
- ReplayEngine with deterministic replay capability
- DatasetManifest with validation tracking
- CSV importer and data validator
- Timestamp parser with IST/UTC handling
- File-based repository persistence
- Integration tests with multi-timeframe support
- 331/331 tests passing (includes replay tests)

**✅ INTEGRATION POINTS:**
- Domain/regime engines integrated in tests
- Multi-timeframe snapshot support verified
- IST/UTC timestamp conversion implemented
- Parts 1-6 accessible via domain imports

**🔴 MISSING FOR H2:**
- H2-specific orchestration layer (historical → Parts 1-6 → decisions)
- Run manifest persistence (with determinism tracking)
- Look-ahead prevention framework
- Causal evaluation contracts
- Decision/trade-plan snapshot recording
- Backtesting results aggregation

---

## EXISTING INFRASTRUCTURE INVENTORY

### 1. REPLAY ENGINE (`src/historical/replay-engine.ts`)

**Purpose:** Deterministic point-in-time replay of historical candles

**Capabilities:**
- Configuration validation
- Chronological candle filtering
- AsyncGenerator-based streaming
- Determinism verification (run twice, compare)
- Expected candle count calculation

**Key Methods:**
```typescript
validateConfig(config: ReplayConfig): { valid: boolean; errors: string[] }
async *replay(candles: Candle[], config: ReplayConfig): AsyncGenerator<ReplayEvent>
verifyDeterminism(candles: Candle[], config: ReplayConfig): Promise<boolean>
expectedCandleCount(startDateUTC, endDateUTC, timeframeMinutes): number
```

**ReplayConfig Interface:**
```typescript
{
  symbol: string;
  timeframes: string[]; // ["5m", "15m", "60m"]
  startDateUTC: Date;
  endDateUTC: Date;
  tickTimeframe?: '5m' | '15m' | '60m';
}
```

**ReplayEvent Interface:**
```typescript
{
  asOfTimeUTC: Date;
  symbol: string;
  timeframe: string;
  candle: Candle;
  eventType: 'CANDLE_CLOSED';
}
```

**Status:** ✅ PRODUCTION-READY

---

### 2. DATA CONTRACTS (`src/historical/data-contracts.ts`)

**Purpose:** Define input/output formats for historical data

**Key Interfaces:**

#### RawHistoricalCandle
- Symbol, timeframe, open/close times
- OHLCV data
- Knowledge time (optional)
- Timezone handling

#### DataValidationError
- Error types: OHLC_INVALID, OHLC_BACKWARDS, PRICE_INVALID, TIMESTAMP_INVALID, DUPLICATE, OUT_OF_ORDER, MISSING_INTERVAL, SESSION_BOUNDARY, CROSS_SYMBOL, CROSS_TIMEFRAME, OTHER
- Severity: WARNING or ERROR

#### CandleValidationResult
- Valid flag + error/warning lists

#### DatasetManifest
- Dataset ID, source, instrument, timeframe
- Date range (UTC), candle count
- Timezone, schema version
- Validation status/errors
- SHA256 checksum of raw data
- Import timestamp
- Normalization version

#### ReplayEvent
- AsOfTimeUTC, symbol, timeframe
- Candle object
- Event type

#### HistoricalDataset (ready for replay)
- Manifest reference
- Sorted chronological candles
- Metadata

**Status:** ✅ COMPREHENSIVE (ready for H2 extension)

---

### 3. DATA VALIDATOR (`src/historical/data-validator.ts`)

**Purpose:** Validate raw candles before storage

**Validation Rules:**
- OHLC relationships (high ≥ open/close, low ≤ open/close)
- Positive prices
- Chronological ordering
- Duplicate detection
- Missing intervals
- Session boundaries
- Symbol/timeframe consistency

**Status:** ✅ COMPLETE

---

### 4. CSV IMPORTER (`src/historical/csv-importer.ts`)

**Purpose:** Import historical data from CSV

**Capabilities:**
- Format detection
- Delimiter handling
- Header parsing
- Row validation
- Batch processing
- Error tracking

**Status:** ✅ FUNCTIONAL

---

### 5. TIMESTAMP PARSER (`src/historical/timestamp-parser.ts`)

**Purpose:** Handle IST/UTC timezone conversions

**Capabilities:**
- IST → UTC conversion (-5:30 offset)
- RFC 3339 parsing
- Timezone validation
- Knowledge-time handling

**Status:** ✅ COMPLETE

---

### 6. LOCAL FILE REPOSITORY (`src/historical/local-file-repository.ts`)

**Purpose:** Persist historical datasets to disk

**Capabilities:**
- Save dataset to file
- Load dataset from file
- Manifest storage
- Checksum verification

**Status:** ✅ FUNCTIONAL

---

### 7. DATASET MANIFEST (`src/historical/dataset-manifest.ts`)

**Purpose:** Create and manage dataset metadata

**Capabilities:**
- Manifest creation
- Checksum calculation
- Validation tracking
- Serialization

**Status:** ✅ COMPLETE

---

## EXISTING TESTS

### Replay Engine Tests (`src/__tests__/historical/replay-engine.test.ts`)

**Test Coverage:**
- Configuration validation (valid, missing symbol, invalid dates)
- Chronological replay
- Determinism verification
- Timeframe filtering
- Symbol isolation
- Multi-timeframe handling

**Status:** ✅ 6+ TESTS PASSING

---

### Integration Tests (`src/__tests__/regime-engine-integration.test.ts`)

**Test Coverage:**
- Multi-timeframe snapshot creation
- Symbol isolation (NIFTY vs BANKNIFTY)
- Multiple timeframes (5m, 15m)
- Regime evaluation

**Status:** ✅ VERIFIED

---

### Other Historical Tests

- CSV importer tests
- Data validator tests
- Knowledge time tests
- Timestamp parser tests

**Total Historical Tests:** 44+ ✅ PASSING

---

## INTEGRATION POINTS WITH PARTS 1-6

### Domain Access

**Imports Available:**
```typescript
import { RegimeEngine } from '../domain/regime-engine';
import { LevelEngine } from '../domain/level-engine';
import { SetupEngine } from '../domain/setup-engine';
import { Candle, CandleStatus } from '../domain/candle';
import { Timeframe, TimeframeValue } from '../domain/timeframe';
import { MTFSnapshot } from '../domain/mtf-snapshot';
import { RegimeSnapshot } from '../domain/regime-state';
```

**Available Methods:**
```typescript
RegimeEngine.getRegimeSnapshot(candles, asOfTime, symbol, config)
LevelEngine.getLevelSnapshot(candles, asOfTime, symbol, config)
SetupEngine.findSetups(snapshot, timeframe, asOfTime)
```

**Contracts:**
- Candle (with symbol, timeframe, open/close times, OHLCV, status, knowledge time)
- Timeframe (5m, 15m, 60m, 1D)
- MTFSnapshot (multi-timeframe state)
- RegimeSnapshot (market regime)
- SetupState (setup evaluation results)

**Status:** ✅ FULLY INTEGRATED

---

## MISSING COMPONENTS FOR H2

### 1. H2 Orchestration Layer

**What Exists:**
- ReplayEngine yields ReplayEvents
- Parts 1-6 can process candles individually

**What's Missing:**
- Orchestrator that:
  - Reads H1.2 dataset
  - Feeds candles to replay engine
  - Evaluates Parts 1-6 at each candle
  - Collects decision snapshots
  - Writes run manifest

**Priority:** HIGH

---

### 2. Run Manifest Persistence

**What Exists:**
- DatasetManifest for input data

**What's Missing:**
- HistoricalRunManifest for output:
  ```typescript
  {
    runId: string;
    dataset: { id, checksum };
    pipelineVersion: string;
    startTime: Date;
    endTime: Date;
    candlesProcessed: number;
    evaluations: number;
    qualifiedSetups: number;
    rejectedSetups: number;
    tradePlans: number;
    determinismResult: 'VERIFIED' | 'FAILED';
    errors: string[];
  }
  ```

**Priority:** HIGH

---

### 3. Causal Evaluation Contracts

**What Exists:**
- SnapshotState contracts

**What's Missing:**
- Contracts for:
  - Input candle + timestamp
  - Market context at T
  - Indicators at T (no future data)
  - Evidence at T
  - Strategy evaluation at T
  - Decision at T
  - Risk assessment at T
  - Trade plan at T

**Priority:** HIGH

---

### 4. Look-Ahead Prevention Framework

**What Exists:**
- Deterministic replay with chronological ordering

**What's Missing:**
- Contracts/assertions that:
  - No future candle accessed during evaluation at T
  - No future indicator value used
  - No T+1 information leaked into T decision
  - Knowledge-time filtering enforced

**Priority:** CRITICAL

---

### 5. Backtesting Results Aggregation

**What Exists:**
- Individual parts can evaluate

**What's Missing:**
- Aggregator for:
  - Setup counts by strategy
  - Setup counts by rejection reason
  - Trade plan counts
  - Risk rejection counts
  - Indicator warm-up exclusions
  - Session exclusions
  - Error tracking

**Priority:** MEDIUM

---

## ARCHITECTURE PROPOSAL FOR H2

### Layered Structure

```
┌─────────────────────────────────────┐
│     H2 ORCHESTRATION LAYER          │
│  (New: H2Backtester, RunRecorder)   │
├─────────────────────────────────────┤
│  EVALUATION SNAPSHOT CAPTURE         │
│  (New: SnapshotRecorder, Manifest)   │
├─────────────────────────────────────┤
│     FROZEN PARTS 1–6                │
│  (LevelEngine, RegimeEngine, etc)    │
├─────────────────────────────────────┤
│   HISTORICAL REPLAY INFRASTRUCTURE   │
│  (Existing: ReplayEngine, Contracts) │
├─────────────────────────────────────┤
│      H1.2 PERSISTED DATASET         │
│   (45,592 NIFTY 5m candles)         │
└─────────────────────────────────────┘
```

### New Files Required

```
src/h2/
├── h2-backtester.ts          # Main orchestrator
├── h2-contracts.ts           # Run manifest + snapshot contracts
├── h2-snapshot-recorder.ts   # Capture evaluation snapshots
├── h2-look-ahead-guard.ts    # Prevent future-data access
└── h2-results-aggregator.ts  # Compile metrics

src/__tests__/h2/
├── h2-backtester.test.ts
├── h2-determinism.test.ts
├── h2-look-ahead.test.ts
└── h2-integration.test.ts
```

### Key Responsibilities

**H2Backtester:**
- Load H1.2 dataset
- Iterate candles chronologically
- Evaluate Parts 1-6 at each timestamp
- Guard against look-ahead
- Persist snapshots

**SnapshotRecorder:**
- Capture state at each evaluation
- Enforce causal ordering
- Record decision/risk/trade-plan

**RunManifest:**
- Track execution metadata
- Record determinism verification
- Aggregate metrics
- Store output location

---

## LOOK-AHEAD PREVENTION STRATEGY

### Current Safeguards

**Already Implemented:**
- ReplayEngine sorts chronologically
- AsyncGenerator prevents random access
- Timestamps tied to specific candles

**Need to Add:**
- Contracts requiring `asOfTime` for all decisions
- Assertions that no T+1 data accessed at T
- Test: mutate T+1, verify T decision unchanged
- Test: future high/low don't contaminate T
- Test: future regime doesn't affect T decision

### Implementation Approach

```typescript
// At candle T, only these are available:
interface CausalContext {
  asOfTimeUTC: Date;
  symbol: string;
  candlesUpToT: Candle[]; // never beyond T
  regimeSnapshotAtT: RegimeSnapshot; // only uses candles ≤ T
  levelSnapshotAtT: LevelSnapshot; // only uses candles ≤ T
  indicatorsAtT: IndicatorSnapshot; // computed from candles ≤ T
}

// Assertions that fail if T+1 used:
function assertNoCausalViolation(
  evaluationTime: Date,
  usedCandles: Candle[],
): void {
  for (const c of usedCandles) {
    if (c.closeTimeUTC > evaluationTime) {
      throw new Error(`Look-ahead violation: used candle at ${c.closeTimeUTC} when evaluating at ${evaluationTime}`);
    }
  }
}
```

---

## TEST STRATEGY FOR H2

### A. Deterministic Replay Test
- Load H1.2 dataset
- Run backtester twice
- Verify byte-for-byte or structurally identical output
- ✅ Already supported by ReplayEngine

### B. No Look-Ahead Test
- Load H1.2 dataset (first 100 candles)
- Mutate candle T+1 (future)
- Re-run evaluation at T
- Verify decision unchanged

### C. Future Mutation Test
- Load H1.2 dataset
- Mutate candles T+2, T+3, T+5 (later)
- Re-run from start to T
- Verify all decisions up to T unchanged

### D. Warm-Up Correctness Test
- Load H1.2 dataset
- Verify no valid setups before MIN_WARM_UP_CANDLES
- ✅ Already implemented in SetupEngine

### E. Session Boundary Test
- Load H1.2 dataset
- Verify no overnight candle bleeds into next session
- ✅ Already handled by IST/UTC logic

### F. Timestamp Ordering Test
- Load H1.2 dataset
- Verify strict chronological processing
- ✅ Already enforced by ReplayEngine

### G. Duplicate Protection Test
- Load H1.2 dataset (with duplicate T)
- Verify duplicate silently ignored or error raised
- ✅ Already detected by data validator

### H. Dataset Integrity Test
- Load H1.2 dataset
- Verify manifest checksum matches
- Verify dataset matches H1.2 acquisition ID

---

## RISKS & MITIGATION

| Risk | Severity | Mitigation |
|------|----------|-----------|
| Future data leakage in indicators | CRITICAL | Contracts + assertions + tests |
| Warm-up period not enforced | HIGH | Explicit filtering before evaluation |
| Dataset mismatch (wrong H1.2) | HIGH | Manifest checksum verification |
| Non-deterministic replays | HIGH | Parallel run comparison test |
| Timestamp timezone errors | MEDIUM | Use existing parser + UTC-only |
| Parts 1-6 modifications | MEDIUM | Code review + no modifications |
| Performance degradation | LOW | Stream processing, not in-memory |

---

## DEPENDENCY GRAPH

```
H2 Orchestrator
├── ReplayEngine (existing)
├── H1.2 Dataset Manifest (existing)
├── SnapshotRecorder (new)
├── RunManifest (new)
├── LevelEngine (existing, Parts 1-6)
├── RegimeEngine (existing, Parts 1-6)
├── SetupEngine (existing, Parts 1-6)
└── LocalFileRepository (existing)
```

---

## FILES TO CREATE

### Core H2 Infrastructure

1. **src/h2/h2-backtester.ts** (~300 LOC)
   - Main orchestrator
   - Dataset loading
   - Candle iteration
   - Parts 1-6 invocation
   - Snapshot recording

2. **src/h2/h2-contracts.ts** (~150 LOC)
   - HistoricalRunManifest
   - CausalSnapshot
   - EvaluationResult
   - BacktestingMetrics

3. **src/h2/h2-snapshot-recorder.ts** (~200 LOC)
   - Capture state at T
   - Enforce causality
   - Serialize snapshots

4. **src/h2/h2-look-ahead-guard.ts** (~150 LOC)
   - Assertions
   - Causal verification
   - Future-data detection

5. **src/h2/h2-results-aggregator.ts** (~200 LOC)
   - Aggregate metrics
   - Compile statistics
   - Generate report

### Tests

6. **src/__tests__/h2/h2-backtester.test.ts** (~300 LOC)
   - Integration tests
   - E2E backtesting

7. **src/__tests__/h2/h2-determinism.test.ts** (~200 LOC)
   - Deterministic replay verification
   - Parallel run comparison

8. **src/__tests__/h2/h2-look-ahead.test.ts** (~250 LOC)
   - Future mutation tests
   - Causal violation detection
   - Warm-up verification

9. **src/__tests__/h2/h2-integration.test.ts** (~200 LOC)
   - Parts 1-6 integration
   - Dataset integrity
   - Manifest verification

### Scripts

10. **src/scripts/h2-run-backtest.ts** (~100 LOC)
    - CLI for running full backtest
    - Outputs run manifest
    - Saves results

---

## FINAL ASSESSMENT

✅ **H2 IS ARCHITECTURALLY FEASIBLE**

- Existing replay infrastructure is solid
- Parts 1-6 are accessible and well-tested
- H1.2 dataset verified and persisted
- Main work: wrapping orchestration layer around frozen engines

✅ **NO MODIFICATIONS NEEDED TO:**
- Parts 1-6 (frozen)
- H0 infrastructure (frozen)
- ReplayEngine (already deterministic)
- Data contracts (extensible)

🔧 **WORK REQUIRED:**
- H2-specific orchestration (~1500 LOC total)
- Look-ahead prevention framework (~200 LOC)
- Causal snapshot recording (~400 LOC)
- Results aggregation (~300 LOC)
- Tests (~950 LOC)

**Estimated Scope:** ~2-3 hours of implementation + testing

---

## RECOMMENDATION

**PROCEED WITH H2 IMPLEMENTATION**

1. Create H2 orchestration layer (thin wrapper around ReplayEngine)
2. Implement causal snapshot recording
3. Add look-ahead guard assertions
4. Build results aggregator
5. Implement 4 critical tests (determinism, no look-ahead, warm-up, dataset integrity)
6. Run full backtest on H1.2 dataset
7. Generate run manifest with complete metrics

**Next Step:** Architecture review and approval before implementation.

---

*Audit complete. All existing infrastructure documented and ready for H2 orchestration layer.*
