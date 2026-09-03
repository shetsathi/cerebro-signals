/**
 * TradeExecution — Immutable record of a single trade from entry to exit
 *
 * Lifecycle:
 * 1. Entry: Price hits entry level → entry_price, entry_time_utc, status=OPEN
 * 2. Exit: Price hits SL or Target → exit_price, exit_time_utc, exit_type, status=CLOSED
 * 3. P&L: Calculated at exit time (immutable)
 */

export type TradeDirection = 'LONG' | 'SHORT';
export type ExitType = 'STOP_LOSS' | 'TARGET' | 'CLOSED';
export type ExecutionStatus = 'OPEN' | 'CLOSED';

export interface TradeExecution {
  // Primary key
  execution_id: string;

  // Foreign key
  signal_id: string;

  // Trade identification
  symbol: string;
  trade_direction: TradeDirection;

  // Entry details (immutable, recorded at entry)
  entry_price: number;
  entry_time_utc: Date;
  entry_bar_index: number; // Which candle confirmed entry

  // Stop loss (from signal)
  stop_loss_price: number;

  // Target (from signal)
  target_price?: number;

  // Exit details (recorded when SL or Target hit)
  exit_price?: number;
  exit_time_utc?: Date;
  exit_bar_index?: number;
  exit_type?: ExitType; // STOP_LOSS | TARGET | CLOSED

  // P&L metrics (calculated at exit)
  points_pnl?: number; // Price difference
  percent_pnl?: number; // Percentage change
  rupees_pnl?: number; // Rupees (if lot size known)

  // Risk metrics
  risk_amount?: number; // |Entry - SL|
  reward_amount?: number; // |Target - Entry|
  actual_risk_amount?: number; // Actual loss if SL hit
  actual_reward_amount?: number; // Actual gain if Target hit
  risk_reward_ratio?: number; // Original R:R
  actual_risk_reward_ratio?: number; // Actual R:R achieved

  // Status
  status: ExecutionStatus; // OPEN | CLOSED

  // Traceability
  evaluation_time_utc: Date;
  knowledge_time_utc: Date;
  created_at: Date;
  updated_at: Date;
}

/**
 * Calculate P&L from entry/exit prices
 */
export function calculatePnL(
  direction: TradeDirection,
  entryPrice: number,
  exitPrice: number
): { points: number; percent: number } {
  if (direction === 'LONG') {
    const points = exitPrice - entryPrice;
    const percent = (points / entryPrice) * 100;
    return { points, percent };
  } else {
    const points = entryPrice - exitPrice;
    const percent = (points / entryPrice) * 100;
    return { points, percent };
  }
}

/**
 * Determine if price hit entry level
 */
export function didPriceHitEntry(
  entryPrice: number,
  candleHigh: number,
  candleLow: number
): boolean {
  return candleHigh >= entryPrice && candleLow <= entryPrice;
}

/**
 * Determine if price hit stop loss (exit)
 */
export function didPriceHitStopLoss(
  slPrice: number,
  candleHigh: number,
  candleLow: number
): boolean {
  return candleHigh >= slPrice && candleLow <= slPrice;
}

/**
 * Determine if price hit target (exit)
 */
export function didPriceHitTarget(
  targetPrice: number,
  candleHigh: number,
  candleLow: number
): boolean {
  return candleHigh >= targetPrice && candleLow <= targetPrice;
}
