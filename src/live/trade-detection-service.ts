/**
 * Trade Detection Service
 * Monitors live prices and records when signals hit SL or Target
 * Emits events for entry/exit hits for Phase 2 outcome recording
 */

import { EventEmitter } from 'events';
import { SavedSignal } from '../persistence/signal-repository.interface';
import { SupabaseSignalRepository } from '../persistence/supabase-signal-repository';
import { Candle } from '../domain/candle';

export class TradeDetectionService extends EventEmitter {
  private activeSignals: Map<string, SavedSignal> = new Map();
  private entryHits: Map<string, { price: number; time: Date; barIndex: number }> = new Map();

  constructor(private signalRepository: SupabaseSignalRepository) {
    super();
  }

  async loadActiveSignals(): Promise<void> {
    try {
      const activeSignals = await this.signalRepository.getByStatus(['GENERATED', 'OPEN']);
      for (const signal of activeSignals) {
        this.activeSignals.set(signal.signal_id, signal);
      }
      console.log(`📊 Loaded ${activeSignals.length} active signals for monitoring`);
    } catch (error) {
      console.error('Failed to load active signals:', (error as Error).message);
    }
  }

  async onCandle(candle: Candle): Promise<void> {
    for (const [signalId, signal] of this.activeSignals.entries()) {
      if (signal.symbol !== candle.symbol) continue;
      if (signal.status === 'CLOSED' || signal.status === 'INVALIDATED') {
        this.activeSignals.delete(signalId);
        continue;
      }

      if (signal.status === 'GENERATED') {
        const entryHit = this.checkEntryHit(signal, candle.ohlc.high, candle.ohlc.low, candle.closeTimeUTC, candle);
        if (entryHit) {
          await this.signalRepository.updateStatus(signal.signal_id, 'OPEN');
          signal.status = 'OPEN';
          this.entryHits.set(signalId, entryHit);
          console.log(`✅ Entry hit for ${signal.symbol}: ${entryHit.price} @ ${entryHit.time.toISOString()}`);
          // Emit entry hit event for Phase 2 outcome recording
          this.emit('entryHit', {
            signal,
            entryPrice: entryHit.price,
            entryTimeUTC: entryHit.time,
            entryBarIndex: entryHit.barIndex,
          });
        }
      }

      if (signal.status === 'OPEN' && this.entryHits.has(signalId)) {
        const entryHit = this.entryHits.get(signalId)!;
        const outcome = this.checkExitHit(signal, candle.ohlc.high, candle.ohlc.low, candle.closeTimeUTC, entryHit, candle);
        if (outcome) {
          await this.signalRepository.updateStatus(signal.signal_id, 'CLOSED');
          this.activeSignals.delete(signalId);
          this.entryHits.delete(signalId);
          console.log(`${outcome.exitType === 'TARGET_HIT' ? '🎯' : '❌'} ${outcome.exitType}: ${signal.symbol} ${outcome.pnlPoints > 0 ? '+' : ''}${outcome.pnlPoints.toFixed(2)} pts`);
          // Emit exit hit event for Phase 2 outcome recording
          this.emit('exitHit', {
            signal,
            exitPrice: outcome.exitPrice,
            exitTimeUTC: outcome.exitTimeUtc,
            exitBarIndex: outcome.exitBarIndex,
            exitType: outcome.exitType === 'TARGET_HIT' ? 'TARGET' : 'STOP_LOSS',
            pnlPoints: outcome.pnlPoints,
            pnlPercent: outcome.pnlPercent,
          });
        }
      }
    }
  }

  private checkEntryHit(signal: SavedSignal, high: number, low: number, closeTime: Date, candle: Candle) {
    const entry = signal.entry_price;
    // Calculate bar index (0-based, assuming we have started tracking from some reference point)
    // For now, use a simple counter that increments with each signal
    const barIndex = Math.floor(closeTime.getTime() / (5 * 60 * 1000)) % 10000;

    if (signal.decision_action === 'LONG' && high >= entry) {
      return { price: entry, time: closeTime, barIndex };
    }
    if (signal.decision_action === 'SHORT' && low <= entry) {
      return { price: entry, time: closeTime, barIndex };
    }
    return null;
  }

  private checkExitHit(signal: SavedSignal, high: number, low: number, closeTime: Date, entryHit: { price: number; time: Date; barIndex: number }, candle: Candle) {
    const entry = entryHit.price;
    const sl = signal.stop_loss_price;
    const target = signal.target_price;
    const barIndex = Math.floor(closeTime.getTime() / (5 * 60 * 1000)) % 10000;

    if (signal.decision_action === 'LONG') {
      if (target && high >= target) {
        const pnl = target - entry;
        return { exitType: 'TARGET_HIT' as const, exitPrice: target, exitTimeUtc: closeTime, exitBarIndex: barIndex, pnlPoints: pnl, pnlPercent: (pnl / entry) * 100 };
      }
      if (low <= sl) {
        const pnl = sl - entry;
        return { exitType: 'SL_HIT' as const, exitPrice: sl, exitTimeUtc: closeTime, exitBarIndex: barIndex, pnlPoints: pnl, pnlPercent: (pnl / entry) * 100 };
      }
    } else {
      if (target && low <= target) {
        const pnl = entry - target;
        return { exitType: 'TARGET_HIT' as const, exitPrice: target, exitTimeUtc: closeTime, exitBarIndex: barIndex, pnlPoints: pnl, pnlPercent: (pnl / entry) * 100 };
      }
      if (high >= sl) {
        const pnl = entry - sl;
        return { exitType: 'SL_HIT' as const, exitPrice: sl, exitTimeUtc: closeTime, exitBarIndex: barIndex, pnlPoints: pnl, pnlPercent: (pnl / entry) * 100 };
      }
    }
    return null;
  }
}
