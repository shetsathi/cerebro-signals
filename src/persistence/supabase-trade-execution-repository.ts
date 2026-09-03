/**
 * Supabase Trade Execution Repository
 *
 * Implements immutable trade execution persistence.
 * Entry recorded on hit, exit recorded when SL/Target hit.
 */

import { SupabaseClient } from "@supabase/supabase-js";
import {
  TradeExecutionRepository,
  TradeExecutionRecord,
} from "./trade-execution-repository.interface";
import { TradeExecution, TradeDirection, ExitType, ExecutionStatus } from "../domain/trade-execution";

interface TradeExecutionRow {
  execution_id: string;
  signal_id: string;
  symbol: string;
  trade_direction: string;
  entry_price: number;
  entry_time_utc: string;
  entry_bar_index: number;
  stop_loss_price: number;
  target_price?: number;
  exit_price?: number;
  exit_time_utc?: string;
  exit_bar_index?: number;
  exit_type?: string;
  points_pnl?: number;
  percent_pnl?: number;
  rupees_pnl?: number;
  risk_amount?: number;
  reward_amount?: number;
  actual_risk_amount?: number;
  actual_reward_amount?: number;
  risk_reward_ratio?: number;
  actual_risk_reward_ratio?: number;
  status: string;
  evaluation_time_utc: string;
  knowledge_time_utc: string;
  created_at: string;
  updated_at: string;
}

export class SupabaseTradeExecutionRepository implements TradeExecutionRepository {
  constructor(private supabase: SupabaseClient) {}

  async recordEntry(
    signal_id: string,
    symbol: string,
    direction: TradeDirection,
    entry_price: number,
    entry_time_utc: Date,
    entry_bar_index: number,
    stop_loss_price: number,
    target_price: number | undefined,
    evaluation_time_utc: Date,
    knowledge_time_utc: Date
  ): Promise<TradeExecution> {
    const row: Partial<TradeExecutionRow> = {
      signal_id,
      symbol,
      trade_direction: direction,
      entry_price,
      entry_time_utc: entry_time_utc.toISOString(),
      entry_bar_index,
      stop_loss_price,
      target_price,
      status: "OPEN",
      evaluation_time_utc: evaluation_time_utc.toISOString(),
      knowledge_time_utc: knowledge_time_utc.toISOString(),
    };

    const { data, error } = await this.supabase
      .from("trade_executions")
      .insert([row])
      .select()
      .single();

    if (error) {
      throw new Error(`Failed to record trade entry: ${error.message}`);
    }

    return this.rowToExecution(data as TradeExecutionRow);
  }

  async recordExit(
    execution_id: string,
    exit_price: number,
    exit_time_utc: Date,
    exit_bar_index: number,
    exit_type: ExitType,
    points_pnl: number,
    percent_pnl: number,
    actual_risk_amount: number | undefined,
    actual_reward_amount: number | undefined,
    actual_risk_reward_ratio: number | undefined
  ): Promise<TradeExecution> {
    const { data, error } = await this.supabase
      .from("trade_executions")
      .update({
        exit_price,
        exit_time_utc: exit_time_utc.toISOString(),
        exit_bar_index,
        exit_type,
        points_pnl,
        percent_pnl,
        actual_risk_amount,
        actual_reward_amount,
        actual_risk_reward_ratio,
        status: "CLOSED",
        updated_at: new Date().toISOString(),
      })
      .eq("execution_id", execution_id)
      .select()
      .single();

    if (error) {
      throw new Error(`Failed to record trade exit: ${error.message}`);
    }

    return this.rowToExecution(data as TradeExecutionRow);
  }

  async getById(execution_id: string): Promise<TradeExecution | null> {
    const { data, error } = await this.supabase
      .from("trade_executions")
      .select("*")
      .eq("execution_id", execution_id)
      .single();

    if (error && error.code !== "PGRST116") {
      throw new Error(`Failed to get execution: ${error.message}`);
    }

    return data ? this.rowToExecution(data as TradeExecutionRow) : null;
  }

  async getBySignalId(signal_id: string): Promise<TradeExecution | null> {
    const { data, error } = await this.supabase
      .from("trade_executions")
      .select("*")
      .eq("signal_id", signal_id)
      .single();

    if (error && error.code !== "PGRST116") {
      throw new Error(`Failed to get execution by signal: ${error.message}`);
    }

    return data ? this.rowToExecution(data as TradeExecutionRow) : null;
  }

  async getBySymbol(symbol: string, limit: number = 50): Promise<TradeExecution[]> {
    const { data, error } = await this.supabase
      .from("trade_executions")
      .select("*")
      .eq("symbol", symbol)
      .order("entry_time_utc", { ascending: false })
      .limit(limit);

    if (error) {
      throw new Error(`Failed to get executions: ${error.message}`);
    }

    return (data || []).map(row => this.rowToExecution(row as TradeExecutionRow));
  }

  async getOpenExecutions(symbol?: string): Promise<TradeExecution[]> {
    let query = this.supabase.from("trade_executions").select("*").eq("status", "OPEN");

    if (symbol) {
      query = query.eq("symbol", symbol);
    }

    const { data, error } = await query.order("entry_time_utc", { ascending: false });

    if (error) {
      throw new Error(`Failed to get open executions: ${error.message}`);
    }

    return (data || []).map(row => this.rowToExecution(row as TradeExecutionRow));
  }

  async getClosedExecutions(
    symbol?: string,
    limit: number = 50,
    offset: number = 0
  ): Promise<TradeExecution[]> {
    let query = this.supabase
      .from("trade_executions")
      .select("*")
      .eq("status", "CLOSED")
      .order("exit_time_utc", { ascending: false })
      .range(offset, offset + limit - 1);

    if (symbol) {
      query = query.eq("symbol", symbol);
    }

    const { data, error } = await query;

    if (error) {
      throw new Error(`Failed to get closed executions: ${error.message}`);
    }

    return (data || []).map(row => this.rowToExecution(row as TradeExecutionRow));
  }

  async getByStatus(statuses: ExecutionStatus[]): Promise<TradeExecution[]> {
    const { data, error } = await this.supabase
      .from("trade_executions")
      .select("*")
      .in("status", statuses)
      .order("entry_time_utc", { ascending: false });

    if (error) {
      throw new Error(`Failed to get executions by status: ${error.message}`);
    }

    return (data || []).map(row => this.rowToExecution(row as TradeExecutionRow));
  }

  private rowToExecution(row: TradeExecutionRow): TradeExecution {
    return {
      execution_id: row.execution_id,
      signal_id: row.signal_id,
      symbol: row.symbol,
      trade_direction: row.trade_direction as TradeDirection,
      entry_price: row.entry_price,
      entry_time_utc: new Date(row.entry_time_utc),
      entry_bar_index: row.entry_bar_index,
      stop_loss_price: row.stop_loss_price,
      target_price: row.target_price,
      exit_price: row.exit_price,
      exit_time_utc: row.exit_time_utc ? new Date(row.exit_time_utc) : undefined,
      exit_bar_index: row.exit_bar_index,
      exit_type: row.exit_type as ExitType | undefined,
      points_pnl: row.points_pnl,
      percent_pnl: row.percent_pnl,
      rupees_pnl: row.rupees_pnl,
      risk_amount: row.risk_amount,
      reward_amount: row.reward_amount,
      actual_risk_amount: row.actual_risk_amount,
      actual_reward_amount: row.actual_reward_amount,
      risk_reward_ratio: row.risk_reward_ratio,
      actual_risk_reward_ratio: row.actual_risk_reward_ratio,
      status: row.status as ExecutionStatus,
      evaluation_time_utc: new Date(row.evaluation_time_utc),
      knowledge_time_utc: new Date(row.knowledge_time_utc),
      created_at: new Date(row.created_at),
      updated_at: new Date(row.updated_at),
    };
  }
}
