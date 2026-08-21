/**
 * HISTORICAL DATA VALIDATION
 *
 * Enhanced validation beyond basic duplicate/out-of-order checks
 */

import { Candle } from '../domain/candle';
import { DataValidationError, CandleValidationResult } from './data-contracts';

export class HistoricalDataValidator {
  private candles: Candle[] = [];
  private canpleById: Map<string, Candle> = new Map();

  /**
   * Validate a batch of candles
   * Checks: duplicates, out-of-order, missing intervals, session boundaries, etc.
   */
  validateBatch(candles: Candle[]): {
    valid: boolean;
    errors: DataValidationError[];
    warnings: DataValidationError[];
  } {
    const errors: DataValidationError[] = [];
    const warnings: DataValidationError[] = [];

    // Reset state
    this.candles = [];
    this.canpleById.clear();

    // Group by symbol/timeframe
    const grouped = this.groupBySymbolTimeframe(candles);

    for (const key in grouped) {
      const group = grouped[key];
      const [symbol, timeframe] = key.split('|');

      this.validateGroup(group, symbol, timeframe, errors, warnings);
    }

    return {
      valid: errors.length === 0,
      errors,
      warnings,
    };
  }

  private groupBySymbolTimeframe(
    candles: Candle[],
  ): { [key: string]: Candle[] } {
    const grouped: { [key: string]: Candle[] } = {};

    for (const candle of candles) {
      const key = `${candle.symbol}|${candle.timeframe.value}`;
      if (!grouped[key]) {
        grouped[key] = [];
      }
      grouped[key].push(candle);
    }

    return grouped;
  }

  private validateGroup(
    candles: Candle[],
    symbol: string,
    timeframe: string,
    errors: DataValidationError[],
    warnings: DataValidationError[],
  ): void {
    if (candles.length === 0) return;

    // Sort by openTimeUTC
    const sorted = [...candles].sort((a, b) => a.openTimeUTC.getTime() - b.openTimeUTC.getTime());

    // Check for duplicates and out-of-order
    for (let i = 0; i < sorted.length; i++) {
      const candle = sorted[i];
      const id = candle.id;

      if (this.canpleById.has(id)) {
        errors.push({
          candle,
          errorType: 'DUPLICATE',
          message: `Duplicate candle: ${symbol} ${timeframe} ${candle.openTimeUTC.toISOString()}`,
          severity: 'ERROR',
        });
      }
      this.canpleById.set(id, candle);

      if (i > 0) {
        const prev = sorted[i - 1];
        if (candle.openTimeUTC < prev.openTimeUTC) {
          errors.push({
            candle,
            errorType: 'OUT_OF_ORDER',
            message: `Out-of-order candle: ${candle.openTimeUTC.toISOString()} after ${prev.openTimeUTC.toISOString()}`,
            severity: 'ERROR',
          });
        }
      }
    }

    // Check for missing intervals
    this.checkMissingIntervals(sorted, warnings);

    // Check session boundaries (check both opening AND closing)
    for (const candle of sorted) {
      if (candle.status === 'CLOSED') {
        const openHours = candle.openTimeUTC.getUTCHours();
        const openMinutes = candle.openTimeUTC.getUTCMinutes();
        const openMins = openHours * 60 + openMinutes;

        const closeHours = candle.closeTimeUTC.getUTCHours();
        const closeMinutes = candle.closeTimeUTC.getUTCMinutes();
        const closeMins = closeHours * 60 + closeMinutes;

        // IST session: 03:45-10:00 UTC (09:15-15:30 IST)
        if (openMins < 225 || closeMins > 600) {
          warnings.push({
            candle,
            errorType: 'SESSION_BOUNDARY',
            message: `Candle outside session boundaries: open=${openMins}min UTC, close=${closeMins}min UTC (session 225-600)`,
            severity: 'WARNING',
          });
        }
      }
    }

    this.candles.push(...sorted);
  }

  private checkMissingIntervals(candles: Candle[], warnings: DataValidationError[]): void {
    if (candles.length < 2) return;

    const expectedMinutes = this.getExpectedBarMinutes(candles[0]);
    if (expectedMinutes === 0) return; // Daily or unsupported timeframe

    for (let i = 1; i < candles.length; i++) {
      const prev = candles[i - 1];
      const curr = candles[i];

      const actualGap = (curr.openTimeUTC.getTime() - prev.closeTimeUTC.getTime()) / (1000 * 60);

      // Distinguish gap types:
      if (this.isNormalOvernightGap(prev.closeTimeUTC, curr.openTimeUTC)) {
        // Overnight gap (end of session to next session) — expected, skip warning
        continue;
      }

      if (this.isWeekendGap(prev.openTimeUTC, curr.openTimeUTC)) {
        // Weekend gap — expected, skip warning
        continue;
      }

      // If gap is suspiciously large (> expected bar minutes), warn about missing data
      if (actualGap > expectedMinutes + 1) {
        // Allow slight variations, but flag suspicious gaps
        warnings.push({
          candle: curr,
          errorType: 'MISSING_INTERVAL',
          message: `Unexpected gap of ${actualGap} minutes (expected ~${expectedMinutes}m)`,
          severity: 'WARNING',
        });
      }
    }
  }

  private isNormalOvernightGap(prevClose: Date, currOpen: Date): boolean {
    // Detect session close (15:30 IST = 10:00 UTC) to next open (09:15 IST = 03:45 UTC)
    const prevCloseUTC = (prevClose.getUTCHours() * 60 + prevClose.getUTCMinutes());
    const currOpenUTC = (currOpen.getUTCHours() * 60 + currOpen.getUTCMinutes());

    // If prev closes near end of session and curr opens near start of session, it's overnight
    return prevCloseUTC >= 595 && currOpenUTC <= 230; // 595-600 is session close, 0-230 is before session open
  }

  private isWeekendGap(prevOpen: Date, currOpen: Date): boolean {
    // Check if gap spans a weekend (Sat/Sun in UTC)
    const prevDay = prevOpen.getUTCDay();
    const currDay = currOpen.getUTCDay();

    // If dates are different and span weekend, it's expected
    const daysApart = (currOpen.getTime() - prevOpen.getTime()) / (24 * 60 * 60 * 1000);
    return daysApart >= 2; // 2+ days is likely a weekend or holiday
  }

  private getExpectedBarMinutes(candle: Candle): number {
    switch (candle.timeframe.value) {
      case '5m':
        return 5;
      case '15m':
        return 15;
      case '60m':
        return 60;
      case '1D':
        return 0; // Daily — gaps expected
      default:
        return 0;
    }
  }
}
