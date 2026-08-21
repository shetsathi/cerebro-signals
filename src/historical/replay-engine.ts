/**
 * HISTORICAL REPLAY ENGINE
 *
 * Deterministic point-in-time replay of historical candles
 * Feeds candles to frozen Parts 1–6 for setup observation
 */

import { Candle } from '../domain/candle';
import { Timeframe } from '../domain/timeframe';
import { DatasetManifest, ReplayEvent } from './data-contracts';

export interface ReplayConfig {
  symbol: string;
  timeframes: string[]; // e.g., ["5m", "15m", "60m"]
  startDateUTC: Date;
  endDateUTC: Date;
  tickTimeframe?: '5m' | '15m' | '60m'; // finest-grain timeframe for iteration
}

export class ReplayEngine {
  /**
   * Deterministic replay configuration validation
   */
  static validateConfig(config: ReplayConfig): { valid: boolean; errors: string[] } {
    const errors: string[] = [];

    if (!config.symbol || config.symbol.trim() === '') {
      errors.push('symbol is required');
    }

    if (!config.timeframes || config.timeframes.length === 0) {
      errors.push('at least one timeframe is required');
    }

    if (config.startDateUTC >= config.endDateUTC) {
      errors.push('startDateUTC must be before endDateUTC');
    }

    return {
      valid: errors.length === 0,
      errors,
    };
  }

  /**
   * Replay candles chronologically
   * Yields replay events at each candle close
   */
  static async *replay(
    candles: Candle[],
    config: ReplayConfig,
  ): AsyncGenerator<ReplayEvent> {
    const validation = this.validateConfig(config);
    if (!validation.valid) {
      throw new Error(`Invalid replay config: ${validation.errors.join('; ')}`);
    }

    // Filter candles by config
    const filtered = candles.filter(c => {
      return (
        c.symbol === config.symbol &&
        config.timeframes.includes(c.timeframe.value) &&
        c.closeTimeUTC >= config.startDateUTC &&
        c.closeTimeUTC <= config.endDateUTC
      );
    });

    // Sort chronologically (should already be sorted)
    const sorted = [...filtered].sort((a, b) => a.openTimeUTC.getTime() - b.openTimeUTC.getTime());

    // Yield events
    for (const candle of sorted) {
      yield {
        asOfTimeUTC: candle.closeTimeUTC,
        symbol: candle.symbol,
        timeframe: candle.timeframe.value,
        candle,
        eventType: 'CANDLE_CLOSED',
      };
    }
  }

  /**
   * Compute expected candle times for a timeframe
   * Useful for detecting missing candles
   */
  static expectedCandleCount(
    startDateUTC: Date,
    endDateUTC: Date,
    timeframeMinutes: number,
  ): number {
    const diffMs = endDateUTC.getTime() - startDateUTC.getTime();
    const diffMinutes = diffMs / (1000 * 60);
    return Math.ceil(diffMinutes / timeframeMinutes);
  }

  /**
   * Verify replay determinism
   * Run same replay twice, verify identical outputs
   */
  static async verifyDeterminism(
    candles: Candle[],
    config: ReplayConfig,
  ): Promise<{ deterministic: boolean; run1Count: number; run2Count: number }> {
    const run1Events: ReplayEvent[] = [];
    for await (const event of this.replay(candles, config)) {
      run1Events.push(event);
    }

    const run2Events: ReplayEvent[] = [];
    for await (const event of this.replay(candles, config)) {
      run2Events.push(event);
    }

    const deterministic =
      run1Events.length === run2Events.length &&
      run1Events.every((e, i) => e.candle.id === run2Events[i].candle.id);

    return {
      deterministic,
      run1Count: run1Events.length,
      run2Count: run2Events.length,
    };
  }
}
