import { CandleCalculator, Candle, CandleStatus, CandleOHLC } from '../domain/candle';
import { Timeframe, TimeframeValue } from '../domain/timeframe';
import { utcToZonedTime } from 'date-fns-tz';

const IST_TIMEZONE = 'Asia/Kolkata';

// Helper: Create a UTC Date that represents a given IST time
// E.g., istTimeString('2026-08-21T09:20:00') creates a UTC date representing 09:20 IST
function istTimeString(dateTimeStr: string): Date {
  // Parse the string as if it's IST
  const [date, time] = dateTimeStr.split('T');
  const [year, month, day] = date.split('-').map(Number);
  const timeParts = time.split(':').map(Number);
  const hours = timeParts[0];
  const minutes = timeParts[1];
  const seconds = timeParts[2] || 0;

  // IST = UTC + 5:30, so UTC = IST - 5:30
  const utcDate = new Date(Date.UTC(year, month - 1, day, hours, minutes, seconds));
  utcDate.setUTCHours(utcDate.getUTCHours() - 5);
  utcDate.setUTCMinutes(utcDate.getUTCMinutes() - 30);

  return utcDate;
}

describe('CandleCalculator', () => {
  describe('5-minute candles', () => {
    it('should calculate first 5m candle boundaries (09:15-09:20)', () => {
      const istTime = istTimeString('2026-08-21T09:18:00');
      const timeframe = Timeframe.from(TimeframeValue.FIVE_MIN);

      const boundaries = CandleCalculator.calculateCandleBoundaries(istTime, timeframe);

      expect(boundaries).not.toBeNull();
      const openIST = utcToZonedTime(boundaries!.openTimeIST, IST_TIMEZONE);
      const closeIST = utcToZonedTime(boundaries!.closeTimeIST, IST_TIMEZONE);
      expect(openIST.getHours()).toBe(9);
      expect(openIST.getMinutes()).toBe(15);
      expect(closeIST.getHours()).toBe(9);
      expect(closeIST.getMinutes()).toBe(20);
    });

    it('should calculate candle at 09:25', () => {
      const istTime = istTimeString('2026-08-21T09:25:00');
      const timeframe = Timeframe.from(TimeframeValue.FIVE_MIN);

      const boundaries = CandleCalculator.calculateCandleBoundaries(istTime, timeframe);

      const openIST = utcToZonedTime(boundaries!.openTimeIST, IST_TIMEZONE);
      const closeIST = utcToZonedTime(boundaries!.closeTimeIST, IST_TIMEZONE);
      expect(openIST.getMinutes()).toBe(25);
      expect(closeIST.getMinutes()).toBe(30);
    });

    it('should handle developing candle', () => {
      const istTime = istTimeString('2026-08-21T09:18:00');
      const timeframe = Timeframe.from(TimeframeValue.FIVE_MIN);

      const isClosed = CandleCalculator.isCandleClosed(istTime, timeframe);
      expect(isClosed).toBe(false);
    });

    it('should detect closed candle at close time', () => {
      const istTime = istTimeString('2026-08-21T09:20:00');
      const timeframe = Timeframe.from(TimeframeValue.FIVE_MIN);

      const isClosed = CandleCalculator.isCandleClosed(istTime, timeframe);
      expect(isClosed).toBe(true);
    });
  });

  describe('15-minute candles', () => {
    it('should calculate first 15m candle boundaries (09:15-09:30)', () => {
      const istTime = istTimeString('2026-08-21T09:25:00');
      const timeframe = Timeframe.from(TimeframeValue.FIFTEEN_MIN);

      const boundaries = CandleCalculator.calculateCandleBoundaries(istTime, timeframe);

      expect(boundaries).not.toBeNull();
      const openIST = utcToZonedTime(boundaries!.openTimeIST, IST_TIMEZONE);
      const closeIST = utcToZonedTime(boundaries!.closeTimeIST, IST_TIMEZONE);
      expect(openIST.getMinutes()).toBe(15);
      expect(closeIST.getMinutes()).toBe(30);
    });

    it('should calculate candle at 09:45', () => {
      const istTime = istTimeString('2026-08-21T09:40:00');
      const timeframe = Timeframe.from(TimeframeValue.FIFTEEN_MIN);

      const boundaries = CandleCalculator.calculateCandleBoundaries(istTime, timeframe);

      const openIST = utcToZonedTime(boundaries!.openTimeIST, IST_TIMEZONE);
      const closeIST = utcToZonedTime(boundaries!.closeTimeIST, IST_TIMEZONE);
      expect(openIST.getMinutes()).toBe(30);
      expect(closeIST.getMinutes()).toBe(45);
    });
  });

  describe('60-minute candles', () => {
    it('should calculate first 60m candle boundaries (09:15-10:15)', () => {
      const istTime = istTimeString('2026-08-21T09:45:00');
      const timeframe = Timeframe.from(TimeframeValue.SIXTY_MIN);

      const boundaries = CandleCalculator.calculateCandleBoundaries(istTime, timeframe);

      expect(boundaries).not.toBeNull();
      const openIST = utcToZonedTime(boundaries!.openTimeIST, IST_TIMEZONE);
      const closeIST = utcToZonedTime(boundaries!.closeTimeIST, IST_TIMEZONE);
      expect(openIST.getHours()).toBe(9);
      expect(openIST.getMinutes()).toBe(15);
      expect(closeIST.getHours()).toBe(10);
      expect(closeIST.getMinutes()).toBe(15);
    });

    it('should calculate 60m candle at 10:15-11:15', () => {
      const istTime = istTimeString('2026-08-21T10:45:00');
      const timeframe = Timeframe.from(TimeframeValue.SIXTY_MIN);

      const boundaries = CandleCalculator.calculateCandleBoundaries(istTime, timeframe);

      const openIST = utcToZonedTime(boundaries!.openTimeIST, IST_TIMEZONE);
      const closeIST = utcToZonedTime(boundaries!.closeTimeIST, IST_TIMEZONE);
      expect(openIST.getHours()).toBe(10);
      expect(openIST.getMinutes()).toBe(15);
      expect(closeIST.getHours()).toBe(11);
      expect(closeIST.getMinutes()).toBe(15);
    });

    it('should NOT treat 15:15-15:30 remainder as 60m candle', () => {
      const istTime = istTimeString('2026-08-21T15:20:00');
      const timeframe = Timeframe.from(TimeframeValue.SIXTY_MIN);

      const boundaries = CandleCalculator.calculateCandleBoundaries(istTime, timeframe);

      // The 15:15-15:30 window is NOT a 60-minute candle boundary
      expect(boundaries).toBeNull();
    });

    it('should handle boundary at 14:15-15:15 (last complete 60m candle)', () => {
      const istTime = istTimeString('2026-08-21T14:45:00');
      const timeframe = Timeframe.from(TimeframeValue.SIXTY_MIN);

      const boundaries = CandleCalculator.calculateCandleBoundaries(istTime, timeframe);

      const openIST = utcToZonedTime(boundaries!.openTimeIST, IST_TIMEZONE);
      const closeIST = utcToZonedTime(boundaries!.closeTimeIST, IST_TIMEZONE);
      expect(openIST.getHours()).toBe(14);
      expect(openIST.getMinutes()).toBe(15);
      expect(closeIST.getHours()).toBe(15);
      expect(closeIST.getMinutes()).toBe(15);
    });

    it('should detect 60m candle closed at 10:15', () => {
      const istTime = istTimeString('2026-08-21T10:15:00');
      const timeframe = Timeframe.from(TimeframeValue.SIXTY_MIN);

      const isClosed = CandleCalculator.isCandleClosed(istTime, timeframe);
      expect(isClosed).toBe(true);
    });
  });

  describe('Daily candle', () => {
    it('should calculate daily candle boundaries (09:15-15:30)', () => {
      const istTime = istTimeString('2026-08-21T12:00:00');
      const timeframe = Timeframe.from(TimeframeValue.DAILY);

      const boundaries = CandleCalculator.calculateCandleBoundaries(istTime, timeframe);

      expect(boundaries).not.toBeNull();
      const openIST = utcToZonedTime(boundaries!.openTimeIST, IST_TIMEZONE);
      const closeIST = utcToZonedTime(boundaries!.closeTimeIST, IST_TIMEZONE);
      expect(openIST.getHours()).toBe(9);
      expect(openIST.getMinutes()).toBe(15);
      expect(closeIST.getHours()).toBe(15);
      expect(closeIST.getMinutes()).toBe(30);
    });

    it('should detect daily candle closed at 15:30', () => {
      const istTime = istTimeString('2026-08-21T15:30:00');
      const timeframe = Timeframe.from(TimeframeValue.DAILY);

      const isClosed = CandleCalculator.isCandleClosed(istTime, timeframe);
      expect(isClosed).toBe(true);
    });
  });

  describe('Session boundaries', () => {
    it('should return null for candle before session open', () => {
      const istTime = istTimeString('2026-08-21T09:10:00');
      const timeframe = Timeframe.from(TimeframeValue.FIVE_MIN);

      const boundaries = CandleCalculator.calculateCandleBoundaries(istTime, timeframe);

      expect(boundaries).toBeNull();
    });

    it('should return null for candle after session close', () => {
      const istTime = istTimeString('2026-08-21T16:00:00');
      const timeframe = Timeframe.from(TimeframeValue.FIVE_MIN);

      const boundaries = CandleCalculator.calculateCandleBoundaries(istTime, timeframe);

      expect(boundaries).toBeNull();
    });

    it('should handle edge case at 15:29:59', () => {
      const istTime = istTimeString('2026-08-21T15:29:59');
      const timeframe = Timeframe.from(TimeframeValue.FIVE_MIN);

      const boundaries = CandleCalculator.calculateCandleBoundaries(istTime, timeframe);

      expect(boundaries).not.toBeNull();
    });
  });

  describe('Previous closed candle calculation', () => {
    it('should calculate previous closed 5m candle time', () => {
      const istTime = istTimeString('2026-08-21T09:25:00');
      const timeframe = Timeframe.from(TimeframeValue.FIVE_MIN);

      const prevClose = CandleCalculator.getPreviousClosedCandleTime(istTime, timeframe);

      expect(prevClose).not.toBeNull();
      const prevCloseIST = utcToZonedTime(prevClose, IST_TIMEZONE);
      expect(prevCloseIST.getMinutes()).toBe(20);
    });

    it('should return null for previous candle of first candle', () => {
      const istTime = istTimeString('2026-08-21T09:18:00');
      const timeframe = Timeframe.from(TimeframeValue.FIVE_MIN);

      const prevClose = CandleCalculator.getPreviousClosedCandleTime(istTime, timeframe);

      expect(prevClose).toBeNull();
    });
  });
});
