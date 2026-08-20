import { MTFCalculator } from '../domain/mtf-calculator';
import { MTFSnapshot, TimeframeAvailability } from '../domain/mtf-snapshot';
import { Candle, CandleStatus, CandleOHLC } from '../domain/candle';
import { Timeframe, TimeframeValue } from '../domain/timeframe';
import { utcToZonedTime } from 'date-fns-tz';

const IST_TIMEZONE = 'Asia/Kolkata';

// Helper: Create a UTC Date that represents a given IST time
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

// Helper: Create a closed candle with standard OHLC
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
    closeUTC, // knowledgeTime = closeTime
  );
}

// Helper: Create a developing candle
function createDevelopingCandle(
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
    CandleStatus.DEVELOPING,
    closeUTC, // knowledgeTime would be in future
  );
}

describe('MTFSnapshot', () => {
  describe('Test Case 1 — 09:20', () => {
    it('should have closed 5m candle 09:15-09:20', () => {
      const candle5m = createClosedCandle('RELIANCE', TimeframeValue.FIVE_MIN, '2026-08-21T09:15:00', '2026-08-21T09:20:00');
      const asOfTime = istTimeString('2026-08-21T09:20:00');

      const snapshot = MTFCalculator.getMTFSnapshot([candle5m], asOfTime, 'RELIANCE');

      const state5m = snapshot.getTimeframeState(TimeframeValue.FIVE_MIN);
      expect(state5m).toBeDefined();
      expect(state5m!.latestConfirmedCandle).toEqual(candle5m);
      expect(state5m!.availability).toBe(TimeframeAvailability.AVAILABLE);
    });

    it('should have unavailable 15m (no previous session candle provided)', () => {
      const candle5m = createClosedCandle('RELIANCE', TimeframeValue.FIVE_MIN, '2026-08-21T09:15:00', '2026-08-21T09:20:00');
      const candle15mDeveloping = createDevelopingCandle('RELIANCE', TimeframeValue.FIFTEEN_MIN, '2026-08-21T09:15:00', '2026-08-21T09:30:00');
      const asOfTime = istTimeString('2026-08-21T09:20:00');

      const snapshot = MTFCalculator.getMTFSnapshot(
        [candle5m, candle15mDeveloping],
        asOfTime,
        'RELIANCE',
      );

      const state15m = snapshot.getTimeframeState(TimeframeValue.FIFTEEN_MIN);
      expect(state15m!.availability).toBe(TimeframeAvailability.UNAVAILABLE);
      expect(state15m!.latestConfirmedCandle).toBeNull();
    });

    it('should exclude developing 15m candle', () => {
      const candle15mDeveloping = createDevelopingCandle('RELIANCE', TimeframeValue.FIFTEEN_MIN, '2026-08-21T09:15:00', '2026-08-21T09:30:00');
      const asOfTime = istTimeString('2026-08-21T09:20:00');

      const latestCandle = MTFCalculator.getLatestConfirmedCandle(
        [candle15mDeveloping],
        'RELIANCE',
        Timeframe.from(TimeframeValue.FIFTEEN_MIN),
        asOfTime,
      );

      expect(latestCandle).toBeNull();
    });
  });

  describe('Test Case 2 — 09:40', () => {
    it('should have closed 5m candle 09:35-09:40', () => {
      const candle5m = createClosedCandle('RELIANCE', TimeframeValue.FIVE_MIN, '2026-08-21T09:35:00', '2026-08-21T09:40:00');
      const asOfTime = istTimeString('2026-08-21T09:40:00');

      const snapshot = MTFCalculator.getMTFSnapshot([candle5m], asOfTime, 'RELIANCE');

      const state5m = snapshot.getTimeframeState(TimeframeValue.FIVE_MIN);
      expect(state5m!.latestConfirmedCandle).toEqual(candle5m);
    });

    it('should use previous confirmed 15m candle (09:15-09:30)', () => {
      const candle15mPrev = createClosedCandle('RELIANCE', TimeframeValue.FIFTEEN_MIN, '2026-08-21T09:15:00', '2026-08-21T09:30:00');
      const candle15mCurrent = createDevelopingCandle('RELIANCE', TimeframeValue.FIFTEEN_MIN, '2026-08-21T09:30:00', '2026-08-21T09:45:00');
      const asOfTime = istTimeString('2026-08-21T09:40:00');

      const snapshot = MTFCalculator.getMTFSnapshot(
        [candle15mPrev, candle15mCurrent],
        asOfTime,
        'RELIANCE',
      );

      const state15m = snapshot.getTimeframeState(TimeframeValue.FIFTEEN_MIN);
      expect(state15m!.latestConfirmedCandle).toEqual(candle15mPrev);
    });

    it('should have developing 60m candle excluded', () => {
      const candle60mDeveloping = createDevelopingCandle('RELIANCE', TimeframeValue.SIXTY_MIN, '2026-08-21T09:15:00', '2026-08-21T10:15:00');
      const asOfTime = istTimeString('2026-08-21T09:40:00');

      const latestCandle = MTFCalculator.getLatestConfirmedCandle(
        [candle60mDeveloping],
        'RELIANCE',
        Timeframe.from(TimeframeValue.SIXTY_MIN),
        asOfTime,
      );

      expect(latestCandle).toBeNull();
    });
  });

  describe('Test Case 3 — 10:00', () => {
    it('should have closed 5m candle 09:55-10:00', () => {
      const candle5m = createClosedCandle('RELIANCE', TimeframeValue.FIVE_MIN, '2026-08-21T09:55:00', '2026-08-21T10:00:00');
      const asOfTime = istTimeString('2026-08-21T10:00:00');

      const snapshot = MTFCalculator.getMTFSnapshot([candle5m], asOfTime, 'RELIANCE');

      const state5m = snapshot.getTimeframeState(TimeframeValue.FIVE_MIN);
      expect(state5m!.latestConfirmedCandle).toEqual(candle5m);
    });

    it('should have closed 15m candle 09:45-10:00', () => {
      const candle15m = createClosedCandle('RELIANCE', TimeframeValue.FIFTEEN_MIN, '2026-08-21T09:45:00', '2026-08-21T10:00:00');
      const asOfTime = istTimeString('2026-08-21T10:00:00');

      const snapshot = MTFCalculator.getMTFSnapshot([candle15m], asOfTime, 'RELIANCE');

      const state15m = snapshot.getTimeframeState(TimeframeValue.FIFTEEN_MIN);
      expect(state15m!.latestConfirmedCandle).toEqual(candle15m);
    });

    it('should have developing 60m candle excluded', () => {
      const candle60mDeveloping = createDevelopingCandle('RELIANCE', TimeframeValue.SIXTY_MIN, '2026-08-21T09:15:00', '2026-08-21T10:15:00');
      const asOfTime = istTimeString('2026-08-21T10:00:00');

      const latestCandle = MTFCalculator.getLatestConfirmedCandle(
        [candle60mDeveloping],
        'RELIANCE',
        Timeframe.from(TimeframeValue.SIXTY_MIN),
        asOfTime,
      );

      expect(latestCandle).toBeNull();
    });
  });

  describe('Test Case 4 — 10:15', () => {
    it('should have closed 60m candle 09:15-10:15 at exactly close time', () => {
      const candle60m = createClosedCandle('RELIANCE', TimeframeValue.SIXTY_MIN, '2026-08-21T09:15:00', '2026-08-21T10:15:00');
      const asOfTime = istTimeString('2026-08-21T10:15:00');

      const snapshot = MTFCalculator.getMTFSnapshot([candle60m], asOfTime, 'RELIANCE');

      const state60m = snapshot.getTimeframeState(TimeframeValue.SIXTY_MIN);
      expect(state60m!.latestConfirmedCandle).toEqual(candle60m);
      expect(state60m!.availability).toBe(TimeframeAvailability.AVAILABLE);
    });

    it('should have closed 15m candle 10:00-10:15', () => {
      const candle15m = createClosedCandle('RELIANCE', TimeframeValue.FIFTEEN_MIN, '2026-08-21T10:00:00', '2026-08-21T10:15:00');
      const asOfTime = istTimeString('2026-08-21T10:15:00');

      const snapshot = MTFCalculator.getMTFSnapshot([candle15m], asOfTime, 'RELIANCE');

      const state15m = snapshot.getTimeframeState(TimeframeValue.FIFTEEN_MIN);
      expect(state15m!.latestConfirmedCandle).toEqual(candle15m);
    });
  });

  describe('Test Case 5 — 10:20', () => {
    it('should have closed 5m candle 10:15-10:20', () => {
      const candle5m = createClosedCandle('RELIANCE', TimeframeValue.FIVE_MIN, '2026-08-21T10:15:00', '2026-08-21T10:20:00');
      const asOfTime = istTimeString('2026-08-21T10:20:00');

      const snapshot = MTFCalculator.getMTFSnapshot([candle5m], asOfTime, 'RELIANCE');

      const state5m = snapshot.getTimeframeState(TimeframeValue.FIVE_MIN);
      expect(state5m!.latestConfirmedCandle).toEqual(candle5m);
    });

    it('should use previous 15m candle (developing 10:15-10:30)', () => {
      const candle15mPrev = createClosedCandle('RELIANCE', TimeframeValue.FIFTEEN_MIN, '2026-08-21T10:00:00', '2026-08-21T10:15:00');
      const candle15mCurrent = createDevelopingCandle('RELIANCE', TimeframeValue.FIFTEEN_MIN, '2026-08-21T10:15:00', '2026-08-21T10:30:00');
      const asOfTime = istTimeString('2026-08-21T10:20:00');

      const snapshot = MTFCalculator.getMTFSnapshot(
        [candle15mPrev, candle15mCurrent],
        asOfTime,
        'RELIANCE',
      );

      const state15m = snapshot.getTimeframeState(TimeframeValue.FIFTEEN_MIN);
      expect(state15m!.latestConfirmedCandle).toEqual(candle15mPrev);
    });

    it('should use previous 60m candle (developing 10:15-11:15)', () => {
      const candle60mPrev = createClosedCandle('RELIANCE', TimeframeValue.SIXTY_MIN, '2026-08-21T09:15:00', '2026-08-21T10:15:00');
      const candle60mCurrent = createDevelopingCandle('RELIANCE', TimeframeValue.SIXTY_MIN, '2026-08-21T10:15:00', '2026-08-21T11:15:00');
      const asOfTime = istTimeString('2026-08-21T10:20:00');

      const snapshot = MTFCalculator.getMTFSnapshot(
        [candle60mPrev, candle60mCurrent],
        asOfTime,
        'RELIANCE',
      );

      const state60m = snapshot.getTimeframeState(TimeframeValue.SIXTY_MIN);
      expect(state60m!.latestConfirmedCandle).toEqual(candle60mPrev);
    });
  });

  describe('Test Case 6 — 11:00', () => {
    it('should have closed 5m candle 10:55-11:00', () => {
      const candle5m = createClosedCandle('RELIANCE', TimeframeValue.FIVE_MIN, '2026-08-21T10:55:00', '2026-08-21T11:00:00');
      const asOfTime = istTimeString('2026-08-21T11:00:00');

      const snapshot = MTFCalculator.getMTFSnapshot([candle5m], asOfTime, 'RELIANCE');

      const state5m = snapshot.getTimeframeState(TimeframeValue.FIVE_MIN);
      expect(state5m!.latestConfirmedCandle).toEqual(candle5m);
    });

    it('should have closed 15m candle 10:45-11:00', () => {
      const candle15m = createClosedCandle('RELIANCE', TimeframeValue.FIFTEEN_MIN, '2026-08-21T10:45:00', '2026-08-21T11:00:00');
      const asOfTime = istTimeString('2026-08-21T11:00:00');

      const snapshot = MTFCalculator.getMTFSnapshot([candle15m], asOfTime, 'RELIANCE');

      const state15m = snapshot.getTimeframeState(TimeframeValue.FIFTEEN_MIN);
      expect(state15m!.latestConfirmedCandle).toEqual(candle15m);
    });

    it('should use previous 60m candle (developing 10:15-11:15)', () => {
      const candle60mPrev = createClosedCandle('RELIANCE', TimeframeValue.SIXTY_MIN, '2026-08-21T09:15:00', '2026-08-21T10:15:00');
      const candle60mCurrent = createDevelopingCandle('RELIANCE', TimeframeValue.SIXTY_MIN, '2026-08-21T10:15:00', '2026-08-21T11:15:00');
      const asOfTime = istTimeString('2026-08-21T11:00:00');

      const snapshot = MTFCalculator.getMTFSnapshot(
        [candle60mPrev, candle60mCurrent],
        asOfTime,
        'RELIANCE',
      );

      const state60m = snapshot.getTimeframeState(TimeframeValue.SIXTY_MIN);
      expect(state60m!.latestConfirmedCandle).toEqual(candle60mPrev);
    });
  });

  describe('Boundary Conditions', () => {
    it('should include candle when knowledgeTime equals asOfTime', () => {
      const candle = createClosedCandle('RELIANCE', TimeframeValue.FIVE_MIN, '2026-08-21T09:15:00', '2026-08-21T09:20:00');
      const asOfTime = istTimeString('2026-08-21T09:20:00'); // Same as candle close time

      const latest = MTFCalculator.getLatestConfirmedCandle(
        [candle],
        'RELIANCE',
        Timeframe.from(TimeframeValue.FIVE_MIN),
        asOfTime,
      );

      expect(latest).toEqual(candle);
    });

    it('should exclude candle when knowledgeTime is after asOfTime', () => {
      const candle = createClosedCandle('RELIANCE', TimeframeValue.FIVE_MIN, '2026-08-21T09:15:00', '2026-08-21T09:20:00');
      const asOfTime = istTimeString('2026-08-21T09:19:00'); // Before candle close

      const latest = MTFCalculator.getLatestConfirmedCandle(
        [candle],
        'RELIANCE',
        Timeframe.from(TimeframeValue.FIVE_MIN),
        asOfTime,
      );

      expect(latest).toBeNull();
    });

    it('should get latest closed candle when multiple exist', () => {
      const candle1 = createClosedCandle('RELIANCE', TimeframeValue.FIVE_MIN, '2026-08-21T09:15:00', '2026-08-21T09:20:00');
      const candle2 = createClosedCandle('RELIANCE', TimeframeValue.FIVE_MIN, '2026-08-21T09:20:00', '2026-08-21T09:25:00');
      const candle3 = createClosedCandle('RELIANCE', TimeframeValue.FIVE_MIN, '2026-08-21T09:25:00', '2026-08-21T09:30:00');
      const asOfTime = istTimeString('2026-08-21T09:30:00');

      const latest = MTFCalculator.getLatestConfirmedCandle(
        [candle1, candle2, candle3],
        'RELIANCE',
        Timeframe.from(TimeframeValue.FIVE_MIN),
        asOfTime,
      );

      expect(latest).toEqual(candle3);
    });
  });

  describe('Symbol Isolation', () => {
    it('should not contaminate snapshots across symbols', () => {
      const candleREL = createClosedCandle('RELIANCE', TimeframeValue.FIVE_MIN, '2026-08-21T09:15:00', '2026-08-21T09:20:00');
      const candleINFY = createClosedCandle('INFY', TimeframeValue.FIVE_MIN, '2026-08-21T09:15:00', '2026-08-21T09:20:00');
      const asOfTime = istTimeString('2026-08-21T09:20:00');

      const snapshotREL = MTFCalculator.getMTFSnapshot([candleREL, candleINFY], asOfTime, 'RELIANCE');
      const snapshotINFY = MTFCalculator.getMTFSnapshot([candleREL, candleINFY], asOfTime, 'INFY');

      expect(snapshotREL.getLatestConfirmedCandle(TimeframeValue.FIVE_MIN)?.symbol).toBe('RELIANCE');
      expect(snapshotINFY.getLatestConfirmedCandle(TimeframeValue.FIVE_MIN)?.symbol).toBe('INFY');
    });
  });

  describe('Cross-Day Behavior', () => {
    it('should use previous trading day candle when available', () => {
      const candleYesterdayDaily = createClosedCandle('RELIANCE', TimeframeValue.DAILY, '2026-08-20T09:15:00', '2026-08-20T15:30:00');
      const asOfTime = istTimeString('2026-08-21T10:00:00'); // Today at 10:00, today's daily is developing

      const latest = MTFCalculator.getLatestConfirmedCandle(
        [candleYesterdayDaily],
        'RELIANCE',
        Timeframe.from(TimeframeValue.DAILY),
        asOfTime,
      );

      expect(latest).toEqual(candleYesterdayDaily);
    });

    it('should not use future candles', () => {
      const candleYesterdayDaily = createClosedCandle('RELIANCE', TimeframeValue.DAILY, '2026-08-20T09:15:00', '2026-08-20T15:30:00');
      const candleTodayDaily = createClosedCandle('RELIANCE', TimeframeValue.DAILY, '2026-08-21T09:15:00', '2026-08-21T15:30:00');
      const asOfTime = istTimeString('2026-08-21T10:00:00'); // Today at 10:00

      const latest = MTFCalculator.getLatestConfirmedCandle(
        [candleYesterdayDaily, candleTodayDaily],
        'RELIANCE',
        Timeframe.from(TimeframeValue.DAILY),
        asOfTime,
      );

      // Today's daily should be available at 10:00 because it's already closed from yesterday perspective
      // But in our test, today's daily has knowledgeTime = today at 15:30, which is in the future at 10:00
      // So only yesterday's daily is available
      expect(latest).toEqual(candleYesterdayDaily);
    });
  });

  describe('MTFSnapshot Structure', () => {
    it('should return all timeframe states', () => {
      const candles = [
        createClosedCandle('RELIANCE', TimeframeValue.FIVE_MIN, '2026-08-21T09:15:00', '2026-08-21T09:20:00'),
        createClosedCandle('RELIANCE', TimeframeValue.FIFTEEN_MIN, '2026-08-21T09:15:00', '2026-08-21T09:30:00'),
      ];
      const asOfTime = istTimeString('2026-08-21T09:30:00');

      const snapshot = MTFCalculator.getMTFSnapshot(candles, asOfTime, 'RELIANCE');

      expect(snapshot.getAllTimeframeStates()).toHaveLength(4); // All 4 timeframes
    });

    it('should correctly report availability', () => {
      const candle5m = createClosedCandle('RELIANCE', TimeframeValue.FIVE_MIN, '2026-08-21T09:15:00', '2026-08-21T09:20:00');
      const asOfTime = istTimeString('2026-08-21T09:20:00');

      const snapshot = MTFCalculator.getMTFSnapshot([candle5m], asOfTime, 'RELIANCE');

      expect(snapshot.getAvailability(TimeframeValue.FIVE_MIN)).toBe(TimeframeAvailability.AVAILABLE);
      expect(snapshot.getAvailability(TimeframeValue.FIFTEEN_MIN)).toBe(TimeframeAvailability.UNAVAILABLE);
    });
  });

  describe('Latest Confirmed Candles Map', () => {
    it('should return map of latest candles for all timeframes', () => {
      const candles = [
        createClosedCandle('RELIANCE', TimeframeValue.FIVE_MIN, '2026-08-21T09:15:00', '2026-08-21T09:20:00'),
        createClosedCandle('RELIANCE', TimeframeValue.FIFTEEN_MIN, '2026-08-21T09:15:00', '2026-08-21T09:30:00'),
        createClosedCandle('RELIANCE', TimeframeValue.SIXTY_MIN, '2026-08-21T09:15:00', '2026-08-21T10:15:00'),
      ];
      const asOfTime = istTimeString('2026-08-21T10:15:00');

      const candleMap = MTFCalculator.getLatestConfirmedCandleForTimeframes(
        candles,
        'RELIANCE',
        asOfTime,
      );

      expect(candleMap.get(TimeframeValue.FIVE_MIN)).toBeDefined();
      expect(candleMap.get(TimeframeValue.FIFTEEN_MIN)).toBeDefined();
      expect(candleMap.get(TimeframeValue.SIXTY_MIN)).toBeDefined();
      expect(candleMap.get(TimeframeValue.DAILY)).toBeNull();
    });
  });
});
