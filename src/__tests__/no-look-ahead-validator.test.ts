import { NoLookAheadValidator } from '../domain/no-look-ahead-validator';
import { MTFCalculator } from '../domain/mtf-calculator';
import { Candle, CandleStatus, CandleOHLC } from '../domain/candle';
import { Timeframe, TimeframeValue } from '../domain/timeframe';

function istTimeString(dateTimeStr: string): Date {
  const [date, time] = dateTimeStr.split('T');
  const [year, month, day] = date.split('-').map(Number);
  const timeParts = time.split(':').map(Number);
  const hours = timeParts[0];
  const minutes = timeParts[1];
  const seconds = timeParts[2] || 0;

  const utcDate = new Date(Date.UTC(year, month - 1, day, hours, minutes, seconds));
  utcDate.setUTCHours(utcDate.getUTCHours() - 5);
  utcDate.setUTCMinutes(utcDate.getUTCMinutes() - 30);

  return utcDate;
}

function createClosedCandle(
  symbol: string,
  timeframe: TimeframeValue,
  openTimeIST: string,
  closeTimeIST: string,
): Candle {
  const openUTC = istTimeString(openTimeIST);
  const closeUTC = istTimeString(closeTimeIST);

  const ohlc: CandleOHLC = { open: 100, high: 105, low: 99, close: 102, volume: 1000 };

  return new Candle(
    symbol,
    Timeframe.from(timeframe),
    openUTC,
    closeUTC,
    ohlc,
    CandleStatus.CLOSED,
    closeUTC,
  );
}

describe('NoLookAheadValidator', () => {
  describe('Valid Snapshots', () => {
    it('should pass validation for clean snapshot', () => {
      const candle5m = createClosedCandle('RELIANCE', TimeframeValue.FIVE_MIN, '2026-08-21T09:15:00', '2026-08-21T09:20:00');
      const asOfTime = istTimeString('2026-08-21T09:20:00');

      const snapshot = MTFCalculator.getMTFSnapshot([candle5m], asOfTime, 'RELIANCE');
      const result = NoLookAheadValidator.validateSnapshot(snapshot);

      expect(result.valid).toBe(true);
      expect(result.violations).toHaveLength(0);
    });

    it('should pass validation for snapshot with multiple candles', () => {
      const candles = [
        createClosedCandle('RELIANCE', TimeframeValue.FIVE_MIN, '2026-08-21T09:15:00', '2026-08-21T09:20:00'),
        createClosedCandle('RELIANCE', TimeframeValue.FIFTEEN_MIN, '2026-08-21T09:15:00', '2026-08-21T09:30:00'),
        createClosedCandle('RELIANCE', TimeframeValue.SIXTY_MIN, '2026-08-21T09:15:00', '2026-08-21T10:15:00'),
      ];
      const asOfTime = istTimeString('2026-08-21T10:15:00');

      const snapshot = MTFCalculator.getMTFSnapshot(candles, asOfTime, 'RELIANCE');
      const result = NoLookAheadValidator.validateSnapshot(snapshot);

      expect(result.valid).toBe(true);
    });

    it('should pass validation with unavailable timeframes', () => {
      const candle5m = createClosedCandle('RELIANCE', TimeframeValue.FIVE_MIN, '2026-08-21T09:15:00', '2026-08-21T09:20:00');
      const asOfTime = istTimeString('2026-08-21T09:20:00');

      const snapshot = MTFCalculator.getMTFSnapshot([candle5m], asOfTime, 'RELIANCE');
      // 15m, 60m, 1D are unavailable
      const result = NoLookAheadValidator.validateSnapshot(snapshot);

      expect(result.valid).toBe(true);
    });
  });

  describe('Invalid Snapshots (Unsealed for Testing)', () => {
    it('should detect candle with future knowledgeTime', () => {
      const futureCandle = new Candle(
        'RELIANCE',
        Timeframe.from(TimeframeValue.FIVE_MIN),
        istTimeString('2026-08-21T09:15:00'),
        istTimeString('2026-08-21T09:20:00'),
        { open: 100, high: 105, low: 99, close: 102, volume: 1000 },
        CandleStatus.CLOSED,
        istTimeString('2026-08-21T09:30:00'), // Future knowledge time!
      );

      const asOfTime = istTimeString('2026-08-21T09:20:00');

      // Create unsealed snapshot for testing
      const { MTFSnapshot } = require('../domain/mtf-snapshot');
      const testSnapshot = new MTFSnapshot(asOfTime);
      testSnapshot.addTimeframeState({
        timeframe: Timeframe.from(TimeframeValue.FIVE_MIN),
        latestConfirmedCandle: futureCandle,
        knowledgeTime: futureCandle.knowledgeTimeUTC,
        availability: 'AVAILABLE' as any,
      });

      const result = NoLookAheadValidator.validateSnapshot(testSnapshot);

      expect(result.valid).toBe(false);
      expect(result.violations).toHaveLength(1);
      expect(result.violations[0].message).toContain('after snapshot time');
    });

    it('should report multiple violations', () => {
      const futureCandle5m = new Candle(
        'RELIANCE',
        Timeframe.from(TimeframeValue.FIVE_MIN),
        istTimeString('2026-08-21T09:15:00'),
        istTimeString('2026-08-21T09:20:00'),
        { open: 100, high: 105, low: 99, close: 102, volume: 1000 },
        CandleStatus.CLOSED,
        istTimeString('2026-08-21T09:30:00'),
      );

      const futureCandle15m = new Candle(
        'RELIANCE',
        Timeframe.from(TimeframeValue.FIFTEEN_MIN),
        istTimeString('2026-08-21T09:15:00'),
        istTimeString('2026-08-21T09:30:00'),
        { open: 100, high: 105, low: 99, close: 102, volume: 1000 },
        CandleStatus.CLOSED,
        istTimeString('2026-08-21T10:00:00'),
      );

      const asOfTime = istTimeString('2026-08-21T09:20:00');

      // Create unsealed snapshot for testing
      const { MTFSnapshot } = require('../domain/mtf-snapshot');
      const testSnapshot = new MTFSnapshot(asOfTime);

      testSnapshot.addTimeframeState({
        timeframe: Timeframe.from(TimeframeValue.FIVE_MIN),
        latestConfirmedCandle: futureCandle5m,
        knowledgeTime: futureCandle5m.knowledgeTimeUTC,
        availability: 'AVAILABLE' as any,
      });

      testSnapshot.addTimeframeState({
        timeframe: Timeframe.from(TimeframeValue.FIFTEEN_MIN),
        latestConfirmedCandle: futureCandle15m,
        knowledgeTime: futureCandle15m.knowledgeTimeUTC,
        availability: 'AVAILABLE' as any,
      });

      const result = NoLookAheadValidator.validateSnapshot(testSnapshot);

      expect(result.valid).toBe(false);
      expect(result.violations).toHaveLength(2);
    });
  });

  describe('Strict Validation', () => {
    it('should throw error on strict validation of invalid snapshot', () => {
      const futureCandle = new Candle(
        'RELIANCE',
        Timeframe.from(TimeframeValue.FIVE_MIN),
        istTimeString('2026-08-21T09:15:00'),
        istTimeString('2026-08-21T09:20:00'),
        { open: 100, high: 105, low: 99, close: 102, volume: 1000 },
        CandleStatus.CLOSED,
        istTimeString('2026-08-21T09:30:00'),
      );

      const asOfTime = istTimeString('2026-08-21T09:20:00');

      // Create unsealed snapshot for testing
      const { MTFSnapshot } = require('../domain/mtf-snapshot');
      const testSnapshot = new MTFSnapshot(asOfTime);

      testSnapshot.addTimeframeState({
        timeframe: Timeframe.from(TimeframeValue.FIVE_MIN),
        latestConfirmedCandle: futureCandle,
        knowledgeTime: futureCandle.knowledgeTimeUTC,
        availability: 'AVAILABLE' as any,
      });

      expect(() => NoLookAheadValidator.strictValidate(testSnapshot)).toThrow();
    });

    it('should not throw error on strict validation of valid snapshot', () => {
      const candle5m = createClosedCandle('RELIANCE', TimeframeValue.FIVE_MIN, '2026-08-21T09:15:00', '2026-08-21T09:20:00');
      const asOfTime = istTimeString('2026-08-21T09:20:00');

      const snapshot = MTFCalculator.getMTFSnapshot([candle5m], asOfTime, 'RELIANCE');

      expect(() => NoLookAheadValidator.strictValidate(snapshot)).not.toThrow();
    });
  });

  describe('Edge Cases', () => {
    it('should pass validation when knowledgeTime equals asOfTime', () => {
      const candle = createClosedCandle('RELIANCE', TimeframeValue.FIVE_MIN, '2026-08-21T09:15:00', '2026-08-21T09:20:00');
      const asOfTime = istTimeString('2026-08-21T09:20:00'); // Same as knowledgeTime

      const snapshot = MTFCalculator.getMTFSnapshot([candle], asOfTime, 'RELIANCE');
      const result = NoLookAheadValidator.validateSnapshot(snapshot);

      expect(result.valid).toBe(true);
    });

    it('should fail validation when knowledgeTime is one second after asOfTime', () => {
      const candleClose = istTimeString('2026-08-21T09:20:00');
      const candleKnowledge = new Date(candleClose.getTime() + 1000); // 1 second later

      const futureCandle = new Candle(
        'RELIANCE',
        Timeframe.from(TimeframeValue.FIVE_MIN),
        istTimeString('2026-08-21T09:15:00'),
        candleClose,
        { open: 100, high: 105, low: 99, close: 102, volume: 1000 },
        CandleStatus.CLOSED,
        candleKnowledge,
      );

      const asOfTime = candleClose; // Same as candle close

      // Create unsealed snapshot for testing
      const { MTFSnapshot } = require('../domain/mtf-snapshot');
      const testSnapshot = new MTFSnapshot(asOfTime);

      testSnapshot.addTimeframeState({
        timeframe: Timeframe.from(TimeframeValue.FIVE_MIN),
        latestConfirmedCandle: futureCandle,
        knowledgeTime: futureCandle.knowledgeTimeUTC,
        availability: 'AVAILABLE' as any,
      });

      const result = NoLookAheadValidator.validateSnapshot(testSnapshot);

      expect(result.valid).toBe(false);
    });
  });
});
