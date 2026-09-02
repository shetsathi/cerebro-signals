/**
 * Tick-to-Candle Aggregator
 *
 * Buffers incoming ticks and detects candle closures.
 * Respects session boundaries and candle contracts from Part 1.
 * Emits 'candleClosed' events with complete Candle objects.
 *
 * CRITICAL:
 * - No fake candles
 * - No look-ahead
 * - Respects DEVELOPING/CLOSED status
 * - Matches Part 1 Candle contract exactly
 */

import { EventEmitter } from 'events';
import { Candle, CandleCalculator, CandleStatus } from '../domain/candle';
import { Timeframe, TimeframeValue } from '../domain/timeframe';
import { SessionTime } from '../domain/session';
import { Tick } from './angel-one-live-client';

interface TickBuffer {
  symbol: string;
  timeframe: TimeframeValue;
  ticks: Array<{
    price: number;
    volume: number;
    timestamp: Date;
  }>;
  candleOpen: number | null;
  candleHigh: number | null;
  candleLow: number | null;
  candleVolume: number;
  candleOpenTime: Date | null;
}

export class TickAggregator extends EventEmitter {
  private buffers: Map<string, TickBuffer> = new Map(); // Key: "SYMBOL_TIMEFRAME"
  private lastEmittedCandle: Map<string, Date> = new Map(); // Prevent duplicate emissions

  constructor(private symbol: string, private timeframes: TimeframeValue[] = [TimeframeValue.FIVE_MIN]) {
    super();
    this.initializeBuffers();
  }

  private initializeBuffers(): void {
    for (const tf of this.timeframes) {
      const key = `${this.symbol}_${tf}`;
      this.buffers.set(key, {
        symbol: this.symbol,
        timeframe: tf,
        ticks: [],
        candleOpen: null,
        candleHigh: null,
        candleLow: null,
        candleVolume: 0,
        candleOpenTime: null,
      });
    }
  }

  /**
   * Process incoming tick
   */
  onTick(tick: Tick): void {
    if (tick.symbol !== this.symbol) {
      return; // Ignore ticks for other symbols
    }

    // Skip if outside session
    const sessionTime = new SessionTime(tick.timestamp);
    if (!sessionTime.isSessionOpen()) {
      return;
    }

    // Process for each timeframe
    for (const tf of this.timeframes) {
      this.processTick(tick, tf);
    }
  }

  /**
   * Process single tick for a specific timeframe
   */
  private processTick(tick: Tick, timeframe: TimeframeValue): void {
    const key = `${this.symbol}_${timeframe}`;
    const buffer = this.buffers.get(key);
    if (!buffer) return;

    const tickTimestamp = new Date(tick.timestamp);

    // Determine current candle boundaries
    const tf = Timeframe.from(timeframe);
    const candleCalculation = this.getCandleBoundaries(tickTimestamp, tf);
    if (!candleCalculation) {
      return; // Outside session - no candle to build
    }

    // Check if we're in a new candle
    if (buffer.candleOpenTime && this.isNewCandle(buffer.candleOpenTime, candleCalculation.openTime)) {
      // Emit closed candle
      this.emitClosedCandle(buffer, candleCalculation.openTime);

      // Reset buffer for new candle
      buffer.ticks = [];
      buffer.candleOpen = null;
      buffer.candleHigh = null;
      buffer.candleLow = null;
      buffer.candleVolume = 0;
      buffer.candleOpenTime = null;
    }

    // Initialize candle if first tick
    if (buffer.candleOpenTime === null) {
      buffer.candleOpenTime = candleCalculation.openTime;
      buffer.candleOpen = tick.ltp;
      buffer.candleHigh = tick.ltp;
      buffer.candleLow = tick.ltp;
    }

    // Update OHLCV
    buffer.candleHigh = Math.max(buffer.candleHigh!, tick.ltp);
    buffer.candleLow = Math.min(buffer.candleLow!, tick.ltp);
    buffer.candleVolume += tick.volume || 1;

    // Add to tick buffer
    buffer.ticks.push({
      price: tick.ltp,
      volume: tick.volume || 1,
      timestamp: tickTimestamp,
    });
  }

  /**
   * Get candle open/close times based on timeframe.
   *
   * Delegates to the frozen Part 1 CandleCalculator, which is machine-timezone
   * independent (utcToZonedTime + explicit UTC arithmetic). Its returned
   * openTimeIST/closeTimeIST fields are true UTC instants despite their names.
   *
   * Returns null when the timestamp falls outside the 09:15-15:30 IST session.
   */
  private getCandleBoundaries(
    timestamp: Date,
    timeframe: Timeframe,
  ): { openTime: Date; closeTime: Date } | null {
    const boundaries = CandleCalculator.calculateCandleBoundaries(timestamp, timeframe);
    if (!boundaries) {
      return null;
    }

    return {
      openTime: boundaries.openTimeIST,
      closeTime: boundaries.closeTimeIST,
    };
  }

  /**
   * Check if we've moved to a new candle
   */
  private isNewCandle(lastCandle: Date, currentCandle: Date): boolean {
    return lastCandle.getTime() !== currentCandle.getTime();
  }

  /**
   * Emit closed candle
   */
  private emitClosedCandle(buffer: TickBuffer, nextCandleOpen: Date): void {
    if (buffer.candleOpenTime === null || buffer.candleOpen === null) {
      return; // No complete candle
    }

    const candle = new Candle(
      buffer.symbol,
      Timeframe.from(buffer.timeframe),
      buffer.candleOpenTime, // openTimeUTC
      nextCandleOpen, // closeTimeUTC (next candle's open = previous candle's close)
      {
        open: buffer.candleOpen,
        high: buffer.candleHigh!,
        low: buffer.candleLow!,
        close: buffer.ticks.length > 0 ? buffer.ticks[buffer.ticks.length - 1].price : buffer.candleOpen,
        volume: buffer.candleVolume,
      },
      CandleStatus.CLOSED, // Always CLOSED when emitted (confirmed by time boundary)
    );

    // Prevent duplicate emissions
    const lastTime = this.lastEmittedCandle.get(`${buffer.symbol}_${buffer.timeframe}`);
    if (lastTime && lastTime.getTime() === candle.openTimeUTC.getTime()) {
      return;
    }

    this.lastEmittedCandle.set(`${buffer.symbol}_${buffer.timeframe}`, candle.openTimeUTC);

    console.log(`Candle closed: ${buffer.symbol} ${buffer.timeframe} @ ${candle.closeTimeUTC.toISOString()}`);
    this.emit('candleClosed', candle);
  }

  /**
   * Get current buffer state (for debugging)
   */
  getBufferState(): any {
    const state: any = {};
    for (const [key, buffer] of this.buffers) {
      state[key] = {
        open: buffer.candleOpen,
        high: buffer.candleHigh,
        low: buffer.candleLow,
        close: buffer.ticks.length > 0 ? buffer.ticks[buffer.ticks.length - 1].price : null,
        volume: buffer.candleVolume,
        ticks: buffer.ticks.length,
      };
    }
    return state;
  }
}
