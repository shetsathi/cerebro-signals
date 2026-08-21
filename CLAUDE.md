# Cerebro Signals — Complete Project Context

**Project**: Cerebro Signals V1  
**Status**: Active Development (Part 1–6 Complete, H2 Performance Framework In Progress)  
**Latest Branch**: `feature/h2-performance-optimization`  
**Author**: Cerebro Signals Team  

---

## Table of Contents

1. [Project Overview](#project-overview)
2. [Architecture & Layers](#architecture--layers)
3. [Part 1: Foundation & Candle Engine](#part-1-foundation--candle-engine)
4. [Part 2: Look-Ahead Safety & MTF Synchronization](#part-2-look-ahead-safety--mtf-synchronization)
5. [Part 3: Structure Engine](#part-3-structure-engine)
6. [Part 4: Regime Engine](#part-4-regime-engine)
7. [Part 5: Level & Location Engine](#part-5-level--location-engine)
8. [Part 6: Setup Qualification Engine](#part-6-setup-qualification-engine)
9. [H2: Historical Validation & Backtest Framework](#h2-historical-validation--backtest-framework)
10. [Current Status & Work Done](#current-status--work-done)
11. [Key Design Decisions](#key-design-decisions)
12. [Testing & Validation Strategy](#testing--validation-strategy)
13. [Known Limitations & Future Work](#known-limitations--future-work)

---

## Project Overview

Cerebro Signals is a **deterministic market structure analysis engine** for trading. It decomposes the problem of understanding market structure into 6 frozen, deterministic parts:

### Core Philosophy

- **Determinism**: Every output for a given input is guaranteed identical across runs
- **Causality**: No look-ahead allowed; data accessible at time T cannot include information from T+1
- **Immutability**: Snapshots are sealed and cannot be modified after creation
- **Composability**: Each part builds on frozen outputs from prior parts
- **Testing**: Every rule is testable with frozen, repeatable test data

### Market Target

- **Exchange**: NSE (National Stock Exchange of India)
- **Timezone**: IST (Asia/Kolkata, UTC+5:30)
- **Session Hours**: 09:15–15:30 IST
- **Symbols**: Nifty 50 and other liquid stocks
- **Timeframes**: 5m, 15m, 60m, 1D

### Six-Part Architecture

```
┌─────────────────────────────────────────────┐
│ Part 1: Candle Foundation                   │ (Session, Normalization, Validation)
└─────────────────────────────────────────────┘
                    ↓
┌─────────────────────────────────────────────┐
│ Part 2: MTF & Look-Ahead Safety             │ (Multi-timeframe snapshots)
└─────────────────────────────────────────────┘
                    ↓
┌─────────────────────────────────────────────┐
│ Part 3: Structure Engine                    │ (Swings, BOS, CHOCH)
└─────────────────────────────────────────────┘
                    ↓
┌─────────────────────────────────────────────┐
│ Part 4: Regime Engine                       │ (Uptrend, Downtrend, Range)
└─────────────────────────────────────────────┘
                    ↓
┌─────────────────────────────────────────────┐
│ Part 5: Level & Location Engine             │ (Levels, gaps, interactions)
└─────────────────────────────────────────────┘
                    ↓
┌─────────────────────────────────────────────┐
│ Part 6: Setup Qualification Engine          │ (Pullback & Breakout setups)
└─────────────────────────────────────────────┘
```

---

## Architecture & Layers

### Folder Structure

```
src/
├── domain/                 # Core business logic (pure, immutable)
│   ├── candle.ts          # Candle model & CandleCalculator
│   ├── timeframe.ts       # Timeframe enum & validation
│   ├── session.ts         # Session boundaries & timezone handling
│   ├── mtf-snapshot.ts    # Multi-timeframe immutable snapshot
│   ├── structure-*.ts     # Structure detection (Part 3)
│   ├── regime-*.ts        # Regime classification (Part 4)
│   ├── level-*.ts         # Level discovery & location (Part 5)
│   ├── setup-*.ts         # Setup qualification (Part 6)
│   └── ...
├── persistence/           # Database interfaces & implementations
│   ├── candle-repository.interface.ts
│   └── supabase-candle-repository.ts
├── adapters/              # Broker & external service adapters
│   ├── broker-adapter.interface.ts
│   └── angel-one-adapter.ts
├── h2/                    # H2 Historical Validation Framework
│   ├── h2-contracts.ts           # Causality & causal context
│   ├── h2-orchestrator.ts        # Main H2 orchestration
│   ├── h2-dataset-integrity.ts   # Dataset verification
│   ├── h2-causal-context.ts      # Immutable evaluation contexts
│   ├── h2-execution-recorder.ts  # Execution & metrics recording
│   └── h2-validation-framework.ts # Full causality/determinism guarantee
├── historical/            # CSV import, datasets, replay
│   ├── csv-importer.ts
│   ├── data-validator.ts
│   ├── replay-engine.ts
│   ├── dataset-manifest.ts
│   └── timestamp-parser.ts
├── infrastructure/        # Logging, error handling, context
│   ├── logger.ts
│   ├── error-handler.ts
│   └── operation-context.ts
├── scripts/               # One-off scripts for testing/validation
│   ├── h1-pilot-real-data.ts
│   ├── h2-run-backtest.ts
│   └── ...
└── __tests__/             # Test suites (one per module)
    ├── structure-engine.test.ts
    ├── regime-engine-*.test.ts
    ├── level-engine-*.test.ts
    ├── h2/                # H2-specific tests
    └── ...
```

### Layering & Dependencies

**Strict Dependency Order**:

```
Domain Layer (no external deps except date-fns)
    ↓
Persistence Layer (depends on Domain)
    ↓
Adapter Layer (depends on Domain + Persistence)
    ↓
H2 Framework (depends on all above)
    ↓
Scripts & Tests (depend on all)
```

**No circular dependencies**. Domain layer is 100% testable in isolation.

---

## Part 1: Foundation & Candle Engine

### Overview

Part 1 establishes the data foundation: session-aligned candle calculations, timezone handling, and validation.

### Key Components

#### **1.1 Session & Timezone**
**File**: `src/domain/session.ts`

- **Session Boundaries**: 09:15–15:30 IST (hardcoded)
- **Timezone**: Asia/Kolkata (UTC+5:30)
- **Storage**: All timestamps in UTC
- **Conversion**: Uses `date-fns-tz` for UTC ↔ IST conversions
- **Rule**: Data created/queried in IST, stored/transmitted in UTC

**Key Methods**:
```typescript
SessionTime.getSessionOpenTimeIST()      // 09:15
SessionTime.getSessionCloseTimeIST()     // 15:30
SessionTime.isWithinSession(dateUTC)     // Boolean
SessionTime.convertToIST(dateUTC)        // Date in IST timezone
```

#### **1.2 Timeframe & Candle**
**File**: `src/domain/timeframe.ts`, `src/domain/candle.ts`

**Timeframes**:
- `FIVE_MIN` (5m): Close at 09:20, 09:25, ..., 15:25 (61 candles/session)
- `FIFTEEN_MIN` (15m): Close at 09:30, 09:45, ..., 15:15 (27 candles/session)
- `SIXTY_MIN` (60m): Close at 10:15, 11:15, ..., 15:15 (6 candles/session)
- `DAILY` (1D): Close at 15:30 (1 candle/session)

**Critical Rule**: 15:15–15:30 is **NOT** a 60m candle (remainder only).

**Candle Model**:
```typescript
class Candle {
  symbol: string;                  // e.g., "RELIANCE"
  timeframe: Timeframe;            // 5m, 15m, 60m, 1D
  openTimeUTC: Date;               // Candle open (UTC)
  closeTimeUTC: Date;              // Candle close (UTC)
  ohlc: { open, high, low, close, volume }
  status: CandleStatus;            // DEVELOPING or CLOSED
  knowledgeTimeUTC: Date;          // When data became known (usually = closeTime)
  id: string;                      // Deterministic: symbol-timeframe-openTimeMs
}
```

**CandleStatus**:
- `DEVELOPING`: Candle still forming, partial data
- `CLOSED`: Candle confirmed at close time (safe for analysis)

#### **1.3 Candle Calculation**
**File**: `src/domain/candle.ts` → `CandleCalculator`

**Algorithm**:
1. Input: Time (UTC) + Timeframe
2. Convert to IST
3. Determine which candle the time falls into
4. Return {openTimeIST, closeTimeIST} as UTC

**Example**:
```
Input:  2026-08-21 04:30 UTC, Timeframe.FIVE_MIN
        (= 2026-08-21 09:30 IST)
Output: Open: 2026-08-21 09:25 IST (04:05 UTC)
        Close: 2026-08-21 09:30 IST (03:60 UTC = 04:00 UTC)
```

#### **1.4 Candle Validation**
**File**: `src/domain/candle-validator.ts`

**Validates**:
1. **No duplicates**: (symbol, timeframe, openTimeUTC) must be unique
2. **No missing candles**: Gaps detected and reported
3. **No out-of-order data**: Candles arriving out of sequence flagged
4. **No look-ahead leaks**: DEVELOPING candles not treated as confirmed
5. **Status consistency**: CLOSED status only at boundary times

**Result**:
```typescript
interface ValidationResult {
  valid: boolean;
  errors: ValidationError[];
}
```

### Part 1 Test Coverage

- ✅ Session boundaries (open at 09:15, close at 15:30)
- ✅ Candle calculations for all timeframes
- ✅ Remainder handling (15:15–15:30 not 60m)
- ✅ UTC/IST conversions
- ✅ Duplicate detection
- ✅ Missing candle detection
- ✅ Out-of-order detection
- ✅ Status transitions (DEVELOPING → CLOSED)

**Test Files**:
- `src/__tests__/session.test.ts` (timezone handling)
- `src/__tests__/candle-calculator.test.ts` (boundary calculations)
- `src/__tests__/candle-validator.test.ts` (validation rules)
- `src/__tests__/timeframe.test.ts` (timeframe model)

### Part 1 Frozen Rules

These rules are **locked and never change**:

1. Session always 09:15–15:30 IST
2. Timezone always Asia/Kolkata for session boundaries
3. All storage always UTC
4. Timeframe candle counts fixed (61, 27, 6, 1 per session)
5. 15:15–15:30 never treated as 60m candle
6. Knowledge time default always = close time

---

## Part 2: Look-Ahead Safety & MTF Synchronization

### Overview

Part 2 prevents accidental leaks of future data by enforcing **strict causality** and creates synchronized **multi-timeframe snapshots** for analysis.

### Key Concepts

#### **2.1 No-Look-Ahead Principle**

**Core Rule**: At evaluation time T, only data with timestamp ≤ T is accessible.

**Implementation**:
- Every snapshot takes an `asOfTimeUTC` parameter
- All operations filter data: `candle.closeTimeUTC <= asOfTimeUTC`
- Violations throw `NoLookAheadError` with clear diagnostics

**Example Violation**:
```typescript
// WRONG: Accessing 10:30 IST candle at 10:15 IST
const snapshot = StructureEngine.getStructureSnapshot(
  candles,
  new Date('2026-08-21T04:45:00Z'),  // 10:15 IST
  'RELIANCE',
  Timeframe.from(TimeframeValue.FIVE_MIN),
);
// If candles include 10:30 IST close data → ERROR

// RIGHT: Only candles closed by 10:15
```

#### **2.2 Multi-Timeframe Snapshots (MTF)**
**File**: `src/domain/mtf-snapshot.ts`

**Definition**:
```typescript
class MTFSnapshot {
  asOfTimeUTC: Date;
  symbol: string;
  
  // Four timeframe snapshots, all evaluated at same moment
  snapshot5m: StructureSnapshot;
  snapshot15m: StructureSnapshot;
  snapshot60m: StructureSnapshot;
  snapshot1D: StructureSnapshot;
  
  // Immutable after creation
  seal(): void  // Prevents future modifications
}
```

**Guarantee**: All four snapshots evaluated at **exact same time** for consistency.

#### **2.3 Immutability & Defensive Copies**
**File**: `src/domain/mtf-snapshot.ts`

**Strategy**:
1. Constructor seals immediately after creation
2. `Object.seal()` prevents property addition/deletion
3. Array properties returned as shallow copies (prevent external mutation)
4. Snapshots are frozen; no setters

**Benefit**: Safe to pass around code without fear of modification.

### Part 2 Test Coverage

- ✅ No-look-ahead enforcement (violations detected)
- ✅ Look-ahead error diagnostics
- ✅ MTF snapshot creation
- ✅ Immutability verification
- ✅ Defensive copy behavior
- ✅ Synchronized timeframe evaluation

**Test Files**:
- `src/__tests__/no-look-ahead-validator.test.ts`
- `src/__tests__/mtf-snapshot.test.ts`
- `src/__tests__/mtf-snapshot-immutability.test.ts`

### Part 2 Design Decisions

| Decision | Rationale |
|----------|-----------|
| asOfTimeUTC parameter everywhere | Explicit causality at every call site |
| Defensive copies for arrays | Prevent external mutation after seal |
| Exceptions for look-ahead violations | Loud failure > silent bugs |
| Same evaluation time for all TFs | Consistency across multi-timeframe analysis |

---

## Part 3: Structure Engine

### Overview

Part 3 detects **swing points** (structural extremes) and identifies **structural breaks** (BOS: Break of Structure, CHOCH: Change of Character).

### Key Concepts

#### **3.1 Swings & Swing Detection**

**Swing Point**: A local high or low that exceeds adjacent bars by configured thresholds.

**Two Types**:
- `HIGH`: Local maximum
- `LOW`: Local minimum

**Confirmation Logic**:
```
For a swing to be CONFIRMED:
1. At least one bar left of it
2. At least one bar right of it (the "rightBar")
3. For HIGH: midpoint(high1, rightBar.high) > previous_extreme
4. For LOW: midpoint(low1, rightBar.low) < previous_extreme
```

**File**: `src/domain/swing-detector.ts`, `src/domain/swing-point.ts`

#### **3.2 Structure Classification**

**Four Structure Types**:
- `HH` (Higher High): Current high > previous high
- `HL` (Higher Low): Current low > previous low (but high ≤ previous high)
- `LH` (Lower High): Current high < previous high
- `LL` (Lower Low): Current low < previous low

**Files**: `src/domain/structure-calculator.ts`, `src/domain/structure-state.ts`

#### **3.3 Break of Structure (BOS)**

**Definition**: Price breaks through recent structural extreme in direction of trend.

**Example**:
- Uptrend with structure `HH/HL` (higher highs, higher lows)
- Break happens when low falls below last HL (lower low) → BOS DOWN detected
- Signals potential trend reversal

**Detection**:
```typescript
interface BOSEvent {
  type: 'BOS_UP' | 'BOS_DOWN';
  eventTime: Date;        // When break occurred
  breachLevel: number;    // Price level that was broken
  candleIndex: number;    // Which candle caused break
}
```

**File**: `src/domain/structure-engine.ts`

#### **3.4 Change of Character (CHOCH)**

**Definition**: Market forms opposing structure (HL instead of HH, or LH instead of LL).

**Example**:
- Uptrend forms HH, HL, HH, HL (higher highs & lows)
- Then forms LH (lower high than previous) → Character change to downtrend momentum

**Detection**:
```typescript
interface CHOCHEvent {
  type: 'CHOCH_UP' | 'CHOCH_DOWN';
  eventTime: Date;        // When character change occurred
  confirmationCandle: Candle;
  priorStructure: StructureType;
  newStructure: StructureType;
}
```

### Part 3 Architecture

**File**: `src/domain/structure-engine.ts`

**Main Entry**:
```typescript
StructureEngine.getStructureSnapshot(
  candles: Candle[],
  asOfTimeUTC: Date,
  symbol: string,
  timeframe: Timeframe,
  config?: StructureConfig,
): StructureSnapshot
```

**Output**:
```typescript
class StructureSnapshot {
  asOfTimeUTC: Date;
  confirmedSwings: SwingPoint[];    // Confirmed swing extremes
  structureState: StructureState;   // Current HH/HL/LH/LL/Initial
  bosEvents: BOSEvent[];             // All BOS events detected
  chochEvents: CHOCHEvent[];          // All CHOCH events detected
}
```

### Part 3 Test Coverage

**30 comprehensive deterministic tests**:
- ✅ Single swing detection
- ✅ Multiple swings in sequence
- ✅ Swing confirmation rules (at least 1 bar left, 1+ bar right)
- ✅ HH structure classification
- ✅ HL structure classification
- ✅ LH structure classification
- ✅ LL structure classification
- ✅ Structure type transitions
- ✅ BOS detection (up/down)
- ✅ CHOCH detection (up/down)
- ✅ Initial structure state
- ✅ Multi-swing BOS chains
- ✅ Causality: confirmed vs unconfirmed swings
- ✅ Look-ahead prevention in swing confirmation
- ✅ Edge cases (single bar, boundary conditions)

**Test Files**:
- `src/__tests__/structure-engine.test.ts` (main tests)
- `src/__tests__/structure-engine-*.test.ts` (edge cases)

### Part 3 Frozen Rules

1. Swing must have ≥1 bar left, ≥1 bar right
2. HH: high > prior high
3. HL: low > prior low (structure not yet reversed)
4. LH: high < prior high
5. LL: low < prior low
6. BOS requires breaking structural extreme
7. CHOCH requires forming opposing structure

---

## Part 4: Regime Engine

### Overview

Part 4 classifies market **regime** (trend direction and state) based on structure evolution across multiple timeframes.

### Key Concepts

#### **4.1 Regime Types**

**Four Primary Regimes**:
- `UPTREND`: Higher highs & higher lows (HH + HL structure)
- `DOWNTREND`: Lower highs & lower lows (LH + LL structure)
- `RANGE`: Oscillating (mixed HL/LH without clear direction)
- `INITIAL`: Unknown (insufficient data)

**File**: `src/domain/regime-state.ts`

#### **4.2 Regime Detection Logic**

**Algorithm** (from `RegimeEvaluator`):

```
1. Collect confirmed swings from structure snapshot
2. If < 2 swings → INITIAL regime
3. Examine last 2-3 swings for pattern:
   - Both HH + HL → UPTREND
   - Both LH + LL → DOWNTREND
   - Alternating or mixed → RANGE
4. Consider BOS/CHOCH events:
   - Recent BOS in opposite direction → Regime shift likelihood
```

**File**: `src/domain/regime-evaluator.ts`

#### **4.3 Multi-Timeframe Regime**

**Process**:
1. Evaluate regime on 1D timeframe (primary)
2. Evaluate regime on 60m timeframe (secondary)
3. Evaluate regime on 15m timeframe (tactical)
4. Evaluate regime on 5m timeframe (execution)

**Combination Rules**:
- If 1D is UPTREND:
  - 60m UPTREND → strong long bias (HIGH_CONVICTION_UP)
  - 60m DOWNTREND → pullback (LOW_CONVICTION_UP)
  - 60m RANGE → consolidation (NEUTRAL_UP)
- Similar logic for 1D DOWNTREND and RANGE

**File**: `src/domain/regime-engine.ts`

#### **4.4 Regime State Machine**

**State Transitions**:
```
INITIAL → (any regime after first 2 swings)
  ↓
UPTREND ← → DOWNTREND
  ↓ ↕ ↓
  RANGE ← → (any)
```

**Transition Conditions**:
- BOS event → check regime shift
- CHOCH event → likely regime change
- Structure swing → re-evaluate

**File**: `src/domain/regime-state-machine.ts`

### Part 4 Architecture

**Main Entry**:
```typescript
RegimeEngine.getRegimeSnapshot(
  candles: Candle[],
  asOfTimeUTC: Date,
  symbol: string,
  structureConfig?: StructureConfig,
  previousRegimeSnapshot?: RegimeSnapshot,
): RegimeSnapshot
```

**Output**:
```typescript
class RegimeSnapshot {
  asOfTimeUTC: Date;
  symbol: string;
  
  // Regime classification per timeframe
  regime1D: RegimeType;
  regime60m: RegimeType;
  regime15m: RegimeType;
  regime5m: RegimeType;
  
  // Composite regime (multi-TF consensus)
  compositeRegime: RegimeType;
  conviction: 'HIGH' | 'MEDIUM' | 'LOW';
  
  // Evidence (swings, BOS/CHOCH leading to this regime)
  evidence: RegimeEvidence[];
}
```

### Part 4 Test Coverage

**Integration + Unit Tests**:
- ✅ Regime classification (all 4 types: UPTREND, DOWNTREND, RANGE, INITIAL)
- ✅ Multi-timeframe regime synthesis
- ✅ Conviction scoring
- ✅ State machine transitions
- ✅ BOS/CHOCH impact on regime
- ✅ Regime persistence through minor structure changes
- ✅ Look-ahead prevention
- ✅ Deterministic output (same input → same regime)

**Test Files**:
- `src/__tests__/regime-engine-unit.test.ts` (individual components)
- `src/__tests__/regime-engine-integration.test.ts` (end-to-end)
- `src/__tests__/regime-engine-hardening.test.ts` (edge cases)

### Part 4 Design Decisions

| Decision | Rationale |
|----------|-----------|
| Multi-TF regime synthesis | Single TF misleading; consensus better for direction |
| Conviction scoring | HIGH conviction regime more reliable than LOW |
| Evidence tracking | Explainability: why is market in this regime? |
| State machine | Explicit state transitions > implicit regime switching |

---

## Part 5: Level & Location Engine

### Overview

Part 5 identifies **structural levels** (support/resistance) and analyzes **level interactions** (price approaching, breaking, retesting levels).

### Key Concepts

#### **5.1 Levels: Origin & Polarity**

**Level Definition**:
```typescript
class Level {
  value: number;              // Price level (e.g., 2500.50)
  origin: LevelOrigin;        // How level was discovered
  polarity: LevelPolarity;    // SUPPORT or RESISTANCE
  discoveredAt: Date;         // When level first appeared
  confirmedAt: Date;          // When level confirmed
  strength: number;           // 1-10 (tested more = stronger)
}
```

**Level Origin** (where level comes from):
- `PRIOR_DAY_HIGH` / `PRIOR_DAY_LOW`: Yesterday's extremes
- `PRIOR_WEEK_HIGH` / `PRIOR_WEEK_LOW`: Week's extremes
- `PRIOR_MONTH_HIGH` / `PRIOR_MONTH_LOW`: Month's extremes
- `SWING_HIGH` / `SWING_LOW`: Structure swing points
- `SESSION_OPEN`: Today's session open price
- `GAP_EDGE`: Gap between yesterday close and today open

**Level Polarity**:
- `SUPPORT`: Level below current price (upside resistance if broken)
- `RESISTANCE`: Level above current price (downside support if broken)

**File**: `src/domain/level.ts`

#### **5.2 Gap Analysis**

**Gap Definition**: Difference between yesterday's close and today's open.

**Types**:
- `UP_GAP`: Today's open > yesterday's close (bullish)
- `DOWN_GAP`: Today's open < yesterday's close (bearish)
- `NO_GAP`: No gap

**Mechanism**: Gap edge becomes a level (support for down gap, resistance for up gap).

**File**: `src/domain/level-event.ts`

#### **5.3 Level Interactions: Approach, Break, Retest**

**Three Events**:

**A. Approach** (price nearing level):
```typescript
interface LevelEvent {
  type: 'APPROACH';           // Price within tolerance range
  level: Level;
  eventTime: Date;
  price: number;
  tolerancePercent: number;
}
```

**B. Break** (price crossing level):
```typescript
interface LevelEvent {
  type: 'BREAK';              // Price crosses level decisively
  level: Level;
  eventTime: Date;
  direction: 'UP' | 'DOWN';
  breakMechanism: BreakMechanism;  // CLEAN, WICK_ONLY, etc.
}
```

**C. Retest Interaction** (price returns to broken level):
```typescript
interface LevelEvent {
  type: 'RETEST_INTERACTION';
  level: Level;
  breakTime: Date;            // When level was first broken
  retestTime: Date;           // When price returned
  retestPrice: number;
  bounceDirection: 'UP' | 'DOWN';
  touchBars: number;          // How many bars at retest level
}
```

**D. Failed Break** (price starts break but reverses):
```typescript
interface LevelEvent {
  type: 'FAILED_BREAK';       // Break started then reversed
  level: Level;
  attemptTime: Date;
  failureTime: Date;
  reversalStrength: 'WEAK' | 'MEDIUM' | 'STRONG';
}
```

**File**: `src/domain/level-event.ts`

#### **5.4 K-Nearest Levels & Location Snapshot**

**K-Nearest Concept**:
- Instead of all levels, expose only K closest levels
- Reduces noise while keeping relevant support/resistance

**Configuration**:
```typescript
interface LevelEngineConfig {
  k: number;                  // 3-5 nearest levels (default: 3)
  maxBarsFailedBreak: number; // Bars to detect failed break
  maxBarsAfterBreak: number;  // Bars for retest validity
  rulesetVersion: string;
  configHash: string;
}
```

**LocationSnapshot**:
```typescript
class LocationSnapshot {
  asOfTimeUTC: Date;
  symbol: string;
  
  // K nearest levels per timeframe
  kNearestLevels5m: Level[];   // Top K levels (nearest to current price)
  kNearestLevels15m: Level[];
  kNearestLevels60m: Level[];
  kNearestLevels1D: Level[];
  
  // Recent level interactions (last 10-20)
  recentEvents: LevelEvent[];
  
  // Geometry: distance to nearest support/resistance
  geometry: LocationGeometry;
  dataSufficiency: DataSufficiency;  // SUFFICIENT | INSUFFICIENT
}
```

**File**: `src/domain/location-snapshot.ts`

#### **5.5 Market Calendar Limitations**

**Supported**:
- Normal session hours (09:15–15:30 IST)
- Weekend detection (Saturday/Sunday)

**NOT Supported** (known gaps):
- Exchange holidays (Independence Day, Holi, Diwali, etc.)
- Muhurat trading sessions
- Gap days (holiday-adjacent)
- Expiry-day special handling
- Shortened sessions

**Implication**:
- Prior-period (PRIOR_DAY, PRIOR_WEEK, PRIOR_MONTH) levels may span holidays incorrectly
- Gap-edge levels between trading days separated by holidays not marked as special

**Workaround**:
- Part 5 works correctly for contiguous trading periods
- Holiday handling requires external filtering at Part 6 level

### Part 5 Architecture

**Main Entry**:
```typescript
LevelEngine.getLocationSnapshot(
  candles: Candle[],
  asOfTimeUTC: Date,
  symbol: string,
  config: LevelEngineConfig,
): LocationSnapshot
```

**Processing**:
1. Identify prior-period extremes (PRIOR_DAY, PRIOR_WEEK, PRIOR_MONTH)
2. Extract swings from structure snapshots (all TFs)
3. Detect gaps
4. Compile all level sources
5. Calculate current price location
6. Select K-nearest levels
7. Detect interactions (approach, break, retest, failed break)
8. Assemble LocationSnapshot

### Part 5 Test Coverage

**Extensive deterministic tests**:
- ✅ Prior-period level discovery (PRIOR_DAY, PRIOR_WEEK, PRIOR_MONTH)
- ✅ Swing levels (from structure snapshots)
- ✅ Gap detection & gap-edge levels
- ✅ Level strength scoring
- ✅ K-nearest selection
- ✅ Approach detection (tolerance range)
- ✅ Break detection (clean vs wick-only)
- ✅ Failed break detection
- ✅ Retest interaction detection
- ✅ Period boundary handling (day change, week change, month change)
- ✅ Multi-timeframe level synthesis
- ✅ Edge cases (single level, many levels, no gaps)

**Test Files**:
- `src/__tests__/level-engine.test.ts` (main logic)
- `src/__tests__/level-engine-hardening.test.ts` (edge cases)
- `src/__tests__/level-engine-gap-detection.test.ts` (gap-specific tests)
- `src/__tests__/level-engine-final-audit.test.ts` (comprehensive audit)

---

## Part 6: Setup Qualification Engine

### Overview

Part 6 identifies **tradeable setups** by qualifying specific price action patterns (pullbacks and breakout-retests).

### Key Concepts

#### **6.1 Four Setup Families**

**1. PULLBACK_LONG**:
- Regime: UPTREND (structure HH/HL)
- Trigger: Price pulls back below last HL (makes lower low)
- Qualification: Price then recovers above HL
- Setup: Ready for long entry above HL

**2. PULLBACK_SHORT**:
- Regime: DOWNTREND (structure LH/LL)
- Trigger: Price rallies above last LH (makes higher high)
- Qualification: Price then fails below LH
- Setup: Ready for short entry below LH

**3. BREAKOUT_RETEST_LONG**:
- Regime: Mixed/Range or early breakout
- Trigger: Price breaks above resistance level decisively
- Qualification: Price pulls back to broken level and holds
- Setup: Ready for continuation long above retest level

**4. BREAKOUT_RETEST_SHORT**:
- Regime: Mixed/Range or early breakout
- Trigger: Price breaks below support level decisively
- Qualification: Price rallies back to broken level but fails
- Setup: Ready for continuation short below retest level

#### **6.2 Setup Qualification Conditions**

**Setup Status** (lifecycle):
- `DEVELOPING`: Pattern forming, not yet qualified
- `QUALIFIED`: All conditions met, ready to trade
- `TRIGGERED`: Price has taken entry action
- `ABORTED`: Setup invalidated (e.g., level broken opposite direction)

**Setup Evidence** (facts supporting qualification):
```typescript
interface SetupEvidence {
  type: 'REGIME_ALIGNMENT' | 'STRUCTURE_PATTERN' | 'LEVEL_INTERACTION' | 'GEOMETRY';
  timestamp: Date;
  description: string;
  confidence: number;  // 0-100
}
```

**File**: `src/domain/setup.ts`

#### **6.3 Setup Geometry**

**Key Measurements**:
```typescript
interface SetupGeometry {
  // Distance from current price to entry level
  distanceToEntry: number;
  
  // Risk (distance to stop-loss level)
  riskDistance: number;
  
  // Reward potential (distance to target level)
  rewardDistance: number;
  
  // Risk-Reward Ratio
  riskRewardRatio: number;  // reward / risk
  
  // Probability score (0-100)
  probabilityScore: number;
}
```

### Part 6 Architecture

**Main Entry**:
```typescript
SetupEngine.getSetupSnapshot(
  locationSnapshot: LocationSnapshot,
  structureSnapshot: StructureSnapshot,
  asOfTimeUTC: Date,
  symbol: string,
  config: SetupEngineConfig,
): SetupSnapshot
```

**Output**:
```typescript
class SetupSnapshot {
  asOfTimeUTC: Date;
  symbol: string;
  
  // All detected setups
  setups: Setup[];
  
  // Highest conviction setup (if any)
  primarySetup: Setup | null;
  
  // Trade plan (if qualified setup exists)
  tradePlan: TradePlan | null;
}

class Setup {
  type: SetupType;           // PULLBACK_LONG, etc.
  status: SetupStatus;       // DEVELOPING, QUALIFIED, etc.
  entryLevel: number;
  stopLoss: number;
  targetLevel: number;
  geometry: SetupGeometry;
  evidence: SetupEvidence[];
  confidence: number;        // 0-100
}
```

**File**: `src/domain/setup.ts`, `src/domain/setup-snapshot.ts`

### Part 6 Test Coverage

- ✅ PULLBACK_LONG qualification
- ✅ PULLBACK_SHORT qualification
- ✅ BREAKOUT_RETEST_LONG qualification
- ✅ BREAKOUT_RETEST_SHORT qualification
- ✅ Setup status transitions
- ✅ Evidence collection & scoring
- ✅ Geometry calculation (distance, ratio, probability)
- ✅ Multi-level consideration (multiple possible entries)
- ✅ Setup invalidation (regime change, level break)
- ✅ Trade plan generation
- ✅ Risk-reward assessment

**Test Files**:
- `src/__tests__/setup-engine.test.ts` (main logic)

---

## H2: Historical Validation & Backtest Framework

### Overview

H2 is a **historical validation layer** that runs frozen Parts 1–6 over historical datasets, enforcing strict causality, determinism, and performance benchmarks.

**Key Principle**: H2 is NOT a trading engine. It validates that Parts 1–6 produce correct, deterministic, causal outputs when replayed over past data.

### Architecture

#### **H2.1 Causal Context**

**Definition**: Immutable snapshot of information available at a specific evaluation time.

```typescript
interface CausalContext {
  asOfTimeUTC: Date;           // Evaluation moment (ISO 8601)
  datasetId: string;           // Which dataset
  datasetChecksum: string;     // Verification integrity
  symbol: string;              // "RELIANCE", "NIFTY50", etc.
  timeframe: string;           // "5m", "15m", "60m", "1D"
  datasetManifestPath: string; // Where to load data
}
```

**Guarantee**: All data accessed during evaluation must have timestamp ≤ asOfTimeUTC.

**Error**: `CausalityViolationError` thrown if T+1 data accessed at time T.

**File**: `src/h2/h2-contracts.ts`

#### **H2.2 Dataset Integrity**

**Dataset Manifest**:
```typescript
interface DatasetManifest {
  id: string;                    // Unique dataset ID
  version: string;               // Format version
  checksum: string;              // SHA256 of content
  symbol: string;
  timeframe: string;
  startTime: Date;
  endTime: Date;
  candleCount: number;
  sourceUrl?: string;
  importedAt: Date;
  metadata: Record<string, any>;
}
```

**Verification**:
1. Checksum match (ensure data hasn't changed)
2. Timeframe consistency
3. Candle continuity (no gaps, no duplicates)
4. Chronological order

**File**: `src/h2/h2-dataset-integrity.ts`

#### **H2.3 Orchestration & Replay**

**Replay Engine** (`src/historical/replay-engine.ts`):
```typescript
class ReplayEngine {
  // Load dataset
  async loadDataset(path: string): Promise<Candle[]>;
  
  // Replay evaluation at specific times
  replayAt(candles: Candle[], timestamps: Date[]): ReplayResult[];
  
  // Run backtest over entire dataset
  runBacktest(candles: Candle[], config: BacktestConfig): BacktestResult;
}
```

**H2 Orchestrator** (`src/h2/h2-orchestrator.ts`):
```typescript
class H2Orchestrator {
  // Run full validation (all Parts 1–6) at each timestamp
  async validateDataset(
    manifest: DatasetManifest,
    evalTimestamps: Date[],
  ): Promise<ValidationReport>;
  
  // Check determinism (run twice, compare outputs)
  async validateDeterminism(
    manifest: DatasetManifest,
  ): Promise<DeterminismReport>;
  
  // Check causality (no forward data access)
  async validateCausality(
    manifest: DatasetManifest,
  ): Promise<CausalityReport>;
}
```

**File**: `src/h2/h2-orchestrator.ts`

#### **H2.4 Execution Recording**

**Metrics Tracked**:
```typescript
interface ExecutionRecord {
  evalTime: Date;
  partsExecuted: {
    part1Candle: CandleSnapshot;
    part2MTF: MTFSnapshot;
    part3Structure: StructureSnapshot;
    part4Regime: RegimeSnapshot;
    part5Location: LocationSnapshot;
    part6Setup: SetupSnapshot;
  };
  performanceMetrics: {
    executionTimeMs: number;
    memoryUsedMB: number;
  };
  outputs: {
    setupQualified: boolean;
    primarySetupType: string | null;
  };
}
```

**File**: `src/h2/h2-execution-recorder.ts`

#### **H2.5 Performance Optimization**

**Warm-up Strategy** (`src/h2/h2-warm-up.ts`):
- Pre-load dataset into memory
- Pre-calculate swing points (avoid re-calculation)
- Index levels by price proximity
- Cache structure snapshots for repeated evaluations

**Optimization Trade-offs**:
- ✅ Gains: 10-100x faster per evaluation
- ⚠️ Cost: Higher memory usage
- ⚠️ Risk: Cache invalidation if data changes (safeguarded by checksum)

**File**: `src/h2/h2-warm-up.ts`

#### **H2.6 Full Causality & Determinism Guarantee**

**Validation Framework** (`src/h2/h2-validation-framework.ts`):

```typescript
class H2ValidationFramework {
  // Guarantee 1: Determinism
  async validateDeterminism(): Promise<void> {
    // Run each evaluation twice, compare every output
    // If outputs differ → FAIL
  }
  
  // Guarantee 2: Causality
  async validateCausality(): Promise<void> {
    // For each evaluation at time T:
    //   - Verify no candle.closeTimeUTC > T
    //   - Verify no future data in swings, levels, setups
    //   - Throw CausalityViolationError if violated
  }
  
  // Guarantee 3: Immutability
  async validateImmutability(): Promise<void> {
    // Verify all snapshots are sealed
    // Attempt to modify → should fail
  }
}
```

### H2 Scripts & Utilities

#### **1. `h2-run-backtest.ts`**
Runs full backtest on a dataset:
```
npm run h2:backtest --dataset=RELIANCE_5m_2026-08-01_to_2026-08-21
```

Outputs:
- Execution timeline (each evaluation point)
- Setup qualifications over time
- Performance metrics

#### **2. `h2-diagnostic-small-dataset.ts`**
Diagnoses issues with a small dataset (first 50 candles):
```
npm run h2:diagnose --dataset=TEST_RELIANCE_5m
```

Outputs:
- Causality violations (if any)
- Determinism failures (if any)
- Memory profiling

#### **3. `h2-performance-benchmark.ts`**
Measures performance across different dataset sizes:
```
npm run h2:benchmark
```

Outputs:
- Time per evaluation (ms)
- Memory per evaluation (MB)
- Scalability curve

### H2 Test Coverage

- ✅ Causality validation (no T+1 access at time T)
- ✅ Determinism validation (same input → same output)
- ✅ Immutability validation (sealed snapshots)
- ✅ Dataset integrity checks
- ✅ Performance profiling
- ✅ Execution recording
- ✅ Replay accuracy

**Test Files**:
- `src/__tests__/h2/h2-causality-context.test.ts`
- `src/__tests__/h2/h2-determinism.test.ts`
- `src/__tests__/h2/h2-look-ahead.test.ts`
- `src/__tests__/h2/h2-integration.test.ts`

### H2 Known Issues & Resolutions

#### **Issue 1: Full-Dataset Optimization (REJECTED)**
**Problem**: Loading entire dataset into memory + pre-computing all swings across history caused:
- OOM errors on large datasets (>1 year of daily data)
- Cache invalidation complexity
- Warm-up time overhead

**Resolution**: Reject full-dataset optimization. Use sliding-window approach:
- Load only relevant historical window (configurable)
- Compute swings on-demand
- Trade small memory savings for safety

**Decision Commit**: `c120b85` (H2: reject unsafe full-dataset optimization)

#### **Issue 2: Performance vs Safety Trade-off**
**Problem**: Aggressive caching improved speed but risked stale cache data.

**Resolution**: 
- Keep checksums immutable
- Every dataset load verifies checksum before cache use
- Re-compute if mismatch → safety > performance

**File**: `src/h2/h2-dataset-integrity.ts`

---

## Current Status & Work Done

### Completed Components

| Component | Status | Test Coverage | Notes |
|-----------|--------|---------------|-------|
| Part 1: Candles & Session | ✅ Complete | 14 test categories | Frozen, no changes |
| Part 2: Look-Ahead & MTF | ✅ Complete | Full coverage | Causality enforced |
| Part 3: Structure Engine | ✅ Complete | 30+ tests | Swings, BOS, CHOCH |
| Part 4: Regime Engine | ✅ Complete | Integration + unit | Multi-TF synthesis |
| Part 5: Level & Location | ✅ Complete | 50+ tests | K-nearest, interactions |
| Part 6: Setup Qualification | ✅ Complete | Core tests | 4 setup families |
| H2: Historical Framework | 🔄 In Progress | 80% | Performance optimization active |

### Recent Commits

```
c120b85  H2: reject unsafe full-dataset optimization
19b6b86  H2: complete performance architecture investigation
fb565c0  Implement H2 validation framework with full causality and determinism guarantees
226ea7a  Part 5 Hardening: Documentation + Gap Detection + Test Coverage
fb0ef76  Implement Part 6 — Deterministic Setup Qualification Engine
ad0c0d5  Part 5 Hardening - Implement FAILED_BREAK, RETEST_INTERACTION, and Period Boundaries
c6fee14  Implement Part 5 - Deterministic Level & Location Engine
2f1c3c9  Add Part 4 hardening verification tests
597368e  Harden Part 4 - Correct RANGE classification and preserve structural direction
4b712f4  Implement Part 4 - Deterministic Regime Engine
```

### Current Branch: `feature/h2-performance-optimization`

**Focus**: Finalizing H2 historical validation framework.

**Recent Work**:
1. ✅ Implemented full causal context system
2. ✅ Built determinism validation (run twice, compare)
3. ✅ Built causality validation (no T+1 access)
4. ✅ Investigated full-dataset optimization (rejected as unsafe)
5. 🔄 Finalizing performance benchmarks

**Next Steps**:
- Complete performance profiling
- Document performance expectations
- Merge to main
- Begin Part 7: Live Data Integration (Angel One)

---

## Key Design Decisions

### 1. Deterministic Outputs Over Explanations

**Decision**: Every output is deterministic; no randomness or heuristics.

**Why**: 
- Reproducible results → debugging easier
- Testable with frozen test data
- Safe for trading (same conditions → same action)

**Trade-off**: Requires explicit rule definitions (no fuzzy logic).

### 2. Immutability & Sealing

**Decision**: Snapshots are sealed after creation; prevent external modification.

**Why**:
- Snapshots passed around codebase safely
- No accidental mutations
- Thread-safe (immutability = thread-safe for read)

**Trade-off**: Cannot update snapshots; must create new ones.

### 3. Strict Causality Enforcement

**Decision**: Every operation must take `asOfTimeUTC` parameter; violations throw errors.

**Why**:
- Prevents look-ahead bias (main killer of trading systems)
- Catches errors early (loud failures)
- Forces explicit causality thinking

**Trade-off**: Verbose; every call must provide evaluation time.

### 4. Multi-Timeframe Composition

**Decision**: Regimes, levels, and setups synthesized across 4 timeframes simultaneously.

**Why**:
- Single TF misleading (5m noise, 1D too coarse)
- Consensus across TFs robust
- Matches trader intuition (always check multiple TFs)

**Trade-off**: 4x computation cost per evaluation.

### 5. K-Nearest Levels (Not All Levels)

**Decision**: Expose top K closest levels, not all levels.

**Why**:
- Noise reduction (distant levels irrelevant)
- Focus on actionable levels
- Simplifies trade planning

**Trade-off**: May miss important levels outside K.

### 6. Regime Conviction Scoring

**Decision**: Regime confidence scored LOW/MEDIUM/HIGH based on evidence strength.

**Why**:
- Helps traders weight decisions
- HIGH conviction regime more actionable
- Communicates uncertainty

**Trade-off**: Requires explicit confidence model.

### 7. Composition Over Inheritance

**Decision**: Each engine composes outputs from prior engines (Part 4 uses Part 3 output, etc.).

**Why**:
- Dependency chain clear & testable
- Easy to trace from setup back to candle
- No circular dependencies

**Trade-off**: Cannot swap Part 4 without rewriting Part 5.

### 8. Frozen Rules & No Version Compat

**Decision**: Each part's rules frozen; never change rules backward-compatibly.

**Why**:
- Clear semantics (no ambiguity)
- Easier testing (rule ≠ rule')
- Forces explicit decisions (add new rule, don't bend old one)

**Trade-off**: New rule = new engine version.

---

## Testing & Validation Strategy

### 1. Deterministic Tests

**Principle**: Input frozen, output frozen; assert output ≡ expected.

**Example**:
```typescript
it('should detect HH structure', () => {
  const candles = [
    { low: 100, high: 110 },
    { low: 105, high: 120 },  // HH: high 120 > prev 110
    { low: 110, high: 125 },  // HH: high 125 > prev 120
  ];
  const structure = StructureEngine.getStructureSnapshot(
    candles, asOfTime, 'TEST', Timeframe.FIVE_MIN,
  );
  expect(structure.structureState.type).toBe('HH');
});
```

### 2. Edge Case Coverage

**Tested Edges**:
- Single candle (no swings)
- Boundary times (09:15, 15:30)
- Weekend data (skipped)
- Session boundaries (last candle remainder)
- Gaps (approach, break, failed break, retest)
- Extreme volatility (wide wicks)
- Low volume periods
- Data discontinuities

### 3. Causality Validation

**Approach**:
- For each evaluation at time T, verify all data has timestamp ≤ T
- Throw `NoLookAheadError` if violation
- Log what data caused violation (for debugging)

### 4. Determinism Validation (H2)

**Approach**:
- Run evaluation twice on same input
- Compare every field of every output
- If differs → FAIL with diff

### 5. Immutability Validation (H2)

**Approach**:
- Attempt to modify sealed snapshot
- Should throw `TypeError: Cannot add property`
- Verify defensive copies work (modifying array copy doesn't affect snapshot)

### 6. Integration Tests

**Scope**: End-to-end Part 1–6 pipeline.

**Input**: Real (historical) dataset.

**Verification**:
- All parts execute
- No errors
- Outputs satisfy constraints
- Determinism holds
- Causality holds

---

## Known Limitations & Future Work

### Current Limitations

#### **1. Market Calendar**

**Supported**:
- Normal session hours (09:15–15:30 IST)
- Weekend detection

**NOT Supported**:
- Exchange holidays (Independence Day, Holi, Diwali, etc.)
- Muhurat trading sessions
- Gap days (holiday-adjacent)
- Expiry-day special handling
- Shortened pre-holiday sessions

**Impact**:
- Prior-period (PRIOR_DAY, PRIOR_WEEK, PRIOR_MONTH) levels may span holidays incorrectly
- No distinction between normal gaps and holiday gaps

**Mitigation**:
- Use external exchange calendar to filter data
- Skip holiday-adjacent sessions in analysis

#### **2. Live Data Integration**

**Status**: Not implemented yet.

**Current State**: Angel One broker adapter is placeholder only.

**Required**:
- WebSocket connection for live ticks
- Intraday candle assembly from ticks
- Reconciliation with historical data
- Causal time synchronization (no clock skew)

#### **3. Risk Management**

**Status**: Not implemented yet.

**Required**:
- Position sizing (Kelly criterion, fixed fractional, etc.)
- Stop-loss & take-profit calculation
- Portfolio-level risk (correlated instruments)
- Drawdown limits

#### **4. Order Execution**

**Status**: Not implemented yet.

**Required**:
- Order placement via broker API
- Partial fills handling
- Slippage modeling
- Execution timing (market open, close of session)

#### **5. Instrument Universe**

**Status**: Single-instrument focused (RELIANCE, NIFTY50).

**Required for Scale**:
- Sector scanning (auto-identify trending sectors)
- Correlations (avoid hedging pairs)
- Liquidity filtering (skip illiquid stocks)
- Momentum scoring (prioritize strong movers)

### Future Parts (Part 7+)

#### **Part 7: Live Data Integration**
- Angel One WebSocket connection
- Tick-to-candle aggregation
- Real-time causality checks
- Signal generation & decision framework

#### **Part 8: Risk Management**
- Stop-loss & profit target calculation
- Portfolio risk assessment
- Correlation analysis
- Drawdown monitoring

#### **Part 9: Order Execution**
- Broker order API integration
- Execution timing optimization
- Partial fill reconciliation
- Execution logging

#### **Part 10: Scanning & Universe Selection**
- Multi-stock scanning
- Sector analysis
- Liquidity filtering
- Momentum ranking

#### **Part 11: Walk-Forward Validation**
- Train on historical window
- Validate on subsequent window
- Rolling validation windows
- Performance degradation detection

---

## Build & Test Commands

```bash
# Install dependencies
npm install

# Run all tests
npm test

# Watch mode
npm test:watch

# Type checking
npm run type-check

# Build
npm build

# Lint
npm run lint
```

### Running H2 Scripts

```bash
# Run backtest on dataset
npx tsx src/scripts/h2-run-backtest.ts

# Diagnose small dataset
npx tsx src/scripts/h2-diagnostic-small-dataset.ts

# Performance benchmark
npx tsx src/scripts/h2-performance-benchmark.ts

# Real data validation (H1 pilot)
npx tsx src/scripts/h1-pilot-real-data.ts
```

---

## File Guide

### Core Domain Files
- `src/domain/candle.ts` — Candle model & calculator
- `src/domain/timeframe.ts` — Timeframe enum
- `src/domain/session.ts` — Session boundaries & timezone
- `src/domain/structure-engine.ts` — Part 3
- `src/domain/regime-engine.ts` — Part 4
- `src/domain/level-engine.ts` — Part 5
- `src/domain/setup-engine.ts` — Part 6

### H2 Files
- `src/h2/h2-contracts.ts` — Causality & contexts
- `src/h2/h2-orchestrator.ts` — Main orchestration
- `src/h2/h2-validation-framework.ts` — Full validation
- `src/h2/h2-dataset-integrity.ts` — Dataset checks

### Test Files
- `src/__tests__/structure-engine.test.ts` — Part 3 tests
- `src/__tests__/regime-engine-*.test.ts` — Part 4 tests
- `src/__tests__/level-engine-*.test.ts` — Part 5 tests
- `src/__tests__/h2/*.test.ts` — H2 tests

### Historical & Scripts
- `src/historical/replay-engine.ts` — Dataset replay
- `src/historical/csv-importer.ts` — CSV loading
- `src/scripts/h2-*.ts` — H2 utility scripts

---

## Contact & Support

**Project Repository**: https://github.com/shetsathi/cerebro-signals  
**Author**: Cerebro Signals Team  
**Last Updated**: 2026-08-22  

---

## Summary of Work Done (Session History)

### Session 1: Part 1 Foundation (Commit: ddc1347)
**Prompt**: Establish candle and time foundation for NSE market data.

**Deliverables**:
- Session boundaries (09:15–15:30 IST) frozen
- Timeframe enum (5m, 15m, 60m, 1D) defined
- UTC/IST timezone handling implemented
- Candle model with status tracking (DEVELOPING/CLOSED)
- CandleCalculator with deterministic boundaries
- Initial test coverage

### Session 2: Part 2 & MTF (Commit: f6d65d7)
**Prompt**: Implement look-ahead safety and MTF synchronization.

**Deliverables**:
- No-look-ahead validator (prevents T+1 access at time T)
- MTFSnapshot (synchronized multi-timeframe snapshots)
- Immutability enforcement (seal + defensive copies)
- Tests for causality violations and immutability

### Session 3: Part 3 Structure Engine (Commit: b783ace)
**Prompt**: Implement structure detection (swings, BOS, CHOCH).

**Deliverables**:
- SwingDetector (identifies local extremes)
- SwingPoint model (type, bar count, confirmation)
- StructureCalculator (HH/HL/LH/LL classification)
- BOSEvent (Break of Structure detection)
- CHOCHEvent (Change of Character detection)
- 30 comprehensive deterministic tests

### Session 4: Part 4 Regime Engine (Commits: 4b712f4, 597368e)
**Prompt**: Implement regime classification (uptrend, downtrend, range).

**Deliverables**:
- RegimeEvaluator (analyzes swing patterns)
- RegimeStateMachine (state transitions)
- Multi-timeframe regime synthesis
- Conviction scoring (HIGH/MEDIUM/LOW)
- Hardening: Fix RANGE classification, preserve structural direction
- Integration + unit tests

### Session 5: Part 5 Level & Location (Commits: c6fee14, ad0c0d5)
**Prompt**: Implement level discovery and location analysis.

**Deliverables**:
- Level model (origin, polarity, strength)
- Prior-period extremes (PRIOR_DAY, PRIOR_WEEK, PRIOR_MONTH)
- Gap detection & gap-edge levels
- K-nearest levels selection
- LevelEvent (approach, break, retest, failed break)
- LocationSnapshot with level interactions
- Period boundary handling
- Market calendar limitations documented
- 50+ deterministic tests

### Session 6: Part 6 Setup Engine (Commit: fb0ef76)
**Prompt**: Implement setup qualification (pullback, breakout-retest).

**Deliverables**:
- Four setup families: PULLBACK_LONG, PULLBACK_SHORT, BREAKOUT_RETEST_LONG, BREAKOUT_RETEST_SHORT
- Setup qualification rules
- SetupSnapshot with evidence & geometry
- Trade plan generation
- Risk-Reward calculation
- Tests for all setup types

### Session 7: H2 Framework (Commits: fb565c0, 19b6b86, c120b85)
**Prompt**: Build historical validation framework ensuring causality & determinism.

**Deliverables**:
- CausalContext (immutable evaluation contexts)
- CausalityViolationError (loud failures for T+1 access)
- H2Orchestrator (full pipeline validation)
- H2 determinism validation (run twice, compare)
- H2 causality validation (check all timestamps)
- Dataset integrity verification
- H2 warm-up strategy (sliding-window optimization)
- **REJECTED**: Full-dataset optimization (unsafe, OOM risk)
- Performance benchmarking framework
- Integration tests

### Session 8: Current (This Document)
**Prompt**: Create comprehensive context file documenting all work.

**Deliverables**:
- This CLAUDE.md file
- Complete documentation of all 6 parts
- H2 framework architecture
- Design decisions documented
- Testing strategy
- Known limitations & future work
- File guide & command reference

---

## Appendix: Key Formulas & Rules

### Candle Boundaries
```
Session Open: 09:15 IST
Session Close: 15:30 IST
Duration: 6 hours 15 minutes = 375 minutes

5m: 61 candles (09:15, 09:20, ..., 15:25)
15m: 27 candles (09:15, 09:30, ..., 15:15)
60m: 6 candles (09:15, 10:15, 11:15, 12:15, 13:15, 14:15)
1D: 1 candle (09:15–15:30)
```

### Structure Classifications
```
HH (Higher High): high_n > high_{n-1}
HL (Higher Low): low_n > low_{n-1} AND high_n ≤ high_{n-1}
LH (Lower High): high_n < high_{n-1}
LL (Lower Low): low_n < low_{n-1}
```

### Regime Identification
```
UPTREND: Last 2 swings are HH + HL
DOWNTREND: Last 2 swings are LH + LL
RANGE: Alternating or mixed structure, no clear HH/HL or LH/LL pattern
INITIAL: < 2 confirmed swings
```

### Level Interaction Events
```
APPROACH: abs(price - level) < tolerance_percent * level
BREAK: price crosses level decisively (closes opposite side)
FAILED_BREAK: price breaks but reverses within maxBarsFailedBreak
RETEST_INTERACTION: price returns to broken level within maxBarsAfterBreak
```

### Setup Qualification
```
PULLBACK_LONG:
  - Regime: UPTREND (HH/HL)
  - Last swing: HL (higher low)
  - Trigger: low < HL (new lower low = pullback)
  - Qualification: price recovers above HL
  - Entry: Above HL resistance

BREAKOUT_RETEST_LONG:
  - Regime: Any (often Range)
  - Trigger: price breaks above resistance
  - Qualification: retest of broken level, holds
  - Entry: Above retest level

(PULLBACK_SHORT, BREAKOUT_RETEST_SHORT follow same logic inverted)
```

---

## Part 7: Trigger Engine

**Status:** ✅ IMPLEMENTED & CORRECTED (2026-08-22)  
**Tests:** 21 tests (512 total, all passing) — 5 new regression tests for retest defense  
**Build:** TypeScript ✅, Tests ✅, Build ✅  

### Overview

Part 7 evaluates whether lower-timeframe (5m) price action has **confirmed** a qualified setup from Part 6.

**Key Principle:** QUALIFIED ≠ TRIGGERED, and RETEST_INTERACTION ≠ RETEST_HELD

A setup becoming QUALIFIED is not automatic entry. Trigger confirms that:
1. The market has provided the required lower-timeframe price action confirmation
2. The underlying retest/interaction has been successfully defended (not subsequently broken)

### Critical Correction — Option 4: Explicit Retest Defense Check

**Issue Identified:** Initial Part 7 implementation trusted current polarity state to infer retest defense, but Part 5 doesn't update polarity when retests fail (no flip-back logic). This created a cross-layer defect where failed retests could still trigger.

**Fix Applied:** Part 7 now explicitly checks event history to detect invalidating opposite breaks:
- After setup qualifies, Part 7 inspects LocationSnapshot.getAllEvents()
- For LONG setups: Searches for bearish BREAK events after the setup's interaction event
- For SHORT setups: Searches for bullish BREAK events after the setup's interaction event
- If invalidating break found: Setup is not triggerable (even if Part 6 snapshot still shows QUALIFIED)
- Causality respected: Only events with eventTimeUTC ≤ asOfTimeUTC are considered

**Key Method:** `TriggerEngine.checkForInvalidatingBreak(setup, levelId, allEvents, asOfTime)`

### Regression Tests Added

| Test | Scenario | Expected | Status |
|------|----------|----------|--------|
| A | Valid retest (break → interaction → bullish confirmation) | BULLISH_BREAKOUT fires | ✅ PASS |
| B | Failed retest (break → interaction → bearish break → later recovery) | NO TRIGGER | ✅ PASS |
| C | Failed retest doesn't resurrect (same as B, many bars later) | NO TRIGGER | ✅ PASS |
| D | Future events don't affect past triggers (causality) | Trigger at historical time, unaffected by later breaks | ✅ PASS |
| E | Pullback invalidation (break → interaction → bearish break) | NO TRIGGER | ✅ PASS |

### Architecture

**Input:**
- SetupSnapshot (all QUALIFIED setups)
- LocationSnapshot (current level prices and polarity states)
- Candle (current 5m candle, must be CLOSED)
- asOfTimeUTC (evaluation timestamp for causality)

**Process:**
```typescript
TriggerEngine.getTriggerSnapshot(
  setupSnapshot: SetupSnapshot,
  locationSnapshot: LocationSnapshot,
  currentCandle: Candle,
  asOfTimeUTC: Date,
  config: TriggerEngineConfig,
): TriggerSnapshot
```

**Output:**
- TriggerSnapshot containing all confirmed triggers

### Trigger Types

**IMPLEMENTED (executable, deterministic rules defined):**

| Type | Condition | Setup Type | Direction |
|---|---|---|---|
| BULLISH_RECLAIM | Close > flipped SUPPORT | PULLBACK_LONG | LONG |
| BEARISH_RECLAIM | Close < flipped RESISTANCE | PULLBACK_SHORT | SHORT |
| BULLISH_BREAKOUT | Close > original RESISTANCE after retest | BREAKOUT_RETEST_LONG | LONG |
| BEARISH_BREAKDOWN | Close < original SUPPORT after retest | BREAKOUT_RETEST_SHORT | SHORT |

**DEFINED IN V1 SPECIFICATION BUT NOT YET EXECUTABLE:**

- **BULLISH_REVERSAL**: The V1 architecture names this trigger concept as part of the formal contract. However, the deterministic execution semantics for reversal confirmation are not yet sufficiently specified. Implementation awaits formal V1 specification of reversal conditions. Do NOT invent generic candlestick-pattern reversal rules.

- **BEARISH_REVERSAL**: The V1 architecture names this trigger concept as part of the formal contract. However, the deterministic execution semantics for reversal confirmation are not yet sufficiently specified. Implementation awaits formal V1 specification of reversal conditions. Do NOT invent generic candlestick-pattern reversal rules.

These are preserved in the TriggerType enum to maintain V1 contract integrity. Reversal evaluation logic must be added only after formal specification of reversal semantics in the V1 design.

### Key Contracts

**Trigger Class:**
```typescript
class Trigger {
  triggerId: string;                   // setupId + triggerType
  setupId: string;                     // Associated setup
  direction: 'LONG' | 'SHORT';         // Must match setup direction
  triggerType: TriggerType;            // One of 4 types above
  referenceLevelPrice: number;         // Price that triggered
  confirmationClose: number;           // Candle close that triggered
  confirmationCloseUTC: Date;          // When trigger confirmed
  knowledgeTimeUTC: Date;              // When known (no look-ahead)
  // ... (frozen, immutable)
}
```

**TriggerSnapshot:**
```typescript
class TriggerSnapshot {
  symbol: string;
  asOfTimeUTC: Date;
  knowledgeTimeUTC: Date;
  getAllTriggers(): Trigger[];         // All triggers
  getTriggersBySetupId(id): Trigger[]; // Triggers for setup
  isSealed(): boolean;                 // Immutable check
}
```

### Mandatory Requirements Enforced

1. **Setup Gating**: QUALIFIED setup must exist
2. **Closed Candle**: Only CandleStatus.CLOSED triggers (not developing, not wicks alone)
3. **Direction Lock**: LONG setups → bullish triggers only, SHORT → bearish only
4. **Invalidation Respect**: INVALIDATED setups never trigger
5. **No Look-Ahead**: Future data cannot create historical trigger
6. **Immutability**: TriggerSnapshot sealed after creation

### Test Coverage (16 tests)

- ✅ Setup gating (3 tests)
- ✅ Direction matching (2 tests)
- ✅ Closed candle enforcement (3 tests)
- ✅ Invalidation handling (2 tests)
- ✅ Trigger types (2 tests)
- ✅ Determinism (1 test)
- ✅ Immutability (1 test)
- ✅ Causality/no-look-ahead (1 test)

### Files

**Added:**
- `src/domain/trigger.ts` — Trigger class + TriggerType enum
- `src/domain/trigger-snapshot.ts` — TriggerSnapshot container
- `src/domain/trigger-engine.ts` — TriggerEngine evaluator
- `src/__tests__/trigger-engine.test.ts` — 16 comprehensive tests

**Modified:**
- `src/index.ts` — Added Part 7 exports

### V2 Leakage

✅ **ZERO indicators introduced** (RSI, MACD, EMA, VWAP, ADX, Supertrend, Bollinger)  
✅ **ZERO V2 pipeline** (no Evidence Engine, Strategy Engine, Trade Plan, Recommendation)  
✅ **ZERO AI decision-making** (deterministic structure-first only)  

### Remaining Work

- **Part 8 — Risk:** NOT IMPLEMENTED (future)
- **Part 9 — Decision:** NOT IMPLEMENTED (future)

---

**END OF DOCUMENT**

This CLAUDE.md serves as the complete reference for Cerebro Signals V1. All decisions, implementations, and design choices are captured here for future reference and context switching.
