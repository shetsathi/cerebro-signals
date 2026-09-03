/**
 * Trade Execution Repository Interface
 *
 * Abstraction for persistent trade execution storage.
 * Immutable: trades recorded at entry, updated only at exit.
 */

import { TradeExecution, TradeDirection, ExitType, ExecutionStatus } from '../domain/trade-execution';

export interface TradeExecutionRecord extends TradeExecution {}

export interface TradeExecutionRepository {
  /**
   * Record a trade entry (opens a new execution)
   */
  recordEntry(
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
  ): Promise<TradeExecution>;

  /**
   * Record a trade exit (closes execution)
   */
  recordExit(
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
  ): Promise<TradeExecution>;

  /**
   * Get execution by ID
   */
  getById(execution_id: string): Promise<TradeExecution | null>;

  /**
   * Get execution by signal ID
   */
  getBySignalId(signal_id: string): Promise<TradeExecution | null>;

  /**
   * Get all executions for a symbol
   */
  getBySymbol(symbol: string, limit?: number): Promise<TradeExecution[]>;

  /**
   * Get open executions (waiting for exit)
   */
  getOpenExecutions(symbol?: string): Promise<TradeExecution[]>;

  /**
   * Get closed executions (completed)
   */
  getClosedExecutions(
    symbol?: string,
    limit?: number,
    offset?: number
  ): Promise<TradeExecution[]>;

  /**
   * Get executions by status
   */
  getByStatus(statuses: ExecutionStatus[]): Promise<TradeExecution[]>;
}
