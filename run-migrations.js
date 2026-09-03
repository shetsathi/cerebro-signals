const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

const migrations = [
  {
    name: 'Phase 2a: Trade Executions',
    sql: `CREATE TABLE IF NOT EXISTS trade_executions (
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
CREATE INDEX IF NOT EXISTS trade_executions_pnl_amount ON trade_executions(pnl_amount) WHERE pnl_amount IS NOT NULL;`
  },
  {
    name: 'Phase 2b: Performance Metrics',
    sql: `CREATE TABLE IF NOT EXISTS performance_metrics (
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
CREATE INDEX IF NOT EXISTS performance_metrics_created_at ON performance_metrics(created_at DESC);`
  },
  {
    name: 'Phase 3: Conviction Scoring',
    sql: `ALTER TABLE signals ADD COLUMN IF NOT EXISTS conviction_score INT CHECK (conviction_score >= 0 AND conviction_score <= 100);
ALTER TABLE signals ADD COLUMN IF NOT EXISTS conviction_level TEXT CHECK (conviction_level IN ('LOW', 'MEDIUM', 'HIGH', NULL));
ALTER TABLE signals ADD COLUMN IF NOT EXISTS conviction_factors JSONB;
CREATE INDEX IF NOT EXISTS signals_conviction_score ON signals(conviction_score DESC) WHERE conviction_score IS NOT NULL;
CREATE INDEX IF NOT EXISTS signals_conviction_level ON signals(conviction_level) WHERE conviction_level IS NOT NULL;`
  }
];

async function runMigrations() {
  console.log('Starting migrations deployment...\n');

  for (const migration of migrations) {
    console.log(`▶ ${migration.name}`);
    try {
      const { error } = await supabase.rpc('exec', { sql: migration.sql });

      if (error) {
        console.log(`  ✗ Failed: ${error.message}`);
      } else {
        console.log(`  ✓ Success`);
      }
    } catch (err) {
      console.log(`  ✗ Error: ${err.message}`);
    }
    console.log();
  }

  console.log('Migrations complete!');
}

runMigrations();
