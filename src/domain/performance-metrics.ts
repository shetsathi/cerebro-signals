/**
 * Performance Metrics Model
 *
 * Aggregated trading statistics computed from TradeExecution records.
 * Immutable snapshot of performance for a given symbol and time period.
 */

export interface SetupTypePerformance {
  setupType: string;
  wins: number;
  losses: number;
  totalTrades: number;
  totalPnl: number;
  avgPnl: number;
  winRate: number;
}

export interface TriggerTypePerformance {
  triggerType: string;
  wins: number;
  losses: number;
  totalTrades: number;
  totalPnl: number;
  avgPnl: number;
  winRate: number;
}

export interface RegimeTypePerformance {
  regimeType: string;
  wins: number;
  losses: number;
  totalTrades: number;
  totalPnl: number;
  avgPnl: number;
  winRate: number;
}

export class PerformanceMetrics {
  readonly metricId: string;
  readonly symbol: string;
  readonly periodStart: Date;
  readonly periodEnd: Date;

  // Trade counts
  readonly totalTrades: number;
  readonly completedTrades: number;
  readonly winningTrades: number;
  readonly losingTrades: number;
  readonly breakevenTrades: number;

  // Rates and ratios
  readonly winRate: number | null;           // (winning / completed) * 100
  readonly profitFactor: number | null;      // gross_profit / gross_loss
  readonly expectancy: number | null;        // avg_win * win_rate - avg_loss * loss_rate

  // PNL metrics
  readonly totalPnl: number;
  readonly avgPnlPerTrade: number | null;
  readonly largestWin: number | null;
  readonly largestLoss: number | null;
  readonly grossProfit: number;
  readonly grossLoss: number;

  // Time metrics
  readonly avgTradeDurationMinutes: number | null;
  readonly minTradeDurationMinutes: number | null;
  readonly maxTradeDurationMinutes: number | null;

  // Risk metrics
  readonly maxConsecutiveLosses: number;
  readonly maxConsecutiveWins: number;
  readonly largestLossStreak: number;

  // Breakdown by type
  readonly setupTypePerformance: Record<string, SetupTypePerformance>;
  readonly triggerTypePerformance: Record<string, TriggerTypePerformance>;
  readonly regimeTypePerformance: Record<string, RegimeTypePerformance>;

  // Metadata
  readonly lastUpdatedAt: Date;
  readonly createdAt: Date;

  constructor(
    metricId: string,
    symbol: string,
    periodStart: Date,
    periodEnd: Date,
    totalTrades: number,
    completedTrades: number,
    winningTrades: number,
    losingTrades: number,
    breakevenTrades: number,
    winRate: number | null,
    profitFactor: number | null,
    expectancy: number | null,
    totalPnl: number,
    avgPnlPerTrade: number | null,
    largestWin: number | null,
    largestLoss: number | null,
    grossProfit: number,
    grossLoss: number,
    avgTradeDurationMinutes: number | null,
    minTradeDurationMinutes: number | null,
    maxTradeDurationMinutes: number | null,
    maxConsecutiveLosses: number,
    maxConsecutiveWins: number,
    largestLossStreak: number,
    setupTypePerformance: Record<string, SetupTypePerformance>,
    triggerTypePerformance: Record<string, TriggerTypePerformance>,
    regimeTypePerformance: Record<string, RegimeTypePerformance>,
    lastUpdatedAt: Date,
    createdAt: Date,
  ) {
    this.metricId = metricId;
    this.symbol = symbol;
    this.periodStart = new Date(periodStart.getTime());
    this.periodEnd = new Date(periodEnd.getTime());
    this.totalTrades = totalTrades;
    this.completedTrades = completedTrades;
    this.winningTrades = winningTrades;
    this.losingTrades = losingTrades;
    this.breakevenTrades = breakevenTrades;
    this.winRate = winRate;
    this.profitFactor = profitFactor;
    this.expectancy = expectancy;
    this.totalPnl = totalPnl;
    this.avgPnlPerTrade = avgPnlPerTrade;
    this.largestWin = largestWin;
    this.largestLoss = largestLoss;
    this.grossProfit = grossProfit;
    this.grossLoss = grossLoss;
    this.avgTradeDurationMinutes = avgTradeDurationMinutes;
    this.minTradeDurationMinutes = minTradeDurationMinutes;
    this.maxTradeDurationMinutes = maxTradeDurationMinutes;
    this.maxConsecutiveLosses = maxConsecutiveLosses;
    this.maxConsecutiveWins = maxConsecutiveWins;
    this.largestLossStreak = largestLossStreak;
    this.setupTypePerformance = setupTypePerformance;
    this.triggerTypePerformance = triggerTypePerformance;
    this.regimeTypePerformance = regimeTypePerformance;
    this.lastUpdatedAt = new Date(lastUpdatedAt.getTime());
    this.createdAt = new Date(createdAt.getTime());
    Object.freeze(this);
  }

  /**
   * Is the system profitable?
   */
  isProfitable(): boolean {
    return this.totalPnl > 0 && this.winRate !== null && this.winRate > 0;
  }

  /**
   * Is win rate acceptable (typically >= 40%)?
   */
  hasAcceptableWinRate(threshold: number = 40): boolean {
    return this.winRate !== null && this.winRate >= threshold;
  }

  /**
   * Is profit factor healthy (typically >= 2.0)?
   */
  hasHealthyProfitFactor(threshold: number = 2.0): boolean {
    return this.profitFactor !== null && this.profitFactor >= threshold;
  }

  toString(): string {
    return `PerformanceMetrics(${this.symbol} ${this.totalTrades} trades, pnl=${this.totalPnl.toFixed(2)}, wr=${this.winRate?.toFixed(1)}%)`;
  }
}
