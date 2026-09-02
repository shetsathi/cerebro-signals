# Complete Deployment Guide: All Three Phases

**Status**: ✅ Ready to Deploy  
**Phases**: Phase 1 (Traceability) + Phase 2 (Performance) + Phase 3 (Quality)  
**Estimated Time**: 30-45 minutes  
**Risk Level**: Low (additive changes only)

---

## Pre-Deployment Checklist

- [ ] Read this entire guide
- [ ] Backup database (optional but recommended)
- [ ] Have Supabase dashboard open
- [ ] Have Git repository ready for verification
- [ ] Verify code is built: `npm run build`
- [ ] Verify tests pass: `npm test`

**Status Check**:
```bash
cd D:\Cerebro\ Signals
npm run build
npm test
```

Should show:
- ✅ TypeScript: 0 errors
- ✅ Tests: 561/561 passing

---

## Step 1: Deploy Phase 1 (5 minutes)

### 1.1 Run Migration

**Location**: Supabase Dashboard → SQL Editor

**Copy and paste this entire SQL block**:

```sql
-- ============================================================================
-- Phase 1: Signal Traceability Columns
-- ============================================================================
-- Adds: stop_level_id, target_level_id, setup_type, trigger_type, regime_type
-- Purpose: Full audit trail of where signal came from

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

**Expected Result**: ✅ No errors, "columns added" message

### 1.2 Verify Phase 1

```sql
-- Check columns exist
SELECT column_name, data_type 
FROM information_schema.columns 
WHERE table_name = 'signals' 
AND column_name IN ('stop_level_id', 'target_level_id', 'setup_type', 'trigger_type', 'regime_type')
ORDER BY column_name;
```

**Expected**: 5 rows returned (all TEXT type)

---

## Step 2: Deploy Phase 2 (10 minutes)

### 2.1 Run Trade Executions Table Migration

**Location**: Supabase Dashboard → SQL Editor

**Copy and paste**:

```sql
-- ============================================================================
-- Phase 2a: Trade Executions Table
-- ============================================================================
-- Tracks entry/exit fills, PNL calculation, trade lifecycle

CREATE TABLE IF NOT EXISTS trade_executions (
  trade_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  signal_id UUID NOT NULL REFERENCES signals(signal_id) ON DELETE CASCADE,
  
  entry_price DECIMAL(20, 8),
  entry_time_utc TIMESTAMP WITH TIME ZONE,
  entry_slippage DECIMAL(10, 8),
  entry_bar_index INT,
  
  exit_price DECIMAL(20, 8),
  exit_time_utc TIMESTAMP WITH TIME ZONE,
  exit_type TEXT CHECK (exit_type IN ('SL_HIT', 'TARGET_HIT', 'MANUAL_EXIT', 'TIMEOUT', NULL)),
  exit_bar_index INT,
  
  pnl_amount DECIMAL(20, 8),
  pnl_percent DECIMAL(10, 4),
  risk_hit_percent DECIMAL(10, 4),
  
  status TEXT NOT NULL DEFAULT 'PENDING' CHECK (status IN ('PENDING', 'ENTRY_FILLED', 'WAITING_EXIT', 'CLOSED')),
  duration_minutes INT,
  bars_held INT,
  notes TEXT,
  
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

CREATE INDEX IF NOT EXISTS trade_executions_signal_id ON trade_executions(signal_id);
CREATE INDEX IF NOT EXISTS trade_executions_status ON trade_executions(status);
CREATE INDEX IF NOT EXISTS trade_executions_exit_type ON trade_executions(exit_type) WHERE exit_type IS NOT NULL;
CREATE INDEX IF NOT EXISTS trade_executions_created_at ON trade_executions(created_at DESC);
CREATE INDEX IF NOT EXISTS trade_executions_pnl_amount ON trade_executions(pnl_amount) WHERE pnl_amount IS NOT NULL;

COMMENT ON TABLE trade_executions IS 'Trade lifecycle tracking: entry fills, exit hits, PNL calculation. Immutable once closed.';
```

**Expected Result**: ✅ Table created, indices created

### 2.2 Run Performance Metrics Table Migration

**Copy and paste**:

```sql
-- ============================================================================
-- Phase 2b: Performance Metrics Table
-- ============================================================================
-- Aggregated trading statistics by symbol and period

CREATE TABLE IF NOT EXISTS performance_metrics (
  metric_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  
  symbol TEXT NOT NULL,
  period_start TIMESTAMP WITH TIME ZONE NOT NULL,
  period_end TIMESTAMP WITH TIME ZONE NOT NULL,
  
  total_trades INT NOT NULL DEFAULT 0,
  completed_trades INT NOT NULL DEFAULT 0,
  winning_trades INT NOT NULL DEFAULT 0,
  losing_trades INT NOT NULL DEFAULT 0,
  breakeven_trades INT NOT NULL DEFAULT 0,
  
  win_rate DECIMAL(5, 2),
  profit_factor DECIMAL(10, 4),
  expectancy DECIMAL(20, 8),
  
  total_pnl DECIMAL(20, 8) NOT NULL DEFAULT 0,
  avg_pnl_per_trade DECIMAL(20, 8),
  largest_win DECIMAL(20, 8),
  largest_loss DECIMAL(20, 8),
  gross_profit DECIMAL(20, 8),
  gross_loss DECIMAL(20, 8),
  
  avg_trade_duration_minutes INT,
  min_trade_duration_minutes INT,
  max_trade_duration_minutes INT,
  
  max_consecutive_losses INT,
  max_consecutive_wins INT,
  largest_loss_streak DECIMAL(20, 8),
  
  setup_type_performance JSONB,
  trigger_type_performance JSONB,
  regime_type_performance JSONB,
  
  last_updated_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

CREATE INDEX IF NOT EXISTS performance_metrics_symbol_period ON performance_metrics(symbol, period_start DESC, period_end DESC);
CREATE INDEX IF NOT EXISTS performance_metrics_symbol ON performance_metrics(symbol);
CREATE INDEX IF NOT EXISTS performance_metrics_period ON performance_metrics(period_start, period_end);
CREATE INDEX IF NOT EXISTS performance_metrics_created_at ON performance_metrics(created_at DESC);

COMMENT ON TABLE performance_metrics IS 'Aggregated trade performance statistics by symbol and time period. Computed from trade_executions.';
```

**Expected Result**: ✅ Table created, indices created

### 2.3 Verify Phase 2

```sql
-- Check both tables exist
SELECT EXISTS (
  SELECT 1 FROM information_schema.tables 
  WHERE table_name = 'trade_executions'
) as trade_executions_exists,
EXISTS (
  SELECT 1 FROM information_schema.tables 
  WHERE table_name = 'performance_metrics'
) as performance_metrics_exists;
```

**Expected**: Both TRUE

---

## Step 3: Deploy Phase 3 (5 minutes)

### 3.1 Run Conviction Scoring Migration

**Location**: Supabase Dashboard → SQL Editor

**Copy and paste**:

```sql
-- ============================================================================
-- Phase 3: Signal Conviction Scoring
-- ============================================================================
-- Adds conviction score (0-100), conviction level, and factor breakdown

ALTER TABLE signals ADD COLUMN IF NOT EXISTS (
  conviction_score INT CHECK (conviction_score >= 0 AND conviction_score <= 100),
  conviction_level TEXT CHECK (conviction_level IN ('LOW', 'MEDIUM', 'HIGH', NULL)),
  conviction_factors JSONB                -- Breakdown: {regime: 20, setup: 15, trigger: 20, ratio: 25}
);

-- Index for filtering by conviction
CREATE INDEX IF NOT EXISTS signals_conviction_score ON signals(conviction_score DESC) WHERE conviction_score IS NOT NULL;
CREATE INDEX IF NOT EXISTS signals_conviction_level ON signals(conviction_level) WHERE conviction_level IS NOT NULL;

-- Comments
COMMENT ON COLUMN signals.conviction_score IS 'Signal quality score 0-100. Higher = more confident. Based on regime, setup type, trigger type, R:R ratio.';
COMMENT ON COLUMN signals.conviction_level IS 'Categorical: LOW (0-40), MEDIUM (40-70), HIGH (70-100). Used for filtering/alerting.';
COMMENT ON COLUMN signals.conviction_factors IS 'Breakdown of score components: {regime: X, setup: Y, trigger: Z, ratio: W} (sums to conviction_score)';
```

**Expected Result**: ✅ Columns added, indices created

### 3.2 Verify Phase 3

```sql
-- Check conviction columns exist
SELECT column_name, data_type 
FROM information_schema.columns 
WHERE table_name = 'signals' 
AND column_name IN ('conviction_score', 'conviction_level', 'conviction_factors')
ORDER BY column_name;
```

**Expected**: 3 rows returned

---

## Step 4: Rebuild and Redeploy Services

### 4.1 Verify Build

```bash
cd D:\Cerebro\ Signals
npm run build
```

**Expected**: ✅ No TypeScript errors

### 4.2 Verify Tests

```bash
npm test
```

**Expected**: ✅ 561/561 tests passing

### 4.3 Redeploy Services

**Terminal 1 - Persistent Server** (Angel One + Signal Generation):
```bash
npm run start:live
```

**Terminal 2 - API Server** (Dashboard):
```bash
npm run start:server
```

**Expected**:
- Terminal 1: Server started, ready for ticks
- Terminal 2: API listening on port 3000

### 4.4 Verify Servers Running

```bash
# Check API health
curl http://localhost:3000/api/health
# Expected: {"status":"ok"}

# Open dashboard
# Navigate to http://localhost:3000
# Expected: Dashboard loads
```

---

## Step 5: Generate and Verify Signals

### 5.1 Wait for Signal Generation

**What to watch**:
1. Market hours: 09:15-15:30 IST
2. Wait for candle close (~5 minutes after each candle start)
3. Check logs for signal

**Log indicators**:
```
[NIFTY50] Part 3: 3 swings, structure=HH
[NIFTY50] Part 4: regime=UPTREND
[NIFTY50] Part 5: 12 total levels, 5 events
[NIFTY50] Part 6: 2 setups (1 qualified)
[NIFTY50] Part 7: 1 triggers
[NIFTY50] Part 8: 1 risks (1 VALID)
[NIFTY50] Signal LONG - Conviction: 🟢 78/100 (HIGH) (regime=20 + setup=18 + trigger=19 + ratio=21)
Signal persisted: <uuid> - NIFTY50 LONG
```

### 5.2 Verify in Database

```sql
-- Check latest signal with all Phase 1-3 data
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
  conviction_score,
  conviction_level,
  conviction_factors,
  created_at
FROM signals
ORDER BY created_at DESC
LIMIT 1;
```

**Expected**: All columns populated with values

### 5.3 Check Telegram Alert

If conviction_score >= 70:
- ✅ Alert sent to Telegram group
- Message shows: 🟢 SIGNAL, conviction score, setup type

If conviction_score < 70:
- ✅ No alert sent (informational only)
- ✅ Signal still in database

---

## Step 6: Verify All Three Phases Working

### Query 1: Phase 1 Traceability
```sql
SELECT COUNT(*) as signals_with_setup_type,
       COUNT(CASE WHEN setup_type IS NOT NULL THEN 1 END) as have_setup,
       COUNT(CASE WHEN trigger_type IS NOT NULL THEN 1 END) as have_trigger
FROM signals;
```

**Expected**: Counts show data populated

### Query 2: Phase 2 Trade Tracking
```sql
SELECT COUNT(*) as total_trades,
       COUNT(CASE WHEN status = 'CLOSED' THEN 1 END) as closed_trades,
       COUNT(CASE WHEN pnl_amount IS NOT NULL THEN 1 END) as trades_with_pnl
FROM trade_executions;
```

**Expected**: Shows trade data (may be 0 initially)

### Query 3: Phase 3 Quality Filtering
```sql
SELECT conviction_level, COUNT(*) as count
FROM signals
GROUP BY conviction_level
ORDER BY CASE conviction_level WHEN 'HIGH' THEN 1 WHEN 'MEDIUM' THEN 2 WHEN 'LOW' THEN 3 END;
```

**Expected**: Shows HIGH/MEDIUM/LOW distribution

---

## Rollback Plan (If Needed)

### Rollback Phase 3
```sql
-- If something breaks with conviction scoring
ALTER TABLE signals 
DROP COLUMN IF EXISTS conviction_score,
DROP COLUMN IF EXISTS conviction_level,
DROP COLUMN IF EXISTS conviction_factors;

DROP INDEX IF EXISTS signals_conviction_score;
DROP INDEX IF EXISTS signals_conviction_level;
```

### Rollback Phase 2
```sql
-- If something breaks with trade tracking
DROP TABLE IF EXISTS trade_executions CASCADE;
DROP TABLE IF EXISTS performance_metrics CASCADE;
```

### Rollback Phase 1
```sql
-- If something breaks with traceability
ALTER TABLE signals 
DROP COLUMN IF EXISTS stop_level_id,
DROP COLUMN IF EXISTS target_level_id,
DROP COLUMN IF EXISTS setup_type,
DROP COLUMN IF EXISTS trigger_type,
DROP COLUMN IF EXISTS regime_type;

DROP INDEX IF EXISTS signals_stop_level_id;
DROP INDEX IF EXISTS signals_target_level_id;
DROP INDEX IF EXISTS signals_setup_type;
DROP INDEX IF EXISTS signals_trigger_type;
DROP INDEX IF EXISTS signals_regime_type;
```

---

## Post-Deployment Checklist

- [ ] All 3 phases deployed
- [ ] Services restarted
- [ ] Signal generated and verified in database
- [ ] Phase 1 columns populated (setup_type, trigger_type, regime_type)
- [ ] Phase 3 score calculated (conviction_score, conviction_level)
- [ ] Telegram alert sent (if HIGH conviction)
- [ ] Dashboard loads and shows signals
- [ ] Tests still passing (561/561)

---

## Troubleshooting

### Issue: No signals appearing

**Check**:
1. Market hours? (09:15-15:30 IST)
2. Logs show V1 engine running?
3. Candles persisting to database?

**Solution**:
```bash
# Check logs for errors
# Look for "[symbol] Signal" messages
# If not appearing, wait for next 5m candle close
```

### Issue: Signals appearing but no Telegram alert

**Check**:
1. Is conviction_score >= 70?
2. Is Telegram bot token valid?

**Verify**:
```sql
SELECT conviction_score, conviction_level 
FROM signals ORDER BY created_at DESC LIMIT 1;
```

If conviction >= 70, alert should have been sent.

### Issue: Telegram alert sending for LOW conviction

**Cause**: Old signals from before Phase 3 deployed

**Solution**: This is expected. Only NEW signals will have conviction scoring.

---

## Success Criteria

✅ All deployment successful when:

1. **Phase 1**: Signals have `setup_type`, `trigger_type`, `regime_type`
2. **Phase 2**: Trade table exists, ready for trade tracking
3. **Phase 3**: Signals have `conviction_score`, alerts filter by HIGH only
4. **Overall**: Tests still passing, services running, no errors in logs

---

## Next Steps (After Deployment)

1. **Monitor**: Watch signals for 1-2 days, verify quality
2. **Analyze**: Run performance queries to see conviction effectiveness
3. **Tune**: Adjust conviction score weights if needed (future)
4. **Track**: Start collecting PNL data from Phase 2

---

## Summary

| Phase | Migration Files | Tables | Columns | Risk | Status |
|-------|-----------------|--------|---------|------|--------|
| **1** | 1 SQL file | - | 5 added | Low | Ready |
| **2** | 1 SQL file | 2 new | - | Low | Ready |
| **3** | 1 SQL file | - | 3 added | Low | Ready |
| **Total** | 3 files | 2 tables | 8 columns | Low | ✅ Go |

**Estimated total time**: 30-45 minutes

**Ready to deploy?** Follow the steps above in order! 🚀
