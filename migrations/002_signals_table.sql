-- Create signals table for persistent signal storage
-- Immutable audit trail: original signal values never overwritten
-- Live price updates stored separately (future)

CREATE TABLE signals (
  -- Primary key
  signal_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Signal identity (immutable)
  symbol TEXT NOT NULL,
  decision_action TEXT NOT NULL CHECK (decision_action IN ('LONG', 'SHORT')),

  -- V1 engine references (for traceability)
  decision_id TEXT NOT NULL UNIQUE,  -- V1 Decision.decisionId
  trigger_id TEXT,                   -- V1 Trigger.triggerId
  setup_id TEXT,                     -- V1 Setup.setupId
  risk_ids TEXT[],                   -- V1 Risk.riskId array (collapsed from RiskSnapshot)

  -- Entry/Stop/Target (immutable, from frozen Risk engine)
  entry_price DECIMAL(20, 8) NOT NULL,
  stop_loss_price DECIMAL(20, 8) NOT NULL,
  target_price DECIMAL(20, 8),  -- Single target from Risk.target (NOT T1/T2)

  -- Risk metrics (from frozen Risk engine)
  risk_amount DECIMAL(20, 8),  -- Risk.risk
  reward_amount DECIMAL(20, 8),  -- Risk.reward
  risk_reward_ratio DECIMAL(10, 4),  -- Risk.riskRewardRatio

  -- Timestamps (immutable, represent evaluation moment)
  evaluation_time_utc TIMESTAMP WITH TIME ZONE NOT NULL,  -- asOfTimeUTC
  knowledge_time_utc TIMESTAMP WITH TIME ZONE NOT NULL,   -- knowledgeTimeUTC

  -- Configuration tracking (immutable, for audit)
  ruleset_version TEXT NOT NULL,  -- DecisionEngine config version
  config_hash TEXT NOT NULL,      -- DecisionEngine config hash

  -- Signal status (queryable, not for editing original values)
  status TEXT NOT NULL DEFAULT 'GENERATED' CHECK (status IN ('GENERATED', 'ACTIVE', 'CLOSED', 'INVALIDATED')),

  -- Server-side tracking
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),

  -- Constraints
  CONSTRAINT valid_prices CHECK (
    (decision_action = 'LONG' AND stop_loss_price < entry_price) OR
    (decision_action = 'SHORT' AND stop_loss_price > entry_price)
  ),
  CONSTRAINT valid_risk_reward CHECK (risk_reward_ratio IS NULL OR risk_reward_ratio > 0)
);

-- Indexes for efficient queries
CREATE UNIQUE INDEX signals_decision_id ON signals(decision_id);
CREATE INDEX signals_symbol_time ON signals(symbol, evaluation_time_utc DESC);
CREATE INDEX signals_status ON signals(status);
CREATE INDEX signals_action ON signals(decision_action);
CREATE INDEX signals_created_at ON signals(created_at DESC);
CREATE INDEX signals_setup_id ON signals(setup_id) WHERE setup_id IS NOT NULL;

-- Comments for clarity
COMMENT ON TABLE signals IS 'Immutable audit trail of generated trading signals. Original Entry/Stop/Target values never modified. Live price tracking stored separately.';
COMMENT ON COLUMN signals.decision_id IS 'Immutable reference to frozen V1 Decision.decisionId';
COMMENT ON COLUMN signals.entry_price IS 'Immutable entry price from V1 Risk engine at generation time';
COMMENT ON COLUMN signals.stop_loss_price IS 'Immutable stop loss price from V1 Risk engine at generation time';
COMMENT ON COLUMN signals.target_price IS 'Immutable target price from V1 Risk engine. Single target, not T1/T2 (frozen Risk contract limitation)';
COMMENT ON COLUMN signals.risk_reward_ratio IS 'Immutable R:R ratio from V1 Risk engine';
COMMENT ON COLUMN signals.evaluation_time_utc IS 'Timestamp when V1 engine evaluated this signal (asOfTimeUTC, no look-ahead)';
COMMENT ON COLUMN signals.knowledge_time_utc IS 'Timestamp when signal became known (knowledgeTimeUTC)';

-- Create signal_configs table for configuration versioning
CREATE TABLE signal_configs (
  config_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Version tracking
  ruleset_version TEXT NOT NULL,
  config_hash TEXT NOT NULL UNIQUE,

  -- Frozen config snapshots (JSONB)
  decision_config JSONB NOT NULL,
  risk_config JSONB NOT NULL,
  trigger_config JSONB NOT NULL,
  setup_config JSONB NOT NULL,
  level_config JSONB NOT NULL,
  structure_config JSONB NOT NULL,

  -- Metadata
  description TEXT,

  -- Timestamp
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

CREATE UNIQUE INDEX signal_configs_hash ON signal_configs(config_hash);
COMMENT ON TABLE signal_configs IS 'Immutable configuration snapshots for each ruleset version. Used to verify signal generation rules.';

-- Create telegram_notifications table for delivery tracking
CREATE TABLE telegram_notifications (
  notification_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Link to signal
  signal_id UUID NOT NULL REFERENCES signals(signal_id) ON DELETE CASCADE,

  -- Message data
  notification_type TEXT NOT NULL CHECK (notification_type IN ('SIGNAL_GENERATED')),
  message_text TEXT NOT NULL,

  -- Delivery tracking
  sent BOOLEAN DEFAULT FALSE,
  telegram_message_id INTEGER,
  error_message TEXT,

  -- Timestamps
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  sent_at TIMESTAMP WITH TIME ZONE
);

CREATE INDEX telegram_notifications_signal_id ON telegram_notifications(signal_id);
CREATE INDEX telegram_notifications_sent ON telegram_notifications(sent);
COMMENT ON TABLE telegram_notifications IS 'Audit trail of Telegram notifications. Never log bot token or credentials.';
