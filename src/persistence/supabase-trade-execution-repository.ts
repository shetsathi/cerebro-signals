/**
 * Supabase Trade Execution Repository
 *
 * Implements trade lifecycle tracking with full audit trail.
 */

import { SupabaseClient } from '@supabase/supabase-js';
import {
  TradeExecutionRepository,
  TradeExecutionRecord,
  SavedTradeExecution,
} from './trade-execution-repository.interface';
import { TradeExecution, TradeStatus, ExitType } from '../domain/trade-execution';

interface TradeExecutionRow {
  trade_id: string;
  signal_id: string;
  entry_price?: number;
  entry_time_utc?: string;
  entry_slippage?: number;
  entry_bar_index?: number;
  exit_price?: number;
  exit_time_utc?: string;
  exit_type?: string;
  exit_bar_index?: number;
  pnl_amount?: number;
  pnl_percent?: number;
  risk_hit_percent?: number;
  status: string;
  duration_minutes?: number;
  bars_held?: number;
  notes?: string;
  created_at: string;
  updated_at: string;
}

export class SupabaseTradeExecutionRepository implements TradeExecutionRepository {
  constructor(private supabase: SupabaseClient) {}

  async create(trade: TradeExecutionRecord): Promise<SavedTradeExecution> {
    const row = {
      signal_id: trade.signalId,
      entry_price: trade.entryPrice,
      entry_time_utc: trade.entryTimeUTC?.toISOString(),
      entry_slippage: trade.entrySlippagePercent,
      entry_bar_index: trade.entryBarIndex,
      exit_price: trade.exitPrice,
      exit_time_utc: trade.exitTimeUTC?.toISOString(),
      exit_type: trade.exitType,
      exit_bar_index: trade.exitBarIndex,
      pnl_amount: trade.pnlAmount,
      pnl_percent: trade.pnlPercent,
      risk_hit_percent: trade.riskHitPercent,
      status: trade.status || 'PENDING',
      duration_minutes: trade.durationMinutes,
      bars_held: trade.barsHeld,
      notes: trade.notes,
    };

    const { data, error } = await this.supabase
      .from('trade_executions')
      .insert([row])
      .select()
      .single();

    if (error) {
      throw new Error(`Failed to create trade execution: ${error.message}`);
    }

    return this.rowToTrade(data as TradeExecutionRow);
  }

  async getById(tradeId: string): Promise<SavedTradeExecution | null> {
    const { data, error } = await this.supabase
      .from('trade_executions')
      .select('*')
      .eq('trade_id', tradeId)
      .single();

    if (error && error.code !== 'PGRST116') {
      throw new Error(`Failed to get trade: ${error.message}`);
    }

    return data ? this.rowToTrade(data as TradeExecutionRow) : null;
  }

  async getBySignalId(signalId: string): Promise<SavedTradeExecution | null> {
    const { data, error } = await this.supabase
      .from('trade_executions')
      .select('*')
      .eq('signal_id', signalId)
      .single();

    if (error && error.code !== 'PGRST116') {
      throw new Error(`Failed to get trade by signal: ${error.message}`);
    }

    return data ? this.rowToTrade(data as TradeExecutionRow) : null;
  }

  async getBySymbol(
    symbol: string,
    status?: TradeStatus,
    limit: number = 50,
  ): Promise<SavedTradeExecution[]> {
    // Note: Need to join with signals table to filter by symbol
    let query = this.supabase
      .from('trade_executions')
      .select('*, signals(symbol)')
      .eq('signals.symbol', symbol);

    if (status) {
      query = query.eq('status', status);
    }

    query = query.order('created_at', { ascending: false }).limit(limit);

    const { data, error } = await query;

    if (error) {
      throw new Error(`Failed to get trades: ${error.message}`);
    }

    return (data || []).map((row: any) => this.rowToTrade(row as TradeExecutionRow));
  }

  async getOpen(symbol?: string): Promise<SavedTradeExecution[]> {
    let query = this.supabase
      .from('trade_executions')
      .select('*')
      .in('status', ['PENDING', 'ENTRY_FILLED', 'WAITING_EXIT']);

    if (symbol) {
      query = query.eq('signals.symbol', symbol);
    }

    const { data, error } = await query.order('created_at', { ascending: false });

    if (error) {
      throw new Error(`Failed to get open trades: ${error.message}`);
    }

    return (data || []).map(row => this.rowToTrade(row as TradeExecutionRow));
  }

  async getClosed(symbol?: string, limit: number = 50): Promise<SavedTradeExecution[]> {
    let query = this.supabase
      .from('trade_executions')
      .select('*')
      .eq('status', 'CLOSED');

    if (symbol) {
      query = query.eq('signals.symbol', symbol);
    }

    const { data, error } = await query
      .order('updated_at', { ascending: false })
      .limit(limit);

    if (error) {
      throw new Error(`Failed to get closed trades: ${error.message}`);
    }

    return (data || []).map(row => this.rowToTrade(row as TradeExecutionRow));
  }

  async updateStatus(tradeId: string, status: TradeStatus): Promise<void> {
    const { error } = await this.supabase
      .from('trade_executions')
      .update({ status, updated_at: new Date().toISOString() })
      .eq('trade_id', tradeId);

    if (error) {
      throw new Error(`Failed to update trade status: ${error.message}`);
    }
  }

  async recordEntry(
    tradeId: string,
    entryPrice: number,
    entryTimeUTC: Date,
    entryBarIndex: number,
  ): Promise<void> {
    const { error } = await this.supabase
      .from('trade_executions')
      .update({
        entry_price: entryPrice,
        entry_time_utc: entryTimeUTC.toISOString(),
        entry_bar_index: entryBarIndex,
        status: 'ENTRY_FILLED',
        updated_at: new Date().toISOString(),
      })
      .eq('trade_id', tradeId);

    if (error) {
      throw new Error(`Failed to record entry: ${error.message}`);
    }
  }

  async recordExit(
    tradeId: string,
    exitPrice: number,
    exitTimeUTC: Date,
    exitType: ExitType,
    exitBarIndex: number,
  ): Promise<void> {
    const { error } = await this.supabase
      .from('trade_executions')
      .update({
        exit_price: exitPrice,
        exit_time_utc: exitTimeUTC.toISOString(),
        exit_type: exitType,
        exit_bar_index: exitBarIndex,
        status: 'CLOSED',
        updated_at: new Date().toISOString(),
      })
      .eq('trade_id', tradeId);

    if (error) {
      throw new Error(`Failed to record exit: ${error.message}`);
    }
  }

  async updatePnL(
    tradeId: string,
    pnlAmount: number,
    pnlPercent: number,
    riskHitPercent: number,
    durationMinutes: number,
    barsHeld: number,
  ): Promise<void> {
    const { error } = await this.supabase
      .from('trade_executions')
      .update({
        pnl_amount: pnlAmount,
        pnl_percent: pnlPercent,
        risk_hit_percent: riskHitPercent,
        duration_minutes: durationMinutes,
        bars_held: barsHeld,
        updated_at: new Date().toISOString(),
      })
      .eq('trade_id', tradeId);

    if (error) {
      throw new Error(`Failed to update PNL: ${error.message}`);
    }
  }

  async updateNotes(tradeId: string, notes: string): Promise<void> {
    const { error } = await this.supabase
      .from('trade_executions')
      .update({ notes, updated_at: new Date().toISOString() })
      .eq('trade_id', tradeId);

    if (error) {
      throw new Error(`Failed to update notes: ${error.message}`);
    }
  }

  private rowToTrade(row: TradeExecutionRow): SavedTradeExecution {
    return {
      tradeId: row.trade_id,
      signalId: row.signal_id,
      entryPrice: row.entry_price,
      entryTimeUTC: row.entry_time_utc ? new Date(row.entry_time_utc) : undefined,
      entrySlippagePercent: row.entry_slippage,
      entryBarIndex: row.entry_bar_index,
      exitPrice: row.exit_price,
      exitTimeUTC: row.exit_time_utc ? new Date(row.exit_time_utc) : undefined,
      exitType: row.exit_type as ExitType,
      exitBarIndex: row.exit_bar_index,
      pnlAmount: row.pnl_amount,
      pnlPercent: row.pnl_percent,
      riskHitPercent: row.risk_hit_percent,
      status: row.status as TradeStatus,
      durationMinutes: row.duration_minutes,
      barsHeld: row.bars_held,
      notes: row.notes,
      createdAt: new Date(row.created_at),
      updatedAt: new Date(row.updated_at),
    };
  }
}
