/**
 * Trade Execution Model
 *
 * Represents the complete lifecycle of a trade from signal generation to exit.
 * Immutable: once a trade is closed (exit recorded), it cannot be modified.
 */

export enum TradeStatus {
  PENDING = 'PENDING',                // Signal generated, awaiting entry
  ENTRY_FILLED = 'ENTRY_FILLED',      // Entry price recorded
  WAITING_EXIT = 'WAITING_EXIT',      // Waiting for SL or target to be hit
  CLOSED = 'CLOSED',                  // Trade completed, PNL recorded
}

export enum ExitType {
  SL_HIT = 'SL_HIT',                  // Stop loss was hit
  TARGET_HIT = 'TARGET_HIT',          // Profit target was hit
  MANUAL_EXIT = 'MANUAL_EXIT',        // Manually exited
  TIMEOUT = 'TIMEOUT',                // Trade timed out (e.g., end of session)
}

export class TradeExecution {
  readonly tradeId: string;
  readonly signalId: string;

  // Entry
  readonly entryPrice: number | null;
  readonly entryTimeUTC: Date | null;
  readonly entrySlippagePercent: number | null;
  readonly entryBarIndex: number | null;

  // Exit
  readonly exitPrice: number | null;
  readonly exitTimeUTC: Date | null;
  readonly exitType: ExitType | null;
  readonly exitBarIndex: number | null;

  // PNL (calculated, immutable once exit recorded)
  readonly pnlAmount: number | null;
  readonly pnlPercent: number | null;
  readonly riskHitPercent: number | null;

  // Lifecycle
  readonly status: TradeStatus;
  readonly durationMinutes: number | null;
  readonly barsHeld: number | null;

  // Metadata
  readonly notes: string | null;
  readonly createdAt: Date;
  readonly updatedAt: Date;

  constructor(
    tradeId: string,
    signalId: string,
    entryPrice: number | null,
    entryTimeUTC: Date | null,
    entrySlippagePercent: number | null,
    entryBarIndex: number | null,
    exitPrice: number | null,
    exitTimeUTC: Date | null,
    exitType: ExitType | null,
    exitBarIndex: number | null,
    pnlAmount: number | null,
    pnlPercent: number | null,
    riskHitPercent: number | null,
    status: TradeStatus,
    durationMinutes: number | null,
    barsHeld: number | null,
    notes: string | null,
    createdAt: Date,
    updatedAt: Date,
  ) {
    this.tradeId = tradeId;
    this.signalId = signalId;
    this.entryPrice = entryPrice;
    this.entryTimeUTC = entryTimeUTC;
    this.entrySlippagePercent = entrySlippagePercent;
    this.entryBarIndex = entryBarIndex;
    this.exitPrice = exitPrice;
    this.exitTimeUTC = exitTimeUTC;
    this.exitType = exitType;
    this.exitBarIndex = exitBarIndex;
    this.pnlAmount = pnlAmount;
    this.pnlPercent = pnlPercent;
    this.riskHitPercent = riskHitPercent;
    this.status = status;
    this.durationMinutes = durationMinutes;
    this.barsHeld = barsHeld;
    this.notes = notes;
    this.createdAt = new Date(createdAt.getTime());
    this.updatedAt = new Date(updatedAt.getTime());
    Object.freeze(this);
  }

  /**
   * Calculate PNL percent from entry and exit prices
   * LONG: (exit - entry) / entry * 100
   * SHORT: (entry - exit) / entry * 100
   */
  static calculatePnlPercent(direction: 'LONG' | 'SHORT', entryPrice: number, exitPrice: number): number {
    if (direction === 'LONG') {
      return ((exitPrice - entryPrice) / entryPrice) * 100;
    } else {
      return ((entryPrice - exitPrice) / entryPrice) * 100;
    }
  }

  /**
   * Calculate slippage percent
   */
  static calculateSlippagePercent(signalEntryPrice: number, actualEntryPrice: number): number {
    return ((actualEntryPrice - signalEntryPrice) / signalEntryPrice) * 100;
  }

  /**
   * Calculate risk hit percent (how much of risk was used)
   * risk_hit = distance_traveled / total_risk * 100
   */
  static calculateRiskHitPercent(
    direction: 'LONG' | 'SHORT',
    entryPrice: number,
    stopPrice: number,
    currentPrice: number,
  ): number {
    if (direction === 'LONG') {
      const totalRisk = entryPrice - stopPrice;
      const distanceTraveled = Math.max(0, entryPrice - currentPrice);
      return (distanceTraveled / totalRisk) * 100;
    } else {
      const totalRisk = stopPrice - entryPrice;
      const distanceTraveled = Math.max(0, currentPrice - entryPrice);
      return (distanceTraveled / totalRisk) * 100;
    }
  }

  toString(): string {
    return `TradeExecution(${this.tradeId} status=${this.status} pnl=${this.pnlPercent}%)`;
  }
}
