-- Create candles table for Cerebro Signals
-- Stores normalized session-aligned candles

CREATE TABLE candles (
  -- Primary key: deterministic composite of symbol, timeframe, and open time
  id TEXT PRIMARY KEY,

  -- Market identifier
  symbol TEXT NOT NULL,

  -- Timeframe: 5m, 15m, 60m, 1D
  timeframe TEXT NOT NULL,

  -- UTC timestamps (ISO 8601 format)
  open_time_utc TIMESTAMP WITH TIME ZONE NOT NULL,
  close_time_utc TIMESTAMP WITH TIME ZONE NOT NULL,

  -- Knowledge time: when this candle became available in real time
  -- May differ from close_time for future swing confirmation logic
  knowledge_time_utc TIMESTAMP WITH TIME ZONE NOT NULL,

  -- OHLCV data
  open DECIMAL(20, 8) NOT NULL,
  high DECIMAL(20, 8) NOT NULL,
  low DECIMAL(20, 8) NOT NULL,
  close DECIMAL(20, 8) NOT NULL,
  volume BIGINT NOT NULL,

  -- Candle status: DEVELOPING or CLOSED
  status TEXT NOT NULL CHECK (status IN ('DEVELOPING', 'CLOSED')),

  -- Metadata
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now(),

  CONSTRAINT valid_ohlc CHECK (high >= low AND high >= open AND high >= close AND low <= open AND low <= close)
);

-- Unique constraint: (symbol, timeframe, open_time_utc)
-- Prevents duplicate candles
CREATE UNIQUE INDEX candles_unique_key ON candles (symbol, timeframe, open_time_utc);

-- Query efficiency indexes
CREATE INDEX candles_symbol_timeframe_open_time ON candles (symbol, timeframe, open_time_utc DESC);
CREATE INDEX candles_symbol_timeframe_knowledge_time ON candles (symbol, timeframe, knowledge_time_utc DESC);
CREATE INDEX candles_open_time_idx ON candles (open_time_utc DESC);
CREATE INDEX candles_knowledge_time_idx ON candles (knowledge_time_utc DESC);

-- Table comments
COMMENT ON TABLE candles IS 'Normalized session-aligned market candles for Cerebro Signals. All timestamps stored in UTC. Timeframes: 5m (09:15-15:30), 15m (09:15-15:30), 60m (09:15-15:15, with 15:15-15:30 remainder not included), 1D (09:15-15:30). Status indicates if candle is DEVELOPING or CLOSED.';
COMMENT ON COLUMN candles.id IS 'Deterministic ID: symbol-timeframe-open_time_ms';
COMMENT ON COLUMN candles.symbol IS 'Market symbol (e.g., RELIANCE, INFY)';
COMMENT ON COLUMN candles.timeframe IS 'Candle timeframe: 5m, 15m, 60m, 1D';
COMMENT ON COLUMN candles.open_time_utc IS 'Candle open time in UTC (session start time for daily)';
COMMENT ON COLUMN candles.close_time_utc IS 'Candle close time in UTC (session end time for daily)';
COMMENT ON COLUMN candles.knowledge_time_utc IS 'When this candle became known/available in real time';
COMMENT ON COLUMN candles.status IS 'DEVELOPING: candle still forming; CLOSED: candle confirmed';
