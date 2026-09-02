-- Create trade_executions table for tracking trade lifecycle
-- Records entry fills, exit hits, and PNL calculation

CREATE TABLE trade_executions (
  -- Primary key
  trade_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Link to signal
  signal_id UUID NOT NULL REFERENCES signals(signal_id) ON DELETE CASCADE,

  -- Entry execution
  entry_price DECIMAL(20, 8),         -- Actual entry filled price (null if not filled)
  entry_time_utc TIMESTAMP WITH TIME ZONE,
  entry_slippage DECIMAL(10, 8),      -- (actual_entry - signal_entry) / signal_entry * 100
  entry_bar_index INT,                -- Which candle bar entry was filled on

  -- Exit execution
  exit_price DECIMAL(20, 8),          -- Actual exit price (null if still open)
  exit_time_utc TIMESTAMP WITH TIME ZONE,
  exit_type TEXT CHECK (exit_type IN ('SL_HIT', 'TARGET_HIT', 'MANUAL_EXIT', 'TIMEOUT', NULL)),
  exit_bar_index INT,                 -- Which candle bar exit was filled on

  -- PNL calculation (immutable after exit)
  pnl_amount DECIMAL(20, 8),          -- (exit - entry) * qty (for LONG: positive if exit > entry)
  pnl_percent DECIMAL(10, 4),         -- (exit - entry) / entry * 100
  risk_hit_percent DECIMAL(10, 4),    -- How close did we get to SL? (distance to SL / distance entry to SL * 100)

  -- Trade lifecycle
  status TEXT NOT NULL DEFAULT 'PENDING' CHECK (status IN ('PENDING', 'ENTRY_FILLED', 'WAITING_EXIT', 'CLOSED')),
  duration_minutes INT,               -- (exit_time - entry_time) in minutes
  bars_held INT,                      -- Number of candle bars held

  -- Metadata
  notes TEXT,                         -- Manual notes (exit reason, etc.)
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- Indexes for efficient queries
CREATE INDEX trade_executions_signal_id ON trade_executions(signal_id);
CREATE INDEX trade_executions_status ON trade_executions(status);
CREATE INDEX trade_executions_exit_type ON trade_executions(exit_type) WHERE exit_type IS NOT NULL;
CREATE INDEX trade_executions_created_at ON trade_executions(created_at DESC);
CREATE INDEX trade_executions_pnl_amount ON trade_executions(pnl_amount) WHERE pnl_amount IS NOT NULL;

-- Comments
COMMENT ON TABLE trade_executions IS 'Trade lifecycle tracking: entry fills, exit hits, PNL calculation. Immutable once closed.';
COMMENT ON COLUMN trade_executions.signal_id IS 'Reference to generated signal (immutable)';
COMMENT ON COLUMN trade_executions.entry_price IS 'Actual price at which entry was filled (null if pending)';
COMMENT ON COLUMN trade_executions.entry_slippage IS 'Difference between signal entry and actual entry (in percent)';
COMMENT ON COLUMN trade_executions.exit_type IS 'How trade exited: SL_HIT, TARGET_HIT, MANUAL_EXIT, TIMEOUT';
COMMENT ON COLUMN trade_executions.pnl_amount IS 'Absolute profit/loss amount (exit - entry)';
COMMENT ON COLUMN trade_executions.pnl_percent IS 'Relative profit/loss percent (exit - entry) / entry * 100';
COMMENT ON COLUMN trade_executions.risk_hit_percent IS 'How much of the risk was realized (distance traveled toward SL)';
COMMENT ON COLUMN trade_executions.status IS 'Trade state: PENDING → ENTRY_FILLED → WAITING_EXIT → CLOSED';
