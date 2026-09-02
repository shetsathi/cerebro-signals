/**
 * Performance Calculator Service
 *
 * Aggregates trade execution data into performance metrics.
 * Computes statistics like win rate, profit factor, expectancy, etc.
 */

import { TradeExecutionRepository } from '../persistence/trade-execution-repository.interface';
import { PerformanceMetricsRepository } from '../persistence/performance-metrics-repository.interface';
import { PerformanceMetrics } from '../domain/performance-metrics';

export class PerformanceCalculator {
  constructor(
    private tradeRepository: TradeExecutionRepository,
    private metricsRepository: PerformanceMetricsRepository,
  ) {}

  /**
   * Calculate performance metrics for a symbol over a time period
   */
  async calculateMetrics(
    symbol: string,
    periodStart: Date,
    periodEnd: Date,
  ): Promise<PerformanceMetrics> {
    // Fetch closed trades for the period
    const trades = await this.tradeRepository.getClosed(symbol);
    const periodTrades = trades.filter(
      t => t.updatedAt >= periodStart && t.updatedAt <= periodEnd,
    );

    // Extract metrics
    const totalTrades = periodTrades.length;
    const completedTrades = periodTrades.filter(t => t.pnlAmount !== undefined).length;
    const winningTrades = periodTrades.filter(t => t.pnlAmount! > 0).length;
    const losingTrades = periodTrades.filter(t => t.pnlAmount! < 0).length;
    const breakevenTrades = periodTrades.filter(t => t.pnlAmount === 0).length;

    // Calculate aggregates
    const totalPnl = periodTrades.reduce((sum, t) => sum + (t.pnlAmount || 0), 0);
    const grossProfit = periodTrades
      .filter(t => t.pnlAmount! > 0)
      .reduce((sum, t) => sum + t.pnlAmount!, 0);
    const grossLoss = Math.abs(
      periodTrades
        .filter(t => t.pnlAmount! < 0)
        .reduce((sum, t) => sum + t.pnlAmount!, 0),
    );

    // Calculate rates
    const winRate = completedTrades > 0 ? (winningTrades / completedTrades) * 100 : null;
    const profitFactor = grossLoss > 0 ? grossProfit / grossLoss : grossProfit > 0 ? 999 : null;
    const avgPnlPerTrade = completedTrades > 0 ? totalPnl / completedTrades : null;

    // Find largest win/loss
    const winningPnLs = periodTrades.filter(t => t.pnlAmount! > 0).map(t => t.pnlAmount!);
    const losingPnLs = periodTrades.filter(t => t.pnlAmount! < 0).map(t => t.pnlAmount!);
    const largestWin = winningPnLs.length > 0 ? Math.max(...winningPnLs) : null;
    const largestLoss = losingPnLs.length > 0 ? Math.min(...losingPnLs) : null;

    // Calculate expectancy
    let expectancy: number | null = null;
    if (winRate !== null) {
      const avgWin = winningTrades > 0 ? grossProfit / winningTrades : 0;
      const avgLoss = losingTrades > 0 ? grossLoss / losingTrades : 0;
      const lossRate = (100 - winRate) / 100;
      expectancy = avgWin * (winRate / 100) - avgLoss * lossRate;
    }

    // Time metrics
    const durations = periodTrades
      .filter(t => t.durationMinutes !== undefined && t.durationMinutes > 0)
      .map(t => t.durationMinutes!);
    const avgTradeDurationMinutes =
      durations.length > 0 ? Math.round(durations.reduce((a, b) => a + b) / durations.length) : null;
    const minTradeDurationMinutes = durations.length > 0 ? Math.min(...durations) : null;
    const maxTradeDurationMinutes = durations.length > 0 ? Math.max(...durations) : null;

    // Risk metrics
    const { maxConsecutiveLosses, maxConsecutiveWins, largestLossStreak } =
      this.calculateStreakMetrics(periodTrades);

    // Breakdown by type (requires signal data - simplified for now)
    const setupTypePerformance: Record<string, any> = {};
    const triggerTypePerformance: Record<string, any> = {};
    const regimeTypePerformance: Record<string, any> = {};

    // Create metrics object
    const metrics = new PerformanceMetrics(
      `METRICS_${symbol}_${periodStart.getTime()}_${periodEnd.getTime()}`,
      symbol,
      periodStart,
      periodEnd,
      totalTrades,
      completedTrades,
      winningTrades,
      losingTrades,
      breakevenTrades,
      winRate,
      profitFactor,
      expectancy,
      totalPnl,
      avgPnlPerTrade,
      largestWin,
      largestLoss,
      grossProfit,
      grossLoss,
      avgTradeDurationMinutes,
      minTradeDurationMinutes,
      maxTradeDurationMinutes,
      maxConsecutiveLosses,
      maxConsecutiveWins,
      largestLossStreak,
      setupTypePerformance,
      triggerTypePerformance,
      regimeTypePerformance,
      new Date(),
      new Date(),
    );

    return metrics;
  }

  /**
   * Calculate consecutive win/loss streaks
   */
  private calculateStreakMetrics(trades: any[]): {
    maxConsecutiveLosses: number;
    maxConsecutiveWins: number;
    largestLossStreak: number;
  } {
    let currentWinStreak = 0;
    let currentLossStreak = 0;
    let maxWinStreak = 0;
    let maxLossStreak = 0;
    let largestLossStreak = 0;

    for (const trade of trades) {
      if (trade.pnlAmount! > 0) {
        currentWinStreak++;
        currentLossStreak = 0;
        maxWinStreak = Math.max(maxWinStreak, currentWinStreak);
      } else if (trade.pnlAmount! < 0) {
        currentLossStreak++;
        currentWinStreak = 0;
        maxLossStreak = Math.max(maxLossStreak, currentLossStreak);
        largestLossStreak += trade.pnlAmount; // Accumulate losses
      } else {
        currentWinStreak = 0;
        currentLossStreak = 0;
      }
    }

    return {
      maxConsecutiveLosses: maxLossStreak,
      maxConsecutiveWins: maxWinStreak,
      largestLossStreak: Math.abs(largestLossStreak),
    };
  }

  /**
   * Persist metrics to database
   */
  async persistMetrics(
    symbol: string,
    periodStart: Date,
    periodEnd: Date,
  ): Promise<void> {
    const metrics = await this.calculateMetrics(symbol, periodStart, periodEnd);

    await this.metricsRepository.upsert({
      symbol: metrics.symbol,
      periodStart: metrics.periodStart,
      periodEnd: metrics.periodEnd,
      totalTrades: metrics.totalTrades,
      completedTrades: metrics.completedTrades,
      winningTrades: metrics.winningTrades,
      losingTrades: metrics.losingTrades,
      breakevenTrades: metrics.breakevenTrades,
      winRate: metrics.winRate || undefined,
      profitFactor: metrics.profitFactor || undefined,
      expectancy: metrics.expectancy || undefined,
      totalPnl: metrics.totalPnl,
      avgPnlPerTrade: metrics.avgPnlPerTrade || undefined,
      largestWin: metrics.largestWin || undefined,
      largestLoss: metrics.largestLoss || undefined,
      grossProfit: metrics.grossProfit,
      grossLoss: metrics.grossLoss,
      avgTradeDurationMinutes: metrics.avgTradeDurationMinutes || undefined,
      minTradeDurationMinutes: metrics.minTradeDurationMinutes || undefined,
      maxTradeDurationMinutes: metrics.maxTradeDurationMinutes || undefined,
      maxConsecutiveLosses: metrics.maxConsecutiveLosses,
      maxConsecutiveWins: metrics.maxConsecutiveWins,
      largestLossStreak: metrics.largestLossStreak,
      setupTypePerformance: metrics.setupTypePerformance,
      triggerTypePerformance: metrics.triggerTypePerformance,
      regimeTypePerformance: metrics.regimeTypePerformance,
    });

    console.log(
      `Performance metrics persisted for ${symbol}: ` +
      `${metrics.completedTrades} trades, pnl=${metrics.totalPnl.toFixed(2)}, wr=${metrics.winRate?.toFixed(1)}%`,
    );
  }

  /**
   * Get performance summary for display
   */
  async getSummary(symbol: string): Promise<string> {
    const metrics = await this.metricsRepository.getLatest(symbol);
    if (!metrics) {
      return `No performance data yet for ${symbol}`;
    }

    return [
      `${symbol} Trading Performance`,
      `========================`,
      `Total Trades: ${metrics.totalTrades}`,
      `Completed: ${metrics.completedTrades}`,
      `Wins: ${metrics.winningTrades} | Losses: ${metrics.losingTrades} | Breakeven: ${metrics.breakevenTrades}`,
      `Win Rate: ${metrics.winRate?.toFixed(1)}%`,
      `Profit Factor: ${metrics.profitFactor?.toFixed(2)}x`,
      `Total PNL: ${metrics.totalPnl.toFixed(2)}`,
      `Avg PNL: ${metrics.avgPnlPerTrade?.toFixed(2)} per trade`,
      `Largest Win: ${metrics.largestWin?.toFixed(2)} | Loss: ${metrics.largestLoss?.toFixed(2)}`,
    ].join('\n');
  }
}
