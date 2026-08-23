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
import { Candle, CandleStatus } from '../domain/candle';
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
   * Get candle open/close times based on timeframe
   */
  private getCandleBoundaries(timestamp: Date, timeframe: Timeframe): { openTime: Date; closeTime: Date } {
    const timestampUTC = new Date(timestamp);

    // Convert to IST for candle alignment
    const formatter = new Intl.DateTimeFormat('en-US', {
      timeZone: 'Asia/Kolkata',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    });

    const parts = formatter.formatToParts(timestamp);
    const istHour = parseInt(parts.find(p => p.type === 'hour')?.value || '0');
    const istMinute = parseInt(parts.find(p => p.type === 'minute')?.value || '0');

    // Session start: 09:15 IST = 03:45 UTC
    const sessionStart = new Date(timestamp);
    sessionStart.setUTCHours(3, 45, 0, 0);

    // Calculate minutes since session start (in IST)
    const istDate = new Date(timestamp);
    const minutes = (istHour - 9) * 60 + (istMinute - 15);

    let candleIndex = 0;
    let minutesPerCandle = 5;

    if (timeframe.value === TimeframeValue.FIFTEEN_MIN) {
      minutesPerCandle = 15;
    } else if (timeframe.value === TimeframeValue.SIXTY_MIN) {
      minutesPerCandle = 60;
    } else if (timeframe.value === TimeframeValue.DAILY) {
      // Daily: entire session is one candle
      return {
        openTime: sessionStart,
        closeTime: new Date(sessionStart.getTime() + 6 * 60 * 60 * 1000 + 15 * 60 * 1000), // 09:15-15:30
      };
    }

    candleIndex = Math.floor(minutes / minutesPerCandle);
    const openMinutes = candleIndex * minutesPerCandle;
    const closeMinutes = openMinutes + minutesPerCandle;

    const openTimeIST = new Date(istDate);
    openTimeIST.setHours(9 + Math.floor((15 + openMinutes) / 60), (15 + openMinutes) % 60, 0, 0);

    // Convert back to UTC
    const openTimeUTC = new Date(openTimeIST.toLocaleString('en-US', { timeZone: 'UTC' }));

    const closeTimeIST = new Date(istDate);
    closeTimeIST.setHours(9 + Math.floor((15 + closeMinutes) / 60), (15 + closeMinutes) % 60, 0, 0);
    const closeTimeUTC = new Date(closeTimeIST.toLocaleString('en-US', { timeZone: 'UTC' }));

    return {
      openTime: openTimeUTC,
      closeTime: closeTimeUTC,
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
