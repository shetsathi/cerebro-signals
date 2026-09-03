/**
 * Performance Calculator Service
 *
 * Aggregates trade execution data into performance metrics.
 * Computes statistics like win rate, profit factor, expectancy, etc.
 */

import { TradeExecutionRepository } from "../persistence/trade-execution-repository.interface";
import { PerformanceMetrics, calculateWinRate, calculateProfitFactor, calculateExpectancy } from "../domain/performance-metrics";

export class PerformanceCalculator {
  constructor(private tradeRepository: TradeExecutionRepository) {}

  /**
   * Calculate performance metrics for a symbol
   */
  async calculateMetrics(symbol: string): Promise<PerformanceMetrics | null> {
    // Fetch closed trades for the symbol
    const trades = await this.tradeRepository.getClosedExecutions(symbol, 1000);

    if (trades.length === 0) {
      return null;
    }

    // Extract metrics
    const totalTrades = trades.length;
    const winningTrades = trades.filter((t) => (t.points_pnl || 0) > 0).length;
    const losingTrades = totalTrades - winningTrades;
    const winRate = calculateWinRate(winningTrades, totalTrades);

    // Calculate P&L aggregates
    const totalPnL = trades.reduce((sum: number, t) => sum + (t.points_pnl || 0), 0);
    const avgPnL = totalTrades > 0 ? totalPnL / totalTrades : 0;

    const winningPnLs = trades.filter((t) => (t.points_pnl || 0) > 0).map((t) => t.points_pnl || 0);
    const losingPnLs = trades.filter((t) => (t.points_pnl || 0) < 0).map((t) => t.points_pnl || 0);

    const maxWinPoints = winningPnLs.length > 0 ? Math.max(...winningPnLs) : undefined;
    const maxLossPoints = losingPnLs.length > 0 ? Math.abs(Math.min(...losingPnLs)) : undefined;

    const grossProfit = winningPnLs.reduce((sum: number, pnl: number) => sum + pnl, 0);
    const grossLoss = Math.abs(losingPnLs.reduce((sum: number, pnl: number) => sum + pnl, 0));

    const profitFactor = calculateProfitFactor(totalPnL, grossLoss);
    const avgWin = winningTrades > 0 ? grossProfit / winningTrades : 0;
    const avgLoss = losingTrades > 0 ? grossLoss / losingTrades : 0;
    const expectancy = calculateExpectancy(winRate, avgWin, avgLoss);

    const metricsId = `METRICS_${symbol}_${Date.now()}`;
    return {
      metrics_id: metricsId,
      symbol,
      period_type: "ALL_TIME",
      total_trades: totalTrades,
      winning_trades: winningTrades,
      losing_trades: losingTrades,
      win_rate_percent: winRate,
      avg_risk_reward_ratio: trades[0]?.risk_reward_ratio,
      avg_actual_risk_reward_ratio: trades[0]?.actual_risk_reward_ratio,
      total_points_pnl: totalPnL,
      avg_points_pnl: avgPnL,
      max_win_points: maxWinPoints,
      max_loss_points: maxLossPoints,
      total_percent_pnl: undefined,
      avg_percent_pnl: undefined,
      long_trades: trades.filter((t) => t.trade_direction === 'LONG').length,
      long_winning: trades.filter((t) => t.trade_direction === 'LONG' && (t.points_pnl || 0) > 0).length,
      short_trades: trades.filter((t) => t.trade_direction === 'SHORT').length,
      short_winning: trades.filter((t) => t.trade_direction === 'SHORT' && (t.points_pnl || 0) > 0).length,
      calculated_at: new Date(),
      created_at: new Date(),
      updated_at: new Date(),
    } as PerformanceMetrics;
  }
}
