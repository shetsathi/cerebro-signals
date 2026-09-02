/**
 * Supabase Signal Repository
 *
 * Implements immutable signal persistence.
 * Never overwrites original signal prices.
 */

import { SupabaseClient } from '@supabase/supabase-js';
import { SignalRepository, SignalRecord, SavedSignal } from './signal-repository.interface';

interface SignalRow {
  signal_id: string;
  symbol: string;
  decision_action: string;
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
  evaluation_time_utc: string;
  knowledge_time_utc: string;
  ruleset_version: string;
  config_hash: string;
  status: string;
  created_at: string;
}

export class SupabaseSignalRepository implements SignalRepository {
  constructor(private supabase: SupabaseClient) {}

  async save(signal: SignalRecord): Promise<SavedSignal> {
    const row: Partial<SignalRow> = {
      symbol: signal.symbol,
      decision_action: signal.decision_action,
      decision_id: signal.decision_id,
      trigger_id: signal.trigger_id,
      setup_id: signal.setup_id,
      risk_ids: signal.risk_ids,
      entry_price: signal.entry_price,
      stop_loss_price: signal.stop_loss_price,
      target_price: signal.target_price,
      risk_amount: signal.risk_amount,
      reward_amount: signal.reward_amount,
      risk_reward_ratio: signal.risk_reward_ratio,
      evaluation_time_utc: signal.evaluation_time_utc.toISOString(),
      knowledge_time_utc: signal.knowledge_time_utc.toISOString(),
      ruleset_version: signal.ruleset_version,
      config_hash: signal.config_hash,
      status: signal.status || 'GENERATED',
    };

    const { data, error } = await this.supabase
      .from('signals')
      .insert([row])
      .select()
      .single();

    if (error) {
      throw new Error(`Failed to save signal: ${error.message}`);
    }

    return this.rowToSignal(data as SignalRow);
  }

  async getById(signal_id: string): Promise<SavedSignal | null> {
    const { data, error } = await this.supabase
      .from('signals')
      .select('*')
      .eq('signal_id', signal_id)
      .single();

    if (error && error.code !== 'PGRST116') {
      // PGRST116 = no rows found
      throw new Error(`Failed to get signal: ${error.message}`);
    }

    return data ? this.rowToSignal(data as SignalRow) : null;
  }

  async getByDecisionId(decision_id: string): Promise<SavedSignal | null> {
    const { data, error } = await this.supabase
      .from('signals')
      .select('*')
      .eq('decision_id', decision_id)
      .single();

    if (error && error.code !== 'PGRST116') {
      // PGRST116 = no rows found
      throw new Error(`Failed to get signal by decision_id: ${error.message}`);
    }

    return data ? this.rowToSignal(data as SignalRow) : null;
  }

  async getBySymbol(symbol: string, limit: number = 50): Promise<SavedSignal[]> {
    const { data, error } = await this.supabase
      .from('signals')
      .select('*')
      .eq('symbol', symbol)
      .order('evaluation_time_utc', { ascending: false })
      .limit(limit);

    if (error) {
      throw new Error(`Failed to get signals: ${error.message}`);
    }

    return (data || []).map(row => this.rowToSignal(row as SignalRow));
  }

  async getActive(symbol: string): Promise<SavedSignal[]> {
    const { data, error } = await this.supabase
      .from('signals')
      .select('*')
      .eq('symbol', symbol)
      .in('status', ['GENERATED', 'ACTIVE'])
      .order('evaluation_time_utc', { ascending: false });

    if (error) {
      throw new Error(`Failed to get active signals: ${error.message}`);
    }

    return (data || []).map(row => this.rowToSignal(row as SignalRow));
  }

  async updateStatus(signal_id: string, status: string): Promise<void> {
    const { error } = await this.supabase
      .from('signals')
      .update({ status })
      .eq('signal_id', signal_id);

    if (error) {
      throw new Error(`Failed to update signal status: ${error.message}`);
    }
  }

  private rowToSignal(row: SignalRow): SavedSignal {
    return {
      signal_id: row.signal_id,
      symbol: row.symbol,
      decision_action: row.decision_action as 'LONG' | 'SHORT',
      decision_id: row.decision_id,
      trigger_id: row.trigger_id,
      setup_id: row.setup_id,
      risk_ids: row.risk_ids,
      entry_price: row.entry_price,
      stop_loss_price: row.stop_loss_price,
      target_price: row.target_price,
      risk_amount: row.risk_amount,
      reward_amount: row.reward_amount,
      risk_reward_ratio: row.risk_reward_ratio,
      evaluation_time_utc: new Date(row.evaluation_time_utc),
      knowledge_time_utc: new Date(row.knowledge_time_utc),
      ruleset_version: row.ruleset_version,
      config_hash: row.config_hash,
      status: row.status as 'GENERATED' | 'ACTIVE' | 'CLOSED' | 'INVALIDATED',
      created_at: new Date(row.created_at),
    };
  }
}
