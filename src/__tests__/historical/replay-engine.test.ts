import { ReplayEngine, ReplayConfig } from '../../historical/replay-engine';
import { Candle, CandleStatus } from '../../domain/candle';
import { Timeframe, TimeframeValue } from '../../domain/timeframe';

describe('Historical Data — Replay Engine', () => {
  const createCandle = (
    symbol: string,
    timeframeValue: TimeframeValue,
    openTime: Date,
    closeTime: Date,
  ): Candle => {
    return new Candle(
      symbol,
      Timeframe.from(timeframeValue),
      openTime,
      closeTime,
      { open: 100, high: 105, low: 95, close: 102, volume: 1000 },
      CandleStatus.CLOSED,
      closeTime,
    );
  };

  describe('Replay Configuration Validation', () => {
    it('should accept valid config', () => {
      const config: ReplayConfig = {
        symbol: 'NIFTY',
        timeframes: ['5m'],
        startDateUTC: new Date('2024-01-15T09:00:00Z'),
        endDateUTC: new Date('2024-01-15T15:00:00Z'),
      };

      const result = ReplayEngine.validateConfig(config);

      expect(result.valid).toBe(true);
      expect(result.errors.length).toBe(0);
    });

    it('should reject missing symbol', () => {
      const config: ReplayConfig = {
        symbol: '',
        timeframes: ['5m'],
        startDateUTC: new Date('2024-01-15T09:00:00Z'),
        endDateUTC: new Date('2024-01-15T15:00:00Z'),
      };

      const result = ReplayEngine.validateConfig(config);

      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.includes('symbol'))).toBe(true);
    });

    it('should reject invalid date range', () => {
      const config: ReplayConfig = {
        symbol: 'NIFTY',
        timeframes: ['5m'],
        startDateUTC: new Date('2024-01-15T15:00:00Z'),
        endDateUTC: new Date('2024-01-15T09:00:00Z'), // reversed
      };

      const result = ReplayEngine.validateConfig(config);

      expect(result.valid).toBe(false);
    });
  });

  describe('Deterministic Replay', () => {
    it('should replay candles in chronological order', async () => {
      const config: ReplayConfig = {
        symbol: 'NIFTY',
        timeframes: ['5m'],
        startDateUTC: new Date('2024-01-15T09:00:00Z'),
        endDateUTC: new Date('2024-01-15T15:00:00Z'),
      };

      const candles = [
        createCandle('NIFTY', TimeframeValue.FIVE_MIN, new Date('2024-01-15T09:15:00Z'), new Date('2024-01-15T09:20:00Z')),
        createCandle('NIFTY', TimeframeValue.FIVE_MIN, new Date('2024-01-15T09:20:00Z'), new Date('2024-01-15T09:25:00Z')),
        createCandle('NIFTY', TimeframeValue.FIVE_MIN, new Date('2024-01-15T09:25:00Z'), new Date('2024-01-15T09:30:00Z')),
      ];

      const events = [];
      for await (const event of ReplayEngine.replay(candles, config)) {
        events.push(event);
      }

      expect(events.length).toBe(3);
      expect(events[0].asOfTimeUTC.getTime()).toBeLessThanOrEqual(events[1].asOfTimeUTC.getTime());
      expect(events[1].asOfTimeUTC.getTime()).toBeLessThanOrEqual(events[2].asOfTimeUTC.getTime());
    });

    it('should filter by symbol', async () => {
      const config: ReplayConfig = {
        symbol: 'NIFTY',
        timeframes: ['5m'],
        startDateUTC: new Date('2024-01-15T09:00:00Z'),
        endDateUTC: new Date('2024-01-15T15:00:00Z'),
      };

      const candles = [
        createCandle('NIFTY', TimeframeValue.FIVE_MIN, new Date('2024-01-15T09:15:00Z'), new Date('2024-01-15T09:20:00Z')),
        createCandle('BANKNIFTY', TimeframeValue.FIVE_MIN, new Date('2024-01-15T09:15:00Z'), new Date('2024-01-15T09:20:00Z')),
        createCandle('NIFTY', TimeframeValue.FIVE_MIN, new Date('2024-01-15T09:20:00Z'), new Date('2024-01-15T09:25:00Z')),
      ];

      const events = [];
      for await (const event of ReplayEngine.replay(candles, config)) {
        events.push(event);
      }

      expect(events.length).toBe(2);
      expect(events.every(e => e.symbol === 'NIFTY')).toBe(true);
    });

    it('should filter by timeframe', async () => {
      const config: ReplayConfig = {
        symbol: 'NIFTY',
        timeframes: ['5m'], // only 5m, not 15m
        startDateUTC: new Date('2024-01-15T09:00:00Z'),
        endDateUTC: new Date('2024-01-15T15:00:00Z'),
      };

      const candles = [
        createCandle('NIFTY', TimeframeValue.FIVE_MIN, new Date('2024-01-15T09:15:00Z'), new Date('2024-01-15T09:20:00Z')),
        createCandle('NIFTY', TimeframeValue.FIFTEEN_MIN, new Date('2024-01-15T09:15:00Z'), new Date('2024-01-15T09:30:00Z')),
      ];

      const events = [];
      for await (const event of ReplayEngine.replay(candles, config)) {
        events.push(event);
      }

      expect(events.length).toBe(1);
      expect(events[0].timeframe).toBe('5m');
    });

    it('should filter by date range', async () => {
      const config: ReplayConfig = {
        symbol: 'NIFTY',
        timeframes: ['5m'],
        startDateUTC: new Date('2024-01-15T09:20:00Z'),
        endDateUTC: new Date('2024-01-15T09:30:00Z'),
      };

      const candles = [
        createCandle('NIFTY', TimeframeValue.FIVE_MIN, new Date('2024-01-15T09:15:00Z'), new Date('2024-01-15T09:20:00Z')), // closeTime=09:20 (included)
        createCandle('NIFTY', TimeframeValue.FIVE_MIN, new Date('2024-01-15T09:20:00Z'), new Date('2024-01-15T09:25:00Z')), // closeTime=09:25 (included)
        createCandle('NIFTY', TimeframeValue.FIVE_MIN, new Date('2024-01-15T09:25:00Z'), new Date('2024-01-15T09:30:00Z')), // closeTime=09:30 (included)
        createCandle('NIFTY', TimeframeValue.FIVE_MIN, new Date('2024-01-15T09:30:00Z'), new Date('2024-01-15T09:35:00Z')), // closeTime=09:35 (excluded)
      ];

      const events = [];
      for await (const event of ReplayEngine.replay(candles, config)) {
        events.push(event);
      }

      expect(events.length).toBe(3); // all candles with closeTime >= 09:20 and <= 09:30
    });
  });

  describe('Determinism Verification', () => {
    it('should verify replay is deterministic', async () => {
      const config: ReplayConfig = {
        symbol: 'NIFTY',
        timeframes: ['5m'],
        startDateUTC: new Date('2024-01-15T09:00:00Z'),
        endDateUTC: new Date('2024-01-15T15:00:00Z'),
      };

      const candles = [
        createCandle('NIFTY', TimeframeValue.FIVE_MIN, new Date('2024-01-15T09:15:00Z'), new Date('2024-01-15T09:20:00Z')),
        createCandle('NIFTY', TimeframeValue.FIVE_MIN, new Date('2024-01-15T09:20:00Z'), new Date('2024-01-15T09:25:00Z')),
      ];

      const result = await ReplayEngine.verifyDeterminism(candles, config);

      expect(result.deterministic).toBe(true);
      expect(result.run1Count).toBe(result.run2Count);
    });
  });

  describe('Expected Candle Count', () => {
    it('should calculate expected 5m candle count', () => {
      const start = new Date('2024-01-15T09:15:00Z');
      const end = new Date('2024-01-15T09:35:00Z'); // 20 minutes
      const count = ReplayEngine.expectedCandleCount(start, end, 5);
      expect(count).toBe(4); // 5m, 10m, 15m, 20m
    });

    it('should calculate expected 60m candle count', () => {
      const start = new Date('2024-01-15T09:15:00Z');
      const end = new Date('2024-01-15T12:15:00Z'); // 3 hours
      const count = ReplayEngine.expectedCandleCount(start, end, 60);
      expect(count).toBe(3);
    });
  });
});
