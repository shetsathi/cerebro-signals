/**
 * Trade Execution Repository Interface
 *
 * Abstraction for persistent trade lifecycle tracking.
 * Supports creation, status updates, and queries.
 */

import { TradeExecution, TradeStatus, ExitType } from '../domain/trade-execution';

export interface TradeExecutionRecord {
  tradeId?: string;
  signalId: string;

  entryPrice?: number;
  entryTimeUTC?: Date;
  entrySlippagePercent?: number;
  entryBarIndex?: number;

  exitPrice?: number;
  exitTimeUTC?: Date;
  exitType?: ExitType;
  exitBarIndex?: number;

  pnlAmount?: number;
  pnlPercent?: number;
  riskHitPercent?: number;

  status?: TradeStatus;
  durationMinutes?: number;
  barsHeld?: number;

  notes?: string;
}

export interface SavedTradeExecution extends TradeExecutionRecord {
  tradeId: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface TradeExecutionRepository {
  /**
   * Create a new trade execution (linked to signal)
   */
  create(trade: TradeExecutionRecord): Promise<SavedTradeExecution>;

  /**
   * Get trade by ID
   */
  getById(tradeId: string): Promise<SavedTradeExecution | null>;

  /**
   * Get trade by signal ID
   */
  getBySignalId(signalId: string): Promise<SavedTradeExecution | null>;

  /**
   * Get all trades for a symbol with optional status filter
   */
  getBySymbol(symbol: string, status?: TradeStatus, limit?: number): Promise<SavedTradeExecution[]>;

  /**
   * Get open trades (not closed)
   */
  getOpen(symbol?: string): Promise<SavedTradeExecution[]>;

  /**
   * Get closed trades (for analysis)
   */
  getClosed(symbol?: string, limit?: number): Promise<SavedTradeExecution[]>;

  /**
   * Update trade status
   */
  updateStatus(tradeId: string, status: TradeStatus): Promise<void>;

  /**
   * Record entry execution
   */
  recordEntry(
    tradeId: string,
    entryPrice: number,
    entryTimeUTC: Date,
    entryBarIndex: number,
  ): Promise<void>;

  /**
   * Record exit execution
   */
  recordExit(
    tradeId: string,
    exitPrice: number,
    exitTimeUTC: Date,
    exitType: ExitType,
    exitBarIndex: number,
  ): Promise<void>;

  /**
   * Calculate and update PNL
   */
  updatePnL(
    tradeId: string,
    pnlAmount: number,
    pnlPercent: number,
    riskHitPercent: number,
    durationMinutes: number,
    barsHeld: number,
  ): Promise<void>;

  /**
   * Update notes
   */
  updateNotes(tradeId: string, notes: string): Promise<void>;
}
