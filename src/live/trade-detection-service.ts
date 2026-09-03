/**
 * Trade Detection Service
 * Monitors live prices and records when signals hit SL or Target
 */

import { SavedSignal } from '../persistence/signal-repository.interface';
import { SupabaseSignalRepository } from '../persistence/supabase-signal-repository';
import { Candle } from '../domain/candle';

export class TradeDetectionService {
  private activeSignals: Map<string, SavedSignal> = new Map();
  private entryHits: Map<string, { price: number; time: Date }> = new Map();

  constructor(private signalRepository: SupabaseSignalRepository) {}

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
        const entryHit = this.checkEntryHit(signal, candle.ohlc.high, candle.ohlc.low, candle.closeTimeUTC);
        if (entryHit) {
          await this.signalRepository.updateStatus(signal.signal_id, 'OPEN');
          signal.status = 'OPEN';
          this.entryHits.set(signalId, entryHit);
          console.log(`✅ Entry hit for ${signal.symbol}: ${entryHit.price} @ ${entryHit.time.toISOString()}`);
        }
      }

      if (signal.status === 'OPEN' && this.entryHits.has(signalId)) {
        const entryHit = this.entryHits.get(signalId)!;
        const outcome = this.checkExitHit(signal, candle.ohlc.high, candle.ohlc.low, candle.closeTimeUTC, entryHit);
        if (outcome) {
          await this.signalRepository.updateStatus(signal.signal_id, 'CLOSED');
          this.activeSignals.delete(signalId);
          this.entryHits.delete(signalId);
          console.log(`${outcome.exitType === 'TARGET_HIT' ? '🎯' : '❌'} ${outcome.exitType}: ${signal.symbol} ${outcome.pnlPoints > 0 ? '+' : ''}${outcome.pnlPoints.toFixed(2)} pts`);
        }
      }
    }
  }

  private checkEntryHit(signal: SavedSignal, high: number, low: number, closeTime: Date) {
    const entry = signal.entry_price;
    if (signal.decision_action === 'LONG' && high >= entry) {
      return { price: entry, time: closeTime };
    }
    if (signal.decision_action === 'SHORT' && low <= entry) {
      return { price: entry, time: closeTime };
    }
    return null;
  }

  private checkExitHit(signal: SavedSignal, high: number, low: number, closeTime: Date, entryHit: { price: number; time: Date }) {
    const entry = entryHit.price;
    const sl = signal.stop_loss_price;
    const target = signal.target_price;

    if (signal.decision_action === 'LONG') {
      if (target && high >= target) {
        const pnl = target - entry;
        return { exitType: 'TARGET_HIT' as const, exitPrice: target, exitTimeUtc: closeTime, pnlPoints: pnl, pnlPercent: (pnl / entry) * 100 };
      }
      if (low <= sl) {
        const pnl = sl - entry;
        return { exitType: 'SL_HIT' as const, exitPrice: sl, exitTimeUtc: closeTime, pnlPoints: pnl, pnlPercent: (pnl / entry) * 100 };
      }
    } else {
      if (target && low <= target) {
        const pnl = entry - target;
        return { exitType: 'TARGET_HIT' as const, exitPrice: target, exitTimeUtc: closeTime, pnlPoints: pnl, pnlPercent: (pnl / entry) * 100 };
      }
      if (high >= sl) {
        const pnl = entry - sl;
        return { exitType: 'SL_HIT' as const, exitPrice: sl, exitTimeUtc: closeTime, pnlPoints: pnl, pnlPercent: (pnl / entry) * 100 };
      }
    }
    return null;
  }
}
