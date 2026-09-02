/**
 * Supabase Performance Metrics Repository
 *
 * Implements aggregated trading statistics storage and retrieval.
 */

import { SupabaseClient } from '@supabase/supabase-js';
import {
  PerformanceMetricsRepository,
  PerformanceMetricsRecord,
  SavedPerformanceMetrics,
} from './performance-metrics-repository.interface';

interface PerformanceMetricsRow {
  metric_id: string;
  symbol: string;
  period_start: string;
  period_end: string;
  total_trades: number;
  completed_trades: number;
  winning_trades: number;
  losing_trades: number;
  breakeven_trades: number;
  win_rate?: number;
  profit_factor?: number;
  expectancy?: number;
  total_pnl: number;
  avg_pnl_per_trade?: number;
  largest_win?: number;
  largest_loss?: number;
  gross_profit: number;
  gross_loss: number;
  avg_trade_duration_minutes?: number;
  min_trade_duration_minutes?: number;
  max_trade_duration_minutes?: number;
  max_consecutive_losses: number;
  max_consecutive_wins: number;
  largest_loss_streak: number;
  setup_type_performance?: Record<string, any>;
  trigger_type_performance?: Record<string, any>;
  regime_type_performance?: Record<string, any>;
  last_updated_at: string;
  created_at: string;
}

export class SupabasePerformanceMetricsRepository implements PerformanceMetricsRepository {
  constructor(private supabase: SupabaseClient) {}

  async upsert(metrics: PerformanceMetricsRecord): Promise<SavedPerformanceMetrics> {
    const row = {
      symbol: metrics.symbol,
      period_start: metrics.periodStart.toISOString(),
      period_end: metrics.periodEnd.toISOString(),
      total_trades: metrics.totalTrades,
      completed_trades: metrics.completedTrades,
      winning_trades: metrics.winningTrades,
      losing_trades: metrics.losingTrades,
      breakeven_trades: metrics.breakevenTrades,
      win_rate: metrics.winRate,
      profit_factor: metrics.profitFactor,
      expectancy: metrics.expectancy,
      total_pnl: metrics.totalPnl,
      avg_pnl_per_trade: metrics.avgPnlPerTrade,
      largest_win: metrics.largestWin,
      largest_loss: metrics.largestLoss,
      gross_profit: metrics.grossProfit,
      gross_loss: metrics.grossLoss,
      avg_trade_duration_minutes: metrics.avgTradeDurationMinutes,
      min_trade_duration_minutes: metrics.minTradeDurationMinutes,
      max_trade_duration_minutes: metrics.maxTradeDurationMinutes,
      max_consecutive_losses: metrics.maxConsecutiveLosses,
      max_consecutive_wins: metrics.maxConsecutiveWins,
      largest_loss_streak: metrics.largestLossStreak,
      setup_type_performance: metrics.setupTypePerformance,
      trigger_type_performance: metrics.triggerTypePerformance,
      regime_type_performance: metrics.regimeTypePerformance,
      last_updated_at: new Date().toISOString(),
    };

    const { data, error } = await this.supabase
      .from('performance_metrics')
      .upsert(row, {
        onConflict: 'symbol,period_start,period_end',
      })
      .select()
      .single();

    if (error) {
      throw new Error(`Failed to upsert performance metrics: ${error.message}`);
    }

    return this.rowToMetrics(data as PerformanceMetricsRow);
  }

  async getForPeriod(
    symbol: string,
    startDate: Date,
    endDate: Date,
  ): Promise<SavedPerformanceMetrics | null> {
    const { data, error } = await this.supabase
      .from('performance_metrics')
      .select('*')
      .eq('symbol', symbol)
      .eq('period_start', startDate.toISOString())
      .eq('period_end', endDate.toISOString())
      .single();

    if (error && error.code !== 'PGRST116') {
      throw new Error(`Failed to get metrics: ${error.message}`);
    }

    return data ? this.rowToMetrics(data as PerformanceMetricsRow) : null;
  }

  async getLatest(symbol: string): Promise<SavedPerformanceMetrics | null> {
    const { data, error } = await this.supabase
      .from('performance_metrics')
      .select('*')
      .eq('symbol', symbol)
      .order('period_end', { ascending: false })
      .limit(1)
      .single();

    if (error && error.code !== 'PGRST116') {
      throw new Error(`Failed to get latest metrics: ${error.message}`);
    }

    return data ? this.rowToMetrics(data as PerformanceMetricsRow) : null;
  }

  async getForSymbol(symbol: string, limit: number = 50): Promise<SavedPerformanceMetrics[]> {
    const { data, error } = await this.supabase
      .from('performance_metrics')
      .select('*')
      .eq('symbol', symbol)
      .order('period_end', { ascending: false })
      .limit(limit);

    if (error) {
      throw new Error(`Failed to get symbol metrics: ${error.message}`);
    }

    return (data || []).map(row => this.rowToMetrics(row as PerformanceMetricsRow));
  }

  async getAll(limit: number = 50): Promise<SavedPerformanceMetrics[]> {
    const { data, error } = await this.supabase
      .from('performance_metrics')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(limit);

    if (error) {
      throw new Error(`Failed to get all metrics: ${error.message}`);
    }

    return (data || []).map(row => this.rowToMetrics(row as PerformanceMetricsRow));
  }

  async deleteForPeriod(symbol: string, startDate: Date, endDate: Date): Promise<void> {
    const { error } = await this.supabase
      .from('performance_metrics')
      .delete()
      .eq('symbol', symbol)
      .eq('period_start', startDate.toISOString())
      .eq('period_end', endDate.toISOString());

    if (error) {
      throw new Error(`Failed to delete metrics: ${error.message}`);
    }
  }

  private rowToMetrics(row: PerformanceMetricsRow): SavedPerformanceMetrics {
    return {
      metricId: row.metric_id,
      symbol: row.symbol,
      periodStart: new Date(row.period_start),
      periodEnd: new Date(row.period_end),
      totalTrades: row.total_trades,
      completedTrades: row.completed_trades,
      winningTrades: row.winning_trades,
      losingTrades: row.losing_trades,
      breakevenTrades: row.breakeven_trades,
      winRate: row.win_rate,
      profitFactor: row.profit_factor,
      expectancy: row.expectancy,
      totalPnl: row.total_pnl,
      avgPnlPerTrade: row.avg_pnl_per_trade,
      largestWin: row.largest_win,
      largestLoss: row.largest_loss,
      grossProfit: row.gross_profit,
      grossLoss: row.gross_loss,
      avgTradeDurationMinutes: row.avg_trade_duration_minutes,
      minTradeDurationMinutes: row.min_trade_duration_minutes,
      maxTradeDurationMinutes: row.max_trade_duration_minutes,
      maxConsecutiveLosses: row.max_consecutive_losses,
      maxConsecutiveWins: row.max_consecutive_wins,
      largestLossStreak: row.largest_loss_streak,
      setupTypePerformance: row.setup_type_performance,
      triggerTypePerformance: row.trigger_type_performance,
      regimeTypePerformance: row.regime_type_performance,
      lastUpdatedAt: new Date(row.last_updated_at),
      createdAt: new Date(row.created_at),
    };
  }
}
