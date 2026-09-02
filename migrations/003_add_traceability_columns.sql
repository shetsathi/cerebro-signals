-- Add traceability columns to signals table
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
