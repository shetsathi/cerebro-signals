-- Create performance_metrics table for aggregated trade statistics
-- Summarizes trading performance by symbol and time period

CREATE TABLE performance_metrics (
  -- Primary key
  metric_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Grouping
  symbol TEXT NOT NULL,
  period_start TIMESTAMP WITH TIME ZONE NOT NULL,
  period_end TIMESTAMP WITH TIME ZONE NOT NULL,

  -- Trade counts
  total_trades INT NOT NULL DEFAULT 0,
  completed_trades INT NOT NULL DEFAULT 0,     -- Trades with exit_type set
  winning_trades INT NOT NULL DEFAULT 0,       -- Trades with pnl_amount > 0
  losing_trades INT NOT NULL DEFAULT 0,        -- Trades with pnl_amount < 0
  breakeven_trades INT NOT NULL DEFAULT 0,     -- Trades with pnl_amount = 0

  -- Rates and ratios
  win_rate DECIMAL(5, 2),                      -- (winning_trades / completed_trades) * 100
  profit_factor DECIMAL(10, 4),                -- gross_profit / gross_loss (0 if no losses)
  expectancy DECIMAL(20, 8),                   -- average_win * win_rate - average_loss * loss_rate

  -- PNL metrics
  total_pnl DECIMAL(20, 8) NOT NULL DEFAULT 0,
  avg_pnl_per_trade DECIMAL(20, 8),
  largest_win DECIMAL(20, 8),
  largest_loss DECIMAL(20, 8),
  gross_profit DECIMAL(20, 8),                 -- Sum of all positive PNLs
  gross_loss DECIMAL(20, 8),                   -- Sum of all negative PNLs (as positive number)

  -- Time metrics
  avg_trade_duration_minutes INT,              -- Average bars_held converted to minutes
  min_trade_duration_minutes INT,
  max_trade_duration_minutes INT,

  -- Risk metrics
  max_consecutive_losses INT,
  max_consecutive_wins INT,
  largest_loss_streak DECIMAL(20, 8),         -- Largest cumulative loss in consecutive trades

  -- Setup analysis
  setup_type_performance JSONB,                -- {setup_type: {wins: x, losses: y, pnl: z}}
  trigger_type_performance JSONB,              -- {trigger_type: {wins: x, losses: y, pnl: z}}
  regime_type_performance JSONB,               -- {regime_type: {wins: x, losses: y, pnl: z}}

  -- Metadata
  last_updated_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- Indexes
CREATE INDEX performance_metrics_symbol_period ON performance_metrics(symbol, period_start DESC, period_end DESC);
CREATE INDEX performance_metrics_symbol ON performance_metrics(symbol);
CREATE INDEX performance_metrics_period ON performance_metrics(period_start, period_end);
CREATE INDEX performance_metrics_created_at ON performance_metrics(created_at DESC);

-- Comments
COMMENT ON TABLE performance_metrics IS 'Aggregated trade performance statistics by symbol and time period. Computed from trade_executions.';
COMMENT ON COLUMN performance_metrics.symbol IS 'Trading symbol (NIFTY50, BANKNIFTY, etc.)';
COMMENT ON COLUMN performance_metrics.period_start IS 'Start of analysis period (inclusive)';
COMMENT ON COLUMN performance_metrics.period_end IS 'End of analysis period (inclusive)';
COMMENT ON COLUMN performance_metrics.win_rate IS '(winning_trades / completed_trades) * 100';
COMMENT ON COLUMN performance_metrics.profit_factor IS 'gross_profit / gross_loss. > 1 is profitable, < 1 is losing';
COMMENT ON COLUMN performance_metrics.expectancy IS 'Expected value per trade (positive if system is profitable)';
COMMENT ON COLUMN performance_metrics.setup_type_performance IS 'Breakdown by setup type: {PULLBACK_LONG: {wins: 5, losses: 2, pnl: 1250.50}}';
COMMENT ON COLUMN performance_metrics.trigger_type_performance IS 'Breakdown by trigger type: {BULLISH_BREAKOUT: {wins: 3, losses: 1, pnl: 750.25}}';
COMMENT ON COLUMN performance_metrics.regime_type_performance IS 'Breakdown by regime: {UPTREND: {wins: 8, losses: 2, pnl: 2000.00}}';
