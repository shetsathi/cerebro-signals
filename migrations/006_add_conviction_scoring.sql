-- Add conviction scoring columns for signal quality filtering
-- Enables prioritization of high-confidence signals

ALTER TABLE signals ADD COLUMN IF NOT EXISTS (
  conviction_score INT CHECK (conviction_score >= 0 AND conviction_score <= 100),
  conviction_level TEXT CHECK (conviction_level IN ('LOW', 'MEDIUM', 'HIGH', NULL)),
  conviction_factors JSONB                -- Breakdown: {regime: 20, setup: 15, trigger: 20, ratio: 25}
);

-- Index for filtering by conviction
CREATE INDEX signals_conviction_score ON signals(conviction_score DESC) WHERE conviction_score IS NOT NULL;
CREATE INDEX signals_conviction_level ON signals(conviction_level) WHERE conviction_level IS NOT NULL;

-- Comments
COMMENT ON COLUMN signals.conviction_score IS 'Signal quality score 0-100. Higher = more confident. Based on regime, setup type, trigger type, R:R ratio.';
COMMENT ON COLUMN signals.conviction_level IS 'Categorical: LOW (0-40), MEDIUM (40-70), HIGH (70-100). Used for filtering/alerting.';
COMMENT ON COLUMN signals.conviction_factors IS 'Breakdown of score components: {regime: X, setup: Y, trigger: Z, ratio: W} (sums to conviction_score)';
