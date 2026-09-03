/**
 * Phase 3: Signal Quality Filtering — Conviction Scoring
 *
 * Adds conviction score and level columns to signals table.
 * Score: 0-100 based on 5 factors (Regime, Setup, Trigger, R:R, Risk)
 * Level: LOW (<40), MEDIUM (40-69), HIGH (70+)
 * Smart filtering: Only HIGH conviction signals trigger Telegram alerts
 */

-- Add conviction columns to signals table
ALTER TABLE signals
ADD COLUMN IF NOT EXISTS conviction_score NUMERIC(5,2) CHECK (conviction_score >= 0 AND conviction_score <= 100),
ADD COLUMN IF NOT EXISTS conviction_level VARCHAR(20) CHECK (conviction_level IN ('LOW', 'MEDIUM', 'HIGH')),
ADD COLUMN IF NOT EXISTS conviction_factors JSONB;

-- Create indexes for conviction queries
CREATE INDEX IF NOT EXISTS idx_signals_conviction_score ON signals(conviction_score DESC);
CREATE INDEX IF NOT EXISTS idx_signals_conviction_level ON signals(conviction_level);

-- Add comments
COMMENT ON COLUMN signals.conviction_score IS 'Signal quality score (0-100): 0-39=LOW, 40-69=MEDIUM, 70-100=HIGH. Based on regime, setup, trigger, R:R, and risk validity.';
COMMENT ON COLUMN signals.conviction_level IS 'Conviction level: LOW (<40), MEDIUM (40-69), HIGH (70+). Only HIGH signals trigger Telegram alerts.';
COMMENT ON COLUMN signals.conviction_factors IS 'JSON breakdown: {regimeConviction, setupQuality, triggerConfirmation, riskRewardRatio, riskValidity}. Each 0-20 points, total 100.';
