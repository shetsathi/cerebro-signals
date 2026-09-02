/**
 * Signal Repository Interface
 *
 * Abstraction for persistent signal storage.
 * Follows immutable audit trail pattern: signals created once, never modified.
 */

export interface SignalRecord {
  symbol: string;
  decision_action: 'LONG' | 'SHORT';
  decision_id: string;
  trigger_id?: string;
  setup_id?: string;
  risk_ids?: string[];

  entry_price: number;
  stop_loss_price: number;
  target_price?: number;

  risk_amount?: number;
  reward_amount?: number;
  risk_reward_ratio?: number;

  evaluation_time_utc: Date;
  knowledge_time_utc: Date;

  ruleset_version: string;
  config_hash: string;

  status?: 'GENERATED' | 'ACTIVE' | 'CLOSED' | 'INVALIDATED';
}

export interface SavedSignal extends SignalRecord {
  signal_id: string;
  created_at: Date;
}

export interface SignalRepository {
  /**
   * Save a new signal (immutable)
   */
  save(signal: SignalRecord): Promise<SavedSignal>;

  /**
   * Retrieve signal by UUID ID
   */
  getById(signal_id: string): Promise<SavedSignal | null>;

  /**
   * Retrieve signal by decision ID (V1 Decision.decisionId)
   */
  getByDecisionId(decision_id: string): Promise<SavedSignal | null>;

  /**
   * Get signals by symbol
   */
  getBySymbol(symbol: string, limit?: number): Promise<SavedSignal[]>;

  /**
   * Get active signals (status = GENERATED or ACTIVE)
   */
  getActive(symbol: string): Promise<SavedSignal[]>;

  /**
   * Update signal status (only status field, never touch prices)
   */
  updateStatus(signal_id: string, status: string): Promise<void>;
}
