/**
 * PerformanceMetrics — Aggregated statistics from completed trades
 *
 * Calculated from trade_executions table after each trade closes.
 * Immutable snapshot; recalculated when new trades complete.
 */

export type PeriodType = 'ALL_TIME' | 'DAILY' | 'WEEKLY' | 'MONTHLY';

export interface PerformanceMetrics {
  // Primary key
  metrics_id: string;

  // Scope
  symbol: string;
  period_type: PeriodType;
  period_start_utc?: Date;
  period_end_utc?: Date;

  // Trade counts
  total_trades: number;
  winning_trades: number;
  losing_trades: number;

  // Win rate
  win_rate_percent?: number; // (winning_trades / total_trades) × 100

  // Risk/Reward metrics
  avg_risk_reward_ratio?: number; // Average R:R
  avg_actual_risk_reward_ratio?: number; // Average actual R:R achieved

  // P&L metrics (points)
  total_points_pnl: number; // Sum of all points_pnl
  avg_points_pnl?: number; // Average per trade
  max_win_points?: number; // Largest win
  max_loss_points?: number; // Largest loss (absolute)

  // P&L metrics (percentage)
  total_percent_pnl?: number; // Sum of all percent_pnl
  avg_percent_pnl?: number; // Average per trade

  // Direction-specific metrics
  long_trades?: number;
  long_winning?: number;
  long_win_rate_percent?: number;
  long_avg_pnl?: number;

  short_trades?: number;
  short_winning?: number;
  short_win_rate_percent?: number;
  short_avg_pnl?: number;

  // Consecutive trades
  consecutive_wins?: number;
  consecutive_losses?: number;
  max_consecutive_wins?: number;
  max_consecutive_losses?: number;

  // Drawdown metrics
  peak_points_pnl?: number; // Highest cumulative P&L
  current_drawdown_points?: number; // From peak to current
  max_drawdown_points?: number; // Worst drawdown seen

  // Metadata
  calculated_at: Date;
  created_at: Date;
  updated_at: Date;
}

/**
 * Calculated performance summary (for dashboard display)
 */
export interface PerformanceSummary {
  symbol: string;
  totalTrades: number;
  winRate: number; // 0-100
  totalPnL: number;
  avgPnL: number;
  maxWin: number;
  maxLoss: number;
  profitFactor: number; // Total wins / Total losses
  expectancy: number; // Average expected P&L per trade
}

/**
 * Calculate win rate percentage
 */
export function calculateWinRate(winning: number, total: number): number {
  if (total === 0) return 0;
  return (winning / total) * 100;
}

/**
 * Calculate profit factor (total wins / total losses)
 */
export function calculateProfitFactor(
  totalPnL: number,
  totalLosses: number
): number {
  if (totalLosses === 0) return totalPnL > 0 ? Infinity : 0;
  return Math.abs(totalPnL / totalLosses);
}

/**
 * Calculate expectancy (average expected P&L per trade)
 */
export function calculateExpectancy(
  winRate: number,
  avgWin: number,
  avgLoss: number
): number {
  const winProbability = winRate / 100;
  const lossProbability = 1 - winProbability;
  return winProbability * avgWin + lossProbability * avgLoss;
}

/**
 * Calculate max consecutive wins/losses from trade sequence
 */
export function calculateConsecutiveStreaks(
  trades: Array<{ isWin: boolean }>
): { maxConsecutiveWins: number; maxConsecutiveLosses: number } {
  let maxConsecutiveWins = 0;
  let maxConsecutiveLosses = 0;
  let currentWinStreak = 0;
  let currentLossStreak = 0;

  for (const trade of trades) {
    if (trade.isWin) {
      currentWinStreak++;
      currentLossStreak = 0;
      maxConsecutiveWins = Math.max(maxConsecutiveWins, currentWinStreak);
    } else {
      currentLossStreak++;
      currentWinStreak = 0;
      maxConsecutiveLosses = Math.max(maxConsecutiveLosses, currentLossStreak);
    }
  }

  return { maxConsecutiveWins, maxConsecutiveLosses };
}

/**
 * Calculate drawdown from cumulative P&L sequence
 */
export function calculateDrawdown(
  pnlSequence: number[]
): { maxDrawdown: number; currentDrawdown: number; peak: number } {
  let peak = 0;
  let maxDrawdown = 0;
  let cumulative = 0;

  for (const pnl of pnlSequence) {
    cumulative += pnl;
    if (cumulative > peak) {
      peak = cumulative;
    }
    const drawdown = peak - cumulative;
    maxDrawdown = Math.max(maxDrawdown, drawdown);
  }

  const currentDrawdown = peak - cumulative;
  return { maxDrawdown, currentDrawdown, peak };
}
