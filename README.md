# Cerebro Signals V1

Market data foundation and candle normalization for the Cerebro Signals trading system.

## Overview

This is **PART 1** of the Cerebro Signals architecture, implementing the data foundation layer:

```
Market Data
    ↓
Candle Normalization
    ↓
Time / Session Engine
    ↓
Candle Validation
    ↓
Persistence
```

## Features

### ✅ Implemented

- **Session-aligned candle calculations** (5m, 15m, 60m, 1D)
- **Session boundaries** (09:15–15:30 IST, Asia/Kolkata timezone)
- **Candle status tracking** (DEVELOPING, CLOSED)
- **UTC/IST timezone handling** (all storage in UTC, session logic in IST)
- **Candle validation** (duplicate detection, out-of-order detection, missing candle detection)
- **Deterministic tests** (14 test categories covering frozen rules)
- **Persistence interface** (database-agnostic)
- **Supabase integration** (PostgreSQL adapter)
- **Broker adapter interface** (Angel One placeholder)

### ❌ NOT Implemented (Future)

- Angel One live data integration
- Trading intelligence (Structure, Regime, Levels, Location, Setup, Trigger, Risk, Decision)
- Indicators (RSI, EMA, MACD, etc.)
- Signal generation (LONG/SHORT/WAIT)
- Order execution
- Additional services (Redis, Kafka, microservices)

## Frozen Rules (Part 1 Specification)

### Session Boundaries
- **Market Open**: 09:15 IST
- **Market Close**: 15:30 IST
- **Timezone**: Asia/Kolkata (UTC+5:30)
- **Storage**: All timestamps in UTC
- **Display**: UI can show IST

### Candle Timeframes

| Timeframe | Alignment | Last Candle | Note |
|-----------|-----------|-------------|------|
| 5m | 09:15, 09:20, 09:25, ... 15:25 | 15:25–15:30 | Session-aligned, 5-minute closes |
| 15m | 09:15, 09:30, 09:45, ... 15:15 | 15:15–15:30 | Session-aligned, 15-minute closes |
| 60m | 09:15, 10:15, 11:15, ... 15:15 | None (15:15–15:30 is remainder) | 6 complete 60m candles, remainder NOT treated as 60m |
| 1D | 09:15–15:30 | Daily close | Full session as single candle |

### Candle Lifecycle

```
DEVELOPING  → Candle is still forming
CLOSED      → Candle confirmed at close time
```

Example: 09:15–10:15 60m candle
- At 09:40: DEVELOPING
- At 10:15: CLOSED

### Knowledge Time vs Event Time

- **Event Time**: Physical occurrence (e.g., price extreme)
- **Knowledge Time**: When information becomes available in real time
- Both stored in database for future swing confirmation logic
- Current implementation: `knowledgeTime = closeTime`

### Data Integrity

1. **No duplicates**: `(symbol, timeframe, open_time_utc)` must be unique
2. **No missing candles**: System detects gaps and reports them
3. **No out-of-order data**: System detects and reports arrivals
4. **No look-ahead leaks**: Developing candles not treated as confirmed data

## Architecture

### Domain Layer (`src/domain/`)

Completely independent of persistence and external dependencies.

- **`timeframe.ts`**: Timeframe enum and value object
- **`session.ts`**: Session time logic, timezone conversions
- **`candle.ts`**: Candle model, CandleCalculator
- **`candle-validator.ts`**: Validation and error detection

### Persistence Layer (`src/persistence/`)

Behind an interface; can swap implementations.

- **`candle-repository.interface.ts`**: Repository contract
- **`supabase-candle-repository.ts`**: Supabase PostgreSQL implementation

### Adapters (`src/adapters/`)

Broker-specific integration (currently placeholder).

- **`broker-adapter.interface.ts`**: Broker contract
- **`angel-one-adapter.ts`**: Angel One placeholder

### Tests (`src/__tests__/`)

Comprehensive deterministic tests for all frozen rules.

- **`session.test.ts`**: Session boundaries, timezone handling
- **`candle-calculator.test.ts`**: Candle boundary calculations
- **`candle-validator.test.ts`**: Duplicate, missing, out-of-order detection
- **`timeframe.test.ts`**: Timeframe model

## Database Schema

### `candles` table

```sql
CREATE TABLE candles (
  id TEXT PRIMARY KEY,                    -- symbol-timeframe-open_time_ms
  symbol TEXT NOT NULL,                   -- e.g., RELIANCE
  timeframe TEXT NOT NULL,                -- 5m, 15m, 60m, 1D
  open_time_utc TIMESTAMP NOT NULL,       -- UTC
  close_time_utc TIMESTAMP NOT NULL,      -- UTC
  knowledge_time_utc TIMESTAMP NOT NULL,  -- UTC
  open DECIMAL(20, 8) NOT NULL,
  high DECIMAL(20, 8) NOT NULL,
  low DECIMAL(20, 8) NOT NULL,
  close DECIMAL(20, 8) NOT NULL,
  volume BIGINT NOT NULL,
  status TEXT NOT NULL,                   -- DEVELOPING or CLOSED
  created_at TIMESTAMP DEFAULT now(),
  updated_at TIMESTAMP DEFAULT now()
);

-- Unique constraint on (symbol, timeframe, open_time_utc)
-- Indexes for query efficiency
```

See `migrations/001_candles_table.sql`.

## Getting Started

### Install Dependencies

```bash
npm install
```

### Run Tests

```bash
npm test
```

### Run Type Checking

```bash
npm run type-check
```

### Build

```bash
npm run build
```

## Example Usage

### Create a Candle

```typescript
import {
  Candle,
  CandleStatus,
  Timeframe,
  TimeframeValue,
} from './index';

const candle = new Candle(
  'RELIANCE',
  Timeframe.from(TimeframeValue.FIVE_MIN),
  new Date('2026-08-21T09:15:00Z'), // openTimeUTC
  new Date('2026-08-21T09:20:00Z'), // closeTimeUTC
  {
    open: 2500,
    high: 2505,
    low: 2495,
    close: 2502,
    volume: 10000,
  },
  CandleStatus.CLOSED,
);
```

### Validate Candles

```typescript
import { CandleValidator } from './index';

const validator = new CandleValidator();

const result1 = validator.validate(candle1);
const result2 = validator.validate(candle2);

if (!result1.valid) {
  console.log(result1.errors);
}
```

### Query Database

```typescript
import { createClient } from '@supabase/supabase-js';
import { SupabaseCandleRepository } from './src/persistence/supabase-candle-repository';
import { Timeframe, TimeframeValue } from './index';

const supabase = createClient(url, key);
const repo = new SupabaseCandleRepository(supabase);

const candles = await repo.getBySymbolAndTimeframe(
  'RELIANCE',
  Timeframe.from(TimeframeValue.FIVE_MIN),
);
```

## Testing

All tests are deterministic and timezone-safe.

### Test Coverage

- ✅ Session open at 09:15
- ✅ First 5m close at 09:20
- ✅ First 15m close at 09:30
- ✅ First 60m close at 10:15
- ✅ Session close at 15:30
- ✅ 15:15–15:30 remainder NOT treated as 60m
- ✅ Developing vs CLOSED status
- ✅ UTC/IST conversion
- ✅ Duplicate candle rejection
- ✅ Missing candle detection
- ✅ Out-of-order detection
- ✅ Weekend/session handling
- ✅ Daily session candle boundaries
- ✅ Edge cases (boundary timestamps)

## Assumptions & Decisions

1. **Timezone**: IST (Asia/Kolkata) is authoritative for session boundaries; all storage in UTC.
2. **Candle IDs**: Deterministic composite `symbol-timeframe-open_time_ms`.
3. **Knowledge Time**: Currently equals close time; stored separately for future use.
4. **Remainder Candle**: 15:15–15:30 is treated as a session remainder, NOT a 60m candle.
5. **Database**: Supabase PostgreSQL; interface-based for flexibility.
6. **Broker Integration**: Placeholder only; Angel One integration deferred.

## Future Work

**Part 2 & Beyond** will add:
- Angel One live data integration
- Structure detection (HH, HL, LH, LL)
- Regime identification
- Level discovery
- Trade location
- Setup generation
- Trigger detection
- Risk calculation
- Decision engine

## References

- GitHub: https://github.com/shetsathi/cerebro-signals
- Specification: Part 1 — Frozen Candle & Time Specification
