import { Candle } from './candle';
import { Timeframe } from './timeframe';

export interface ValidationError {
  type: 'DUPLICATE' | 'OUT_OF_ORDER' | 'MISSING' | 'INVALID_BOUNDARY';
  candle: Candle;
  message: string;
  previousCandle?: Candle;
}

export class CandleValidator {
  private candles: Map<string, Candle> = new Map();
  private errors: ValidationError[] = [];

  validate(candle: Candle): { valid: boolean; errors: ValidationError[] } {
    this.errors = [];

    this.checkDuplicate(candle);
    this.checkOutOfOrder(candle);
    this.checkMissing(candle);

    if (this.errors.length === 0) {
      this.candles.set(candle.id, candle);
    }

    return {
      valid: this.errors.length === 0,
      errors: [...this.errors],
    };
  }

  private checkDuplicate(candle: Candle): void {
    if (this.candles.has(candle.id)) {
      const existing = this.candles.get(candle.id)!;
      this.errors.push({
        type: 'DUPLICATE',
        candle,
        message: `Duplicate candle: ${candle.symbol} ${candle.timeframe.value} ${candle.openTimeUTC.toISOString()}`,
        previousCandle: existing,
      });
    }
  }

  private checkOutOfOrder(candle: Candle): void {
    // Find the most recent candle for this symbol/timeframe
    const recentCandles = Array.from(this.candles.values()).filter(
      (c) => c.symbol === candle.symbol && c.timeframe.equals(candle.timeframe),
    );

    if (recentCandles.length > 0) {
      const sorted = recentCandles.sort((a, b) => b.openTimeUTC.getTime() - a.openTimeUTC.getTime());
      const mostRecent = sorted[0];

      if (candle.openTimeUTC < mostRecent.openTimeUTC) {
        this.errors.push({
          type: 'OUT_OF_ORDER',
          candle,
          message: `Out-of-order candle: ${candle.symbol} ${candle.timeframe.value} ${candle.openTimeUTC.toISOString()} is before ${mostRecent.openTimeUTC.toISOString()}`,
          previousCandle: mostRecent,
        });
      }
    }
  }

  private checkMissing(candle: Candle): void {
    // Find the most recent candle for this symbol/timeframe
    const recentCandles = Array.from(this.candles.values()).filter(
      (c) => c.symbol === candle.symbol && c.timeframe.equals(candle.timeframe),
    );

    if (recentCandles.length > 0) {
      const sorted = recentCandles.sort((a, b) => b.openTimeUTC.getTime() - a.openTimeUTC.getTime());
      const mostRecent = sorted[0];

      const expectedMinutes = this.getExpectedMinutesBetweenCandles(candle.timeframe);
      const actualMinutes = (candle.openTimeUTC.getTime() - mostRecent.openTimeUTC.getTime()) / (1000 * 60);

      if (actualMinutes > expectedMinutes + 1) {
        // More than expectedMinutes (with 1-minute tolerance for rounding)
        this.errors.push({
          type: 'MISSING',
          candle,
          message: `Missing candle(s) detected: gap of ${actualMinutes} minutes between ${mostRecent.openTimeUTC.toISOString()} and ${candle.openTimeUTC.toISOString()}`,
          previousCandle: mostRecent,
        });
      }
    }
  }

  private getExpectedMinutesBetweenCandles(timeframe: Timeframe): number {
    return timeframe.minutes;
  }

  getErrors(): ValidationError[] {
    return [...this.errors];
  }

  getCandleCount(): number {
    return this.candles.size;
  }

  getAllCandles(): Candle[] {
    return Array.from(this.candles.values());
  }

  getCandle(symbol: string, timeframe: Timeframe, openTimeUTC: Date): Candle | undefined {
    const id = `${symbol}-${timeframe.value}-${openTimeUTC.getTime()}`;
    return this.candles.get(id);
  }

  clear(): void {
    this.candles.clear();
    this.errors = [];
  }
}

export class BulkCandleValidator {
  static validateBatch(candles: Candle[]): {
    validCandles: Candle[];
    errors: ValidationError[];
  } {
    const validator = new CandleValidator();
    const validCandles: Candle[] = [];
    const errors: ValidationError[] = [];

    // Sort by symbol, timeframe, then open time
    const sorted = [...candles].sort((a, b) => {
      if (a.symbol !== b.symbol) return a.symbol.localeCompare(b.symbol);
      if (a.timeframe.value !== b.timeframe.value)
        return a.timeframe.value.localeCompare(b.timeframe.value);
      return a.openTimeUTC.getTime() - b.openTimeUTC.getTime();
    });

    for (const candle of sorted) {
      const result = validator.validate(candle);
      if (result.valid) {
        validCandles.push(candle);
      } else {
        errors.push(...result.errors);
      }
    }

    return { validCandles, errors };
  }
}
