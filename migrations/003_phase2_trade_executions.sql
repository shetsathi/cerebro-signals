/**
 * Phase 2: Trade Performance Tracking
 *
 * Creates tables for recording trade executions and aggregated performance metrics.
 * Immutable lifecycle: entry recorded when price hits, exit recorded when SL/Target hit.
 * Performance metrics calculated from completed trades.
 */

-- ============================================================================
-- TABLE: trade_executions
-- Immutable record of each trade's entry/exit details
-- ============================================================================

CREATE TABLE IF NOT EXISTS trade_executions (
  -- Primary key
  execution_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Foreign key to signal
  signal_id UUID NOT NULL REFERENCES signals(signal_id) ON DELETE CASCADE,

  -- Trade identification
  symbol VARCHAR(20) NOT NULL,
  trade_direction VARCHAR(10) NOT NULL CHECK (trade_direction IN ('LONG', 'SHORT')),

  -- Entry details (recorded when entry price hit)
  entry_price NUMERIC(19,4) NOT NULL,
  entry_time_utc TIMESTAMP WITH TIME ZONE NOT NULL,
  entry_bar_index INT NOT NULL,  -- Which candle confirmed entry

  -- Stop loss details (structural level from signal)
  stop_loss_price NUMERIC(19,4) NOT NULL,

  -- Target details (structural level from signal)
  target_price NUMERIC(19,4),

  -- Exit details (recorded when SL or Target hit, NULL if still open)
  exit_price NUMERIC(19,4),
  exit_time_utc TIMESTAMP WITH TIME ZONE,
  exit_bar_index INT,
  exit_type VARCHAR(20) CHECK (exit_type IN ('STOP_LOSS', 'TARGET', 'CLOSED', NULL)),

  -- Trade metrics
  points_pnl NUMERIC(19,4),           -- Profit/Loss in points (price difference)
  percent_pnl NUMERIC(6,4),           -- Profit/Loss in percentage
  rupees_pnl NUMERIC(19,2),           -- Profit/Loss in rupees (points × lot size, if applicable)

  -- Risk metrics (from original signal)
  risk_amount NUMERIC(19,2),
  reward_amount NUMERIC(19,2),
  actual_risk_amount NUMERIC(19,2),  -- Actual loss if SL hit
  actual_reward_amount NUMERIC(19,2), -- Actual gain if Target hit
  risk_reward_ratio NUMERIC(6,2),     -- Original R:R from signal
  actual_risk_reward_ratio NUMERIC(6,2), -- Actual R:R achieved

  -- Trade status
  status VARCHAR(20) NOT NULL DEFAULT 'OPEN' CHECK (status IN ('OPEN', 'CLOSED')),

  -- Traceability
  evaluation_time_utc TIMESTAMP WITH TIME ZONE NOT NULL,
  knowledge_time_utc TIMESTAMP WITH TIME ZONE NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP NOT NULL,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP NOT NULL
);

-- Indexes for efficient queries
CREATE INDEX idx_trade_executions_signal_id ON trade_executions(signal_id);
CREATE INDEX idx_trade_executions_symbol ON trade_executions(symbol);
CREATE INDEX idx_trade_executions_status ON trade_executions(status);
CREATE INDEX idx_trade_executions_entry_time ON trade_executions(entry_time_utc DESC);
CREATE INDEX idx_trade_executions_exit_time ON trade_executions(exit_time_utc DESC);
CREATE INDEX idx_trade_executions_direction ON trade_executions(trade_direction);

-- ============================================================================
-- TABLE: performance_metrics
-- Aggregated performance statistics per symbol
-- ============================================================================

CREATE TABLE IF NOT EXISTS performance_metrics (
  -- Primary key
  metrics_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Scope
  symbol VARCHAR(20) NOT NULL,
  period_type VARCHAR(20) NOT NULL CHECK (period_type IN ('ALL_TIME', 'DAILY', 'WEEKLY', 'MONTHLY')),
  period_start_utc TIMESTAMP WITH TIME ZONE,
  period_end_utc TIMESTAMP WITH TIME ZONE,

  -- Trade counts
  total_trades INT NOT NULL DEFAULT 0,
  winning_trades INT NOT NULL DEFAULT 0,
  losing_trades INT NOT NULL DEFAULT 0,

  -- Win rate
  win_rate_percent NUMERIC(5,2),  -- (winning_trades / total_trades) × 100

  -- Risk/Reward metrics
  avg_risk_reward_ratio NUMERIC(6,2),  -- Average R:R of all trades
  avg_actual_risk_reward_ratio NUMERIC(6,2), -- Average actual R:R achieved

  -- P&L metrics (points)
  total_points_pnl NUMERIC(19,4),      -- Sum of all points_pnl
  avg_points_pnl NUMERIC(19,4),        -- Average per trade
  max_win_points NUMERIC(19,4),        -- Largest win
  max_loss_points NUMERIC(19,4),       -- Largest loss (absolute value)

  -- P&L metrics (percentage)
  total_percent_pnl NUMERIC(8,4),      -- Sum of all percent_pnl
  avg_percent_pnl NUMERIC(6,4),        -- Average per trade

  -- Direction-specific metrics
  long_trades INT DEFAULT 0,
  long_winning INT DEFAULT 0,
  long_win_rate_percent NUMERIC(5,2),
  long_avg_pnl NUMERIC(19,4),

  short_trades INT DEFAULT 0,
  short_winning INT DEFAULT 0,
  short_win_rate_percent NUMERIC(5,2),
  short_avg_pnl NUMERIC(19,4),

  -- Consecutive trades
  consecutive_wins INT DEFAULT 0,
  consecutive_losses INT DEFAULT 0,
  max_consecutive_wins INT DEFAULT 0,
  max_consecutive_losses INT DEFAULT 0,

  -- Drawdown metrics
  peak_points_pnl NUMERIC(19,4),       -- Highest cumulative P&L
  current_drawdown_points NUMERIC(19,4), -- From peak to current
  max_drawdown_points NUMERIC(19,4),   -- Worst drawdown seen

  -- Metadata
  calculated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP NOT NULL,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP NOT NULL
);

-- Indexes for efficient queries
CREATE INDEX idx_performance_metrics_symbol_period ON performance_metrics(symbol, period_type, period_start_utc DESC);
CREATE INDEX idx_performance_metrics_period ON performance_metrics(period_type, period_start_utc DESC);
CREATE INDEX idx_performance_metrics_calculated ON performance_metrics(calculated_at DESC);

-- ============================================================================
-- COMMENTS (Documentation)
-- ============================================================================

COMMENT ON TABLE trade_executions IS 'Immutable record of each trade execution from entry to exit. Entry recorded when price reaches entry level, exit recorded when SL or Target is hit.';
COMMENT ON COLUMN trade_executions.exit_type IS 'How trade exited: STOP_LOSS, TARGET, or CLOSED (manual)';
COMMENT ON COLUMN trade_executions.actual_risk_reward_ratio IS 'Actual R:R based on actual_reward / actual_risk (may differ from original R:R if hit SL instead of exact target)';

COMMENT ON TABLE performance_metrics IS 'Aggregated performance statistics. Calculated from completed trades in trade_executions table. Immutable; recalculated when new trades close.';
COMMENT ON COLUMN performance_metrics.period_type IS 'ALL_TIME for lifetime, DAILY/WEEKLY/MONTHLY for time-windowed metrics';
COMMENT ON COLUMN performance_metrics.max_drawdown_points IS 'Peak-to-trough decline in cumulative P&L';
