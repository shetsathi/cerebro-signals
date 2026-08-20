import { Timeframe, TimeframeValue } from './timeframe';
import { utcToZonedTime, format } from 'date-fns-tz';

const IST_TIMEZONE = 'Asia/Kolkata';

export enum CandleStatus {
  DEVELOPING = 'DEVELOPING',
  CLOSED = 'CLOSED',
}

export interface CandleOHLC {
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

export class Candle {
  constructor(
    readonly symbol: string,
    readonly timeframe: Timeframe,
    readonly openTimeUTC: Date,
    readonly closeTimeUTC: Date,
    readonly ohlc: CandleOHLC,
    readonly status: CandleStatus,
    readonly knowledgeTimeUTC: Date = closeTimeUTC,
  ) {}

  get id(): string {
    return `${this.symbol}-${this.timeframe.value}-${this.openTimeUTC.getTime()}`;
  }

  isDeveloping(): boolean {
    return this.status === CandleStatus.DEVELOPING;
  }

  isClosed(): boolean {
    return this.status === CandleStatus.CLOSED;
  }

  toString(): string {
    const openIST = utcToZonedTime(this.openTimeUTC, IST_TIMEZONE);
    const closeIST = utcToZonedTime(this.closeTimeUTC, IST_TIMEZONE);
    const timeStr = `${format(openIST, 'HH:mm', { timeZone: IST_TIMEZONE })}-${format(closeIST, 'HH:mm', { timeZone: IST_TIMEZONE })}`;
    return `${this.symbol} ${this.timeframe.value} ${timeStr} ${this.status} O:${this.ohlc.open} H:${this.ohlc.high} L:${this.ohlc.low} C:${this.ohlc.close}`;
  }
}

export class CandleCalculator {
  static getSessionOpenTimeIST(): Date {
    return { hours: 9, minutes: 15 } as any;
  }

  static calculateCandleBoundaries(
    timeIST: Date,
    timeframe: Timeframe,
  ): { openTimeIST: Date; closeTimeIST: Date } | null {
    // Convert to IST to get correct hours/minutes
    const istDate = utcToZonedTime(timeIST, IST_TIMEZONE);
    const hours = istDate.getHours();
    const minutes = istDate.getMinutes();
    const totalMins = hours * 60 + minutes;

    const sessionOpenMins = 9 * 60 + 15; // 09:15
    const sessionCloseMins = 15 * 60 + 30; // 15:30

    // Check if within session
    if (totalMins < sessionOpenMins || totalMins >= sessionCloseMins) {
      return null;
    }

    const candle = new Date(timeIST);

    switch (timeframe.value) {
      case TimeframeValue.FIVE_MIN:
        return this.calculate5mCandle(candle, istDate);
      case TimeframeValue.FIFTEEN_MIN:
        return this.calculate15mCandle(candle, istDate);
      case TimeframeValue.SIXTY_MIN:
        return this.calculate60mCandle(candle, istDate);
      case TimeframeValue.DAILY:
        return this.calculateDailyCandle(candle, istDate);
      default:
        throw new Error(`Unknown timeframe: ${timeframe.value}`);
    }
  }

  private static calculate5mCandle(
    baseDate: Date,
    istDate: Date,
  ): {
    openTimeIST: Date;
    closeTimeIST: Date;
  } {
    const sessionOpenMins = 9 * 60 + 15; // 09:15
    const totalMins = istDate.getHours() * 60 + istDate.getMinutes();
    const minsFromOpen = totalMins - sessionOpenMins;
    const candleIndex = Math.floor(minsFromOpen / 5);
    const candleOpenMins = sessionOpenMins + candleIndex * 5;
    const candleCloseMins = candleOpenMins + 5;

    const openTimeIST = this.constructISTDate(istDate, candleOpenMins);
    const closeTimeIST = this.constructISTDate(istDate, candleCloseMins);

    return { openTimeIST, closeTimeIST };
  }

  private static calculate15mCandle(
    baseDate: Date,
    istDate: Date,
  ): {
    openTimeIST: Date;
    closeTimeIST: Date;
  } {
    const sessionOpenMins = 9 * 60 + 15; // 09:15
    const totalMins = istDate.getHours() * 60 + istDate.getMinutes();
    const minsFromOpen = totalMins - sessionOpenMins;
    const candleIndex = Math.floor(minsFromOpen / 15);
    const candleOpenMins = sessionOpenMins + candleIndex * 15;
    const candleCloseMins = candleOpenMins + 15;

    const openTimeIST = this.constructISTDate(istDate, candleOpenMins);
    const closeTimeIST = this.constructISTDate(istDate, candleCloseMins);

    return { openTimeIST, closeTimeIST };
  }

  private static calculate60mCandle(
    baseDate: Date,
    istDate: Date,
  ): {
    openTimeIST: Date;
    closeTimeIST: Date;
  } {
    const sessionOpenMins = 9 * 60 + 15; // 09:15
    const totalMins = istDate.getHours() * 60 + istDate.getMinutes();
    const minsFromOpen = totalMins - sessionOpenMins;

    // Special handling: last candle is 15:15-15:30 (15 mins, NOT 60m)
    const sessionCloseMins = 15 * 60 + 30; // 15:30
    const minsUntilClose = sessionCloseMins - totalMins;

    // If we're in the 15:15-15:30 window, this is NOT a 60m candle
    // 60m candles are only for 09:15-10:15, 10:15-11:15, ..., 14:15-15:15
    if (totalMins >= 15 * 60 + 15) {
      // In the 15:15-15:30 remainder zone, not a complete 60m candle
      return null as any;
    }

    const candleIndex = Math.floor(minsFromOpen / 60);
    const candleOpenMins = sessionOpenMins + candleIndex * 60;
    const candleCloseMins = candleOpenMins + 60;

    const openTimeIST = this.constructISTDate(istDate, candleOpenMins);
    const closeTimeIST = this.constructISTDate(istDate, candleCloseMins);

    return { openTimeIST, closeTimeIST };
  }

  private static calculateDailyCandle(
    baseDate: Date,
    istDate: Date,
  ): {
    openTimeIST: Date;
    closeTimeIST: Date;
  } {
    const openTimeIST = this.constructISTDate(istDate, 9 * 60 + 15);
    const closeTimeIST = this.constructISTDate(istDate, 15 * 60 + 30);

    return { openTimeIST, closeTimeIST };
  }

  private static constructISTDate(baseDate: Date, istMinutes: number): Date {
    // Convert baseDate (UTC) to IST to get the correct date
    const istDate = utcToZonedTime(baseDate, IST_TIMEZONE);
    const year = istDate.getFullYear();
    const month = istDate.getMonth();
    const day = istDate.getDate();
    const hours = Math.floor(istMinutes / 60);
    const minutes = istMinutes % 60;

    // Create a UTC date representing this IST time
    // IST = UTC + 5:30, so to create UTC that represents IST time, UTC = IST - 5:30
    const utcDate = new Date(Date.UTC(year, month, day, hours, minutes, 0, 0));
    utcDate.setUTCHours(utcDate.getUTCHours() - 5);
    utcDate.setUTCMinutes(utcDate.getUTCMinutes() - 30);

    return utcDate;
  }

  static isCandleClosed(timeIST: Date, timeframe: Timeframe): boolean {
    const istDate = utcToZonedTime(timeIST, IST_TIMEZONE);
    const hours = istDate.getHours();
    const minutes = istDate.getMinutes();
    const totalMins = hours * 60 + minutes;

    const sessionOpenMins = 9 * 60 + 15; // 09:15
    const sessionCloseMins = 15 * 60 + 30; // 15:30

    // Before session open: no candles yet
    if (totalMins < sessionOpenMins) return false;

    // At or after session close: session candle is closed
    if (totalMins >= sessionCloseMins) return true;

    // During session: check if we're at a candle close boundary
    const tf = timeframe.minutes;
    const minsFromSessionOpen = totalMins - sessionOpenMins;

    // Check if current time is a multiple of timeframe minutes from session open
    // This means we're at a candle boundary
    return minsFromSessionOpen % tf === 0 && minsFromSessionOpen > 0;
  }

  static getPreviousClosedCandleTime(timeIST: Date, timeframe: Timeframe): Date {
    const boundaries = this.calculateCandleBoundaries(timeIST, timeframe);
    if (!boundaries) return null as any;

    const istDate = utcToZonedTime(timeIST, IST_TIMEZONE);
    const openMins = boundaries.openTimeIST.getHours() * 60 + boundaries.openTimeIST.getMinutes();
    const sessionOpenMins = 9 * 60 + 15;

    if (openMins === sessionOpenMins) {
      // This is the first candle of the session, no previous closed candle
      return null as any;
    }

    const offsetMins = this.getTimeframeOffsetMinutes(timeframe);
    const prevCloseMins = openMins - offsetMins;

    const prevClose = new Date(istDate);
    prevClose.setHours(Math.floor(prevCloseMins / 60), prevCloseMins % 60, 0, 0);

    return prevClose;
  }

  private static getTimeframeOffsetMinutes(timeframe: Timeframe): number {
    switch (timeframe.value) {
      case TimeframeValue.FIVE_MIN:
        return 5;
      case TimeframeValue.FIFTEEN_MIN:
        return 15;
      case TimeframeValue.SIXTY_MIN:
        return 60;
      case TimeframeValue.DAILY:
        return 1440;
      default:
        throw new Error(`Unknown timeframe: ${timeframe.value}`);
    }
  }
}
