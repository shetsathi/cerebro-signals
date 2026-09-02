/**
 * Performance Metrics Repository Interface
 *
 * Abstraction for aggregated trading statistics.
 * Stores and retrieves performance summaries computed from trade executions.
 */

import { PerformanceMetrics } from '../domain/performance-metrics';

export interface PerformanceMetricsRecord {
  metricId?: string;
  symbol: string;
  periodStart: Date;
  periodEnd: Date;

  totalTrades: number;
  completedTrades: number;
  winningTrades: number;
  losingTrades: number;
  breakevenTrades: number;

  winRate?: number;
  profitFactor?: number;
  expectancy?: number;

  totalPnl: number;
  avgPnlPerTrade?: number;
  largestWin?: number;
  largestLoss?: number;
  grossProfit: number;
  grossLoss: number;

  avgTradeDurationMinutes?: number;
  minTradeDurationMinutes?: number;
  maxTradeDurationMinutes?: number;

  maxConsecutiveLosses: number;
  maxConsecutiveWins: number;
  largestLossStreak: number;

  setupTypePerformance?: Record<string, any>;
  triggerTypePerformance?: Record<string, any>;
  regimeTypePerformance?: Record<string, any>;
}

export interface SavedPerformanceMetrics extends PerformanceMetricsRecord {
  metricId: string;
  lastUpdatedAt: Date;
  createdAt: Date;
}

export interface PerformanceMetricsRepository {
  /**
   * Create or update performance metrics for a period
   */
  upsert(metrics: PerformanceMetricsRecord): Promise<SavedPerformanceMetrics>;

  /**
   * Get metrics for a symbol and date range
   */
  getForPeriod(symbol: string, startDate: Date, endDate: Date): Promise<SavedPerformanceMetrics | null>;

  /**
   * Get latest metrics for a symbol
   */
  getLatest(symbol: string): Promise<SavedPerformanceMetrics | null>;

  /**
   * Get all metrics for a symbol ordered by date
   */
  getForSymbol(symbol: string, limit?: number): Promise<SavedPerformanceMetrics[]>;

  /**
   * Get all metrics across all symbols (for dashboard)
   */
  getAll(limit?: number): Promise<SavedPerformanceMetrics[]>;

  /**
   * Delete metrics for a period (e.g., recalculate)
   */
  deleteForPeriod(symbol: string, startDate: Date, endDate: Date): Promise<void>;
}
