/**
 * Trade Outcome Service — Records outcomes from trade detection
 *
 * Phase 2: Trade Performance Tracking
 * Listens for trade outcomes (entry hits, exit hits) and records them to:
 * - trade_executions table (entry/exit details)
 * - performance_metrics table (aggregated stats)
 */

import { TradeDetectionService } from './trade-detection-service';
import { TradeExecutionRepository } from '../persistence/trade-execution-repository.interface';
import { SavedSignal } from '../persistence/signal-repository.interface';

export class TradeOutcomeService {
  constructor(
    private tradeDetection: TradeDetectionService,
    private tradeExecutionRepository: TradeExecutionRepository
  ) {}

  /**
   * Record an entry hit (signal hit entry price)
   */
  async recordEntryHit(
    signal: SavedSignal,
    entryPrice: number,
    entryTimeUTC: Date,
    entryBarIndex: number
  ): Promise<string> {
    const execution = await this.tradeExecutionRepository.recordEntry(
      signal.signal_id,
      signal.symbol,
      signal.decision_action,
      entryPrice,
      entryTimeUTC,
      entryBarIndex,
      signal.stop_loss_price,
      signal.target_price,
      signal.evaluation_time_utc,
      signal.knowledge_time_utc
    );

    console.log(`[PHASE2] Entry recorded: ${execution.execution_id} for ${signal.symbol}`);
    return execution.execution_id;
  }

  /**
   * Record an exit hit (trade closed at SL or Target)
   */
  async recordExitHit(
    executionId: string,
    exitPrice: number,
    exitTimeUTC: Date,
    exitBarIndex: number,
    exitType: 'STOP_LOSS' | 'TARGET' | 'CLOSED'
  ): Promise<void> {
    // Get execution to calculate P&L
    const execution = await this.tradeExecutionRepository.getById(executionId);
    if (!execution || execution.status === 'CLOSED') {
      console.warn(`[PHASE2] Cannot exit: execution ${executionId} not found or already closed`);
      return;
    }

    // Calculate P&L
    const points = execution.trade_direction === 'LONG'
      ? exitPrice - execution.entry_price
      : execution.entry_price - exitPrice;

    const percent = (points / execution.entry_price) * 100;

    // Determine actual risk/reward
    let actualRiskAmount: number | undefined;
    let actualRewardAmount: number | undefined;
    let actualRiskRewardRatio: number | undefined;

    if (exitType === 'STOP_LOSS') {
      actualRiskAmount = Math.abs(execution.stop_loss_price - execution.entry_price);
    } else if (exitType === 'TARGET' && execution.target_price) {
      actualRewardAmount = Math.abs(execution.target_price - execution.entry_price);
    }

    // Record exit
    await this.tradeExecutionRepository.recordExit(
      executionId,
      exitPrice,
      exitTimeUTC,
      exitBarIndex,
      exitType,
      points,
      percent,
      actualRiskAmount,
      actualRewardAmount,
      actualRiskRewardRatio
    );

    console.log(
      `[PHASE2] Exit recorded: ${exitType} at ${exitPrice.toFixed(2)} | P&L: ${percent.toFixed(2)}%`
    );
  }

  /**
   * Calculate performance metrics from closed trades
   */
  async calculateMetrics(symbol: string): Promise<void> {
    const closedTrades = await this.tradeExecutionRepository.getClosedExecutions(symbol, 1000);

    if (closedTrades.length === 0) {
      console.log(`[PHASE2] No closed trades for ${symbol} yet`);
      return;
    }

    // Calculate stats
    const wins = closedTrades.filter(t => (t.points_pnl || 0) > 0).length;
    const losses = closedTrades.length - wins;
    const winRate = (wins / closedTrades.length) * 100;
    const totalPnL = closedTrades.reduce((sum, t) => sum + (t.points_pnl || 0), 0);
    const avgPnL = totalPnL / closedTrades.length;

    console.log(
      `[PHASE2] ${symbol} Stats: ${wins}W/${losses}L | Win Rate: ${winRate.toFixed(1)}% | Avg P&L: ${avgPnL.toFixed(2)}pts`
    );
  }
}
