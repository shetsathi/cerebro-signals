/**
 * Trade Detection Service
 *
 * Monitors live price ticks against open signals to detect:
 * - Entry execution (when price hits entry level)
 * - Exit execution (when SL or target is hit)
 * - PNL calculation
 *
 * Works with live candle data to check if price touched levels.
 */

import { TradeExecutionRepository } from '../persistence/trade-execution-repository.interface';
import { SignalRepository } from '../persistence/signal-repository.interface';
import { TradeExecution, TradeStatus, ExitType } from '../domain/trade-execution';
import { Candle } from '../domain/candle';

export class TradeDetectionService {
  constructor(
    private tradeRepository: TradeExecutionRepository,
    private signalRepository: SignalRepository,
  ) {}

  /**
   * Check if a price level was hit by a candle
   * Considers both high and low of the candle
   */
  private wasLevelHit(candle: Candle, level: number): boolean {
    const low = Math.min(candle.ohlc.low, candle.ohlc.open, candle.ohlc.close);
    const high = Math.max(candle.ohlc.high, candle.ohlc.open, candle.ohlc.close);
    return low <= level && level <= high;
  }

  /**
   * Check if entry was hit on this candle
   * Entry is hit if price traded at or through entry level
   */
  async checkEntryExecution(
    signal: any, // SavedSignal from repository
    candle: Candle,
  ): Promise<boolean> {
    const entryLevel = signal.entry_price;
    if (!entryLevel) return false;

    const trade = await this.tradeRepository.getBySignalId(signal.signal_id);
    if (!trade || trade.status !== 'PENDING') {
      return false; // Already filled or not pending
    }

    if (this.wasLevelHit(candle, entryLevel)) {
      // Calculate slippage (how much worse than expected)
      const close = candle.ohlc.close;
      const slippage = TradeExecution.calculateSlippagePercent(entryLevel, close);

      // Record entry
      await this.tradeRepository.recordEntry(
        trade.tradeId!,
        close,
        candle.closeTimeUTC,
        0, // bar index (would need to track from context)
      );

      console.log(`Entry filled for ${signal.symbol}: ${entryLevel} → ${close} (slippage: ${slippage.toFixed(2)}%)`);
      return true;
    }

    return false;
  }

  /**
   * Check if SL or target was hit on this candle
   */
  async checkExitExecution(
    signal: any, // SavedSignal
    candle: Candle,
  ): Promise<boolean> {
    const trade = await this.tradeRepository.getBySignalId(signal.signal_id);
    if (!trade || !trade.entryPrice || trade.status === 'CLOSED') {
      return false; // No entry or already closed
    }

    const stopLoss = signal.stop_loss_price;
    const target = signal.target_price;

    // Check SL hit
    if (stopLoss && this.wasLevelHit(candle, stopLoss)) {
      const exitPrice = this.getExitPrice(candle, stopLoss, signal.decision_action);
      await this.recordExit(
        trade,
        signal,
        exitPrice,
        candle,
        ExitType.SL_HIT,
      );
      console.log(`SL hit for ${signal.symbol}: ${stopLoss}`);
      return true;
    }

    // Check target hit
    if (target && this.wasLevelHit(candle, target)) {
      const exitPrice = this.getExitPrice(candle, target, signal.decision_action);
      await this.recordExit(
        trade,
        signal,
        exitPrice,
        candle,
        ExitType.TARGET_HIT,
      );
      console.log(`Target hit for ${signal.symbol}: ${target}`);
      return true;
    }

    // Update risk hit (how close to SL)
    if (stopLoss && trade.entryPrice) {
      const riskHit = TradeExecution.calculateRiskHitPercent(
        signal.decision_action,
        trade.entryPrice,
        stopLoss,
        candle.ohlc.close,
      );

      if (riskHit > 0 && riskHit <= 100) {
        // Only update if we're moving toward SL
        // (This is for monitoring, not persisted unless we need it)
      }
    }

    return false;
  }

  /**
   * Determine exit price when level is hit
   * For SL: get worst price
   * For target: get best price
   */
  private getExitPrice(candle: Candle, level: number, direction: 'LONG' | 'SHORT'): number {
    const { open, high, low, close } = candle.ohlc;

    if (direction === 'LONG') {
      // For SL (below entry): worst price when going down
      // For target (above entry): best price when going up
      if (level < open) {
        // SL case: take low or level, whichever is better
        return Math.max(low, level);
      } else {
        // Target case: take high or level, whichever is better
        return Math.min(high, level);
      }
    } else {
      // SHORT logic
      if (level > open) {
        // SL case: take high or level, whichever is worse
        return Math.min(high, level);
      } else {
        // Target case: take low or level, whichever is better
        return Math.max(low, level);
      }
    }
  }

  /**
   * Record exit and calculate PNL
   */
  private async recordExit(
    trade: any,
    signal: any,
    exitPrice: number,
    candle: Candle,
    exitType: ExitType,
  ): Promise<void> {
    // Record exit in repository
    await this.tradeRepository.recordExit(
      trade.tradeId,
      exitPrice,
      candle.closeTimeUTC,
      exitType,
      0, // bar index (would need to track from context)
    );

    // Calculate PNL
    const entryPrice = trade.entryPrice!;
    const pnlPercent = TradeExecution.calculatePnlPercent(
      signal.decision_action,
      entryPrice,
      exitPrice,
    );
    const pnlAmount = (exitPrice - entryPrice) * (signal.decision_action === 'SHORT' ? -1 : 1);

    // Calculate duration
    const durationMs = candle.closeTimeUTC.getTime() - trade.entryTimeUTC.getTime();
    const durationMinutes = Math.round(durationMs / 60000);

    // Update PNL
    await this.tradeRepository.updatePnL(
      trade.tradeId,
      pnlAmount,
      pnlPercent,
      0, // risk_hit_percent (would need to calculate)
      durationMinutes,
      1, // bars_held (simplified)
    );
  }

  /**
   * Check for session timeout (e.g., end of trading session)
   * Auto-exit if market closes without hitting SL/target
   */
  async checkSessionTimeout(
    signal: any,
    candle: Candle,
    sessionCloseTime: Date,
  ): Promise<boolean> {
    const trade = await this.tradeRepository.getBySignalId(signal.signal_id);
    if (!trade || trade.status === 'CLOSED') {
      return false;
    }

    if (candle.closeTimeUTC.getTime() >= sessionCloseTime.getTime()) {
      // Session closed without hitting SL/target
      const exitPrice = candle.ohlc.close;
      await this.recordExit(
        trade,
        signal,
        exitPrice,
        candle,
        ExitType.TIMEOUT,
      );
      console.log(`Session timeout for ${signal.symbol}: Auto-closed at ${exitPrice}`);
      return true;
    }

    return false;
  }
}
