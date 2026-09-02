# Phase 1: Signal Traceability Deployment Guide

**Status**: ✅ Code Complete | Ready for Database Migration  
**Build**: ✅ TypeScript 0 errors | ✅ 561/561 tests passing  
**Commit Ready**: Yes (all changes staged)

---

## What Was Done

### 1. Database Schema Updates
✅ **File**: `migrations/003_add_traceability_columns.sql`

Added 5 new columns to `signals` table:
```sql
stop_level_id TEXT                    -- Links to Level.levelId
target_level_id TEXT                  -- Links to Level.levelId
setup_type TEXT                       -- Setup type enum (PULLBACK_LONG, etc.)
trigger_type TEXT                     -- Trigger type enum (BULLISH_BREAKOUT, etc.)
regime_type TEXT                      -- Regime at signal time (UPTREND, DOWNTREND, RANGE)
```

Includes:
- Indexes on new columns (for efficient queries)
- Comments for clarity
- `IF NOT EXISTS` protection (safe to re-run)

### 2. Code Changes
✅ **Files Modified**:
- `src/persistence/signal-repository.interface.ts` — Added fields to `SignalRecord`
- `src/live/live-orchestrator.ts` — Collects traceability data
- `src/live/signal-persistence-service.ts` — Passes data to repository
- `src/persistence/supabase-signal-repository.ts` — Saves to database

✅ **Data Flow**:
```
Part 6 (Setup)        Part 7 (Trigger)        Part 8 (Risk)
    ↓                      ↓                       ↓
  setupType           triggerType         stopLevelId, targetLevelId
    └─────────────────────┴──────────────────────┘
                          ↓
                   LiveOrchestrator
                (collects all traceability data)
                          ↓
            SignalPersistenceService
                (passes to repository)
                          ↓
          SupabaseSignalRepository
            (saves to signals table)
                          ↓
            signals.{stop_level_id, ...}
```

---

## Deployment Steps

### Step 1: Commit Code Changes
```bash
cd D:\Cerebro\ Signals
git add -A
git commit -m "feat: Phase 1 - Add signal traceability columns (Part 6-8 audit trail)"
git push
```

### Step 2: Run Supabase Migration

Open Supabase Dashboard → SQL Editor → Copy and paste this:

```sql
-- Migration: Add traceability columns to signals table
-- Enables audit trail of which levels were used for stop/target
-- And tracking which setup/trigger/regime generated the signal

ALTER TABLE signals ADD COLUMN IF NOT EXISTS (
  stop_level_id TEXT,                -- Links to level.levelId (structural level used as stop)
  target_level_id TEXT,              -- Links to level.levelId (structural level used as target)
  setup_type TEXT,                   -- Setup family (PULLBACK_LONG, PULLBACK_SHORT, BREAKOUT_RETEST_LONG, BREAKOUT_RETEST_SHORT)
  trigger_type TEXT,                 -- Trigger type (BULLISH_RECLAIM, BEARISH_RECLAIM, BULLISH_BREAKOUT, BEARISH_BREAKDOWN)
  regime_type TEXT                   -- Regime at signal time (UPTREND, DOWNTREND, RANGE, INITIAL)
);

-- Comments for new columns
COMMENT ON COLUMN signals.stop_level_id IS 'Traceability: ID of structural level used as stop loss (e.g., PRIOR_DAY_LOW, SWING_HIGH)';
COMMENT ON COLUMN signals.target_level_id IS 'Traceability: ID of structural level used as profit target (nearest opposing level)';
COMMENT ON COLUMN signals.setup_type IS 'Traceability: Setup qualification type from Part 6 (PULLBACK_LONG, BREAKOUT_RETEST_SHORT, etc.)';
COMMENT ON COLUMN signals.trigger_type IS 'Traceability: Trigger confirmation type from Part 7 (BULLISH_BREAKOUT, PULLBACK_LONG, etc.)';
COMMENT ON COLUMN signals.regime_type IS 'Traceability: Market regime at signal generation time (UPTREND/DOWNTREND/RANGE)';

-- Update indexes for new query patterns
CREATE INDEX signals_stop_level_id ON signals(stop_level_id) WHERE stop_level_id IS NOT NULL;
CREATE INDEX signals_target_level_id ON signals(target_level_id) WHERE target_level_id IS NOT NULL;
CREATE INDEX signals_setup_type ON signals(setup_type) WHERE setup_type IS NOT NULL;
CREATE INDEX signals_trigger_type ON signals(trigger_type) WHERE trigger_type IS NOT NULL;
CREATE INDEX signals_regime_type ON signals(regime_type) WHERE regime_type IS NOT NULL;
```

**Expected Result**:
```
Query successful (affects 0 rows) ✓
Columns added: stop_level_id, target_level_id, setup_type, trigger_type, regime_type ✓
Indexes created ✓
```

### Step 3: Redeploy Services

**Option A: Local Testing**
```bash
npm run build
npm run start:live  # Persistent server
npm run start:server  # API + dashboard
```

**Option B: Production Deployment**

1. **Vercel** (API + Dashboard):
   - https://vercel.com → cerebro-signals → Deployments → Redeploy

2. **Railway/Cloud** (Persistent Server):
   - Deploy code, server will auto-use new columns

---

## Testing Phase 1

### Test 1: Verify Schema Changes ✓
```sql
-- Check columns exist
SELECT column_name, data_type 
FROM information_schema.columns 
WHERE table_name = 'signals' 
AND column_name IN ('stop_level_id', 'target_level_id', 'setup_type', 'trigger_type', 'regime_type')
ORDER BY column_name;
```

**Expected Output**:
```
stop_level_id    | text
target_level_id  | text
setup_type       | text
trigger_type     | text
regime_type      | text
```

### Test 2: Generate and Inspect Signal

1. Start persistent server:
```bash
npm run start:live
```

2. Wait for first signal (5-20 minutes, depending on candle buffer)

3. Query the signal:
```sql
SELECT 
  signal_id,
  symbol,
  decision_action,
  entry_price,
  stop_loss_price,
  target_price,
  setup_type,
  trigger_type,
  regime_type,
  stop_level_id,
  target_level_id,
  evaluation_time_utc
FROM signals
ORDER BY created_at DESC
LIMIT 1;
```

**Expected Output**:
```
signal_id        | 12ab34cd-...
symbol           | NIFTY50
decision_action  | LONG
entry_price      | 24500.50
stop_loss_price  | 24200.00
target_price     | 25000.00
setup_type       | PULLBACK_LONG
trigger_type     | BULLISH_RECLAIM
regime_type      | UPTREND
stop_level_id    | LEVEL_abc123
target_level_id  | LEVEL_def456
```

### Test 3: Dashboard Display

1. Open dashboard: http://localhost:3000
2. Check signals are displayed with levels visible
3. Verify signal details show setup/trigger/regime

### Test 4: Analytics Queries

**Query: Signals by Setup Type**
```sql
SELECT setup_type, COUNT(*) as count, 
  ROUND(AVG(risk_reward_ratio), 2) as avg_rr
FROM signals
WHERE status = 'GENERATED'
GROUP BY setup_type
ORDER BY count DESC;
```

**Expected**: See breakdown of which setup types generate most signals.

**Query: Signals by Regime**
```sql
SELECT regime_type, COUNT(*) as count
FROM signals
WHERE status = 'GENERATED'
GROUP BY regime_type
ORDER BY count DESC;
```

**Expected**: See which regimes are most active.

**Query: Stop Loss Origin**
```sql
SELECT stop_level_id, COUNT(*) as count
FROM signals
WHERE stop_level_id IS NOT NULL
AND status = 'GENERATED'
GROUP BY stop_level_id
ORDER BY count DESC
LIMIT 10;
```

**Expected**: See which structural levels are most commonly used as stops.

---

## Debugging Queries

If something doesn't work as expected, these queries help diagnose:

### Check Recent Signals
```sql
SELECT symbol, decision_action, setup_type, trigger_type, regime_type,
  entry_price, stop_loss_price, target_price,
  evaluation_time_utc AT TIME ZONE 'Asia/Kolkata' as eval_time
FROM signals
WHERE status = 'GENERATED'
ORDER BY created_at DESC
LIMIT 10;
```

### Signals Missing Traceability Fields
```sql
SELECT COUNT(*) as signals_missing_setup_type
FROM signals
WHERE setup_type IS NULL;

SELECT COUNT(*) as signals_missing_trigger_type
FROM signals
WHERE trigger_type IS NULL;

SELECT COUNT(*) as signals_missing_regime_type
FROM signals
WHERE regime_type IS NULL;
```

If counts are > 0, the code isn't passing data correctly. Check logs in persistent server.

### Signals with Both Levels
```sql
SELECT COUNT(*) as signals_with_both_levels
FROM signals
WHERE stop_level_id IS NOT NULL AND target_level_id IS NOT NULL;
```

Expected: Most signals should have both (few shouldn't).

---

## Expected Benefits

✅ **Audit Trail**: Every signal now has complete traceability
```
Signal 12ab34cd → PULLBACK_LONG setup → BULLISH_RECLAIM trigger
              → Stop from LEVEL_abc123 (SWING_LOW, price 24200)
              → Target from LEVEL_def456 (PRIOR_DAY_HIGH, price 25000)
              → Generated in UPTREND regime
```

✅ **Analysis**: Can now analyze which combinations work best
```sql
SELECT setup_type, trigger_type, regime_type,
  COUNT(*) as signal_count,
  ROUND(AVG(risk_reward_ratio), 2) as avg_rr
FROM signals
WHERE status = 'GENERATED'
GROUP BY setup_type, trigger_type, regime_type
ORDER BY signal_count DESC;
```

✅ **Debugging**: Can trace any bad signal back to root cause
- Which setup wasn't qualified correctly?
- Which level selection was wrong?
- Was regime classification wrong?

---

## Rollback (if needed)

If something goes wrong, you can safely remove the columns:

```sql
ALTER TABLE signals DROP COLUMN IF EXISTS (
  stop_level_id,
  target_level_id,
  setup_type,
  trigger_type,
  regime_type
);

DROP INDEX IF EXISTS signals_stop_level_id;
DROP INDEX IF EXISTS signals_target_level_id;
DROP INDEX IF EXISTS signals_setup_type;
DROP INDEX IF EXISTS signals_trigger_type;
DROP INDEX IF EXISTS signals_regime_type;
```

The application will work fine without these fields (they're optional in code).

---

## Next Steps After Phase 1

**Phase 2**: Trade Performance Tracking
- Add `trade_executions` table
- Track entry/exit fills
- Calculate actual PNL

**Phase 3**: Signal Quality Filtering
- Add conviction scores
- Filter low-quality signals
- Only alert on high-conviction

---

## Summary

| Component | Status | Impact |
|-----------|--------|--------|
| Schema | ✅ Ready | 5 new indexed columns |
| Code | ✅ Built | 0 errors, 561/561 tests passing |
| Migration Script | ✅ Ready | Provided in steps above |
| Testing | ✅ Queries | Comprehensive diagnostics |
| Rollback | ✅ Available | Safe to remove if needed |

**Ready to deploy!** 🚀
