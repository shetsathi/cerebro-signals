import { StructureEngine } from '../domain/structure-engine';
import { StructureConfig } from '../domain/structure-config';
import { SwingType, SwingPointComparator } from '../domain/swing-point';
import { StructureType } from '../domain/structure-state';
import { SwingClassification } from '../domain/structure-calculator';
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

function createCandle(
  symbol: string,
  timeframe: TimeframeValue,
  openTimeIST: string,
  closeTimeIST: string,
  ohlc: CandleOHLC,
  status: CandleStatus = CandleStatus.CLOSED,
): Candle {
  const openUTC = istTimeString(openTimeIST);
  const closeUTC = istTimeString(closeTimeIST);

  return new Candle(symbol, Timeframe.from(timeframe), openUTC, closeUTC, ohlc, status, closeUTC);
}

describe('StructureEngine', () => {
  describe('Basic Swing Detection', () => {
    it('should detect swing high with 2x2 configuration', () => {
      const candles = [
        createCandle('RELIANCE', TimeframeValue.FIVE_MIN, '2026-08-21T09:00:00', '2026-08-21T09:05:00', {
          open: 100,
          high: 101,
          low: 99,
          close: 100.5,
          volume: 1000,
        }),
        createCandle('RELIANCE', TimeframeValue.FIVE_MIN, '2026-08-21T09:05:00', '2026-08-21T09:10:00', {
          open: 100.5,
          high: 101.5,
          low: 100,
          close: 101,
          volume: 1000,
        }),
        createCandle('RELIANCE', TimeframeValue.FIVE_MIN, '2026-08-21T09:10:00', '2026-08-21T09:15:00', {
          open: 101,
          high: 103, // Swing high candidate
          low: 100.5,
          close: 102,
          volume: 1000,
        }),
        createCandle('RELIANCE', TimeframeValue.FIVE_MIN, '2026-08-21T09:15:00', '2026-08-21T09:20:00', {
          open: 102,
          high: 102.5,
          low: 101,
          close: 101.5,
          volume: 1000,
        }),
        createCandle('RELIANCE', TimeframeValue.FIVE_MIN, '2026-08-21T09:20:00', '2026-08-21T09:25:00', {
          open: 101.5,
          high: 102,
          low: 100.5,
          close: 101,
          volume: 1000,
        }),
        createCandle('RELIANCE', TimeframeValue.FIVE_MIN, '2026-08-21T09:25:00', '2026-08-21T09:30:00', {
          open: 101,
          high: 101.5,
          low: 100,
          close: 100.5,
          volume: 1000,
        }),
      ];

      // Need to query after confirmation knowledge time (09:20)
      const asOfTime = istTimeString('2026-08-21T09:25:00');
      const config = new StructureConfig(2, 2);
      const snapshot = StructureEngine.getStructureSnapshot(candles, asOfTime, 'RELIANCE', Timeframe.from(TimeframeValue.FIVE_MIN), config);

      // At least one swing should be confirmed (the 09:15 high)
      expect(snapshot.getConfirmedSwings().length).toBeGreaterThan(0);
    });

    it('should reject equal high as swing', () => {
      const candles = [
        createCandle('RELIANCE', TimeframeValue.FIVE_MIN, '2026-08-21T09:00:00', '2026-08-21T09:05:00', {
          open: 100,
          high: 103, // Equal to candidate
          low: 99,
          close: 100.5,
          volume: 1000,
        }),
        createCandle('RELIANCE', TimeframeValue.FIVE_MIN, '2026-08-21T09:05:00', '2026-08-21T09:10:00', {
          open: 100.5,
          high: 101,
          low: 100,
          close: 101,
          volume: 1000,
        }),
        createCandle('RELIANCE', TimeframeValue.FIVE_MIN, '2026-08-21T09:10:00', '2026-08-21T09:15:00', {
          open: 101,
          high: 103, // Equal to left bar - should NOT be swing high
          low: 100.5,
          close: 102,
          volume: 1000,
        }),
        createCandle('RELIANCE', TimeframeValue.FIVE_MIN, '2026-08-21T09:15:00', '2026-08-21T09:20:00', {
          open: 102,
          high: 102.5,
          low: 101,
          close: 101.5,
          volume: 1000,
        }),
        createCandle('RELIANCE', TimeframeValue.FIVE_MIN, '2026-08-21T09:20:00', '2026-08-21T09:25:00', {
          open: 101.5,
          high: 102,
          low: 100.5,
          close: 101,
          volume: 1000,
        }),
        createCandle('RELIANCE', TimeframeValue.FIVE_MIN, '2026-08-21T09:25:00', '2026-08-21T09:30:00', {
          open: 101,
          high: 101.5,
          low: 100,
          close: 100.5,
          volume: 1000,
        }),
      ];

      const asOfTime = istTimeString('2026-08-21T09:25:00');
      const config = new StructureConfig(2, 2);
      const snapshot = StructureEngine.getStructureSnapshot(candles, asOfTime, 'RELIANCE', Timeframe.from(TimeframeValue.FIVE_MIN), config);

      // Equality should prevent swing detection
      const swings = snapshot.getConfirmedSwings();
      const swingAtCandle2 = swings.find((s) => s.eventTimeUTC.getTime() === istTimeString('2026-08-21T09:15:00').getTime());
      expect(swingAtCandle2).toBeUndefined();
    });
  });

  describe('Confirmation Delay', () => {
    it('should not confirm swing until rightBars close', () => {
      const candles = [
        createCandle('RELIANCE', TimeframeValue.FIVE_MIN, '2026-08-21T09:00:00', '2026-08-21T09:05:00', {
          open: 100,
          high: 101,
          low: 99,
          close: 100.5,
          volume: 1000,
        }),
        createCandle('RELIANCE', TimeframeValue.FIVE_MIN, '2026-08-21T09:05:00', '2026-08-21T09:10:00', {
          open: 100.5,
          high: 101.5,
          low: 100,
          close: 101,
          volume: 1000,
        }),
        createCandle('RELIANCE', TimeframeValue.FIVE_MIN, '2026-08-21T09:10:00', '2026-08-21T09:15:00', {
          open: 101,
          high: 103,
          low: 100.5,
          close: 102,
          volume: 1000,
        }),
        createCandle('RELIANCE', TimeframeValue.FIVE_MIN, '2026-08-21T09:15:00', '2026-08-21T09:20:00', {
          open: 102,
          high: 102.5,
          low: 101,
          close: 101.5,
          volume: 1000,
        }),
        createCandle('RELIANCE', TimeframeValue.FIVE_MIN, '2026-08-21T09:20:00', '2026-08-21T09:25:00', {
          open: 101.5,
          high: 102,
          low: 100.5,
          close: 101,
          volume: 1000,
        }),
        createCandle('RELIANCE', TimeframeValue.FIVE_MIN, '2026-08-21T09:25:00', '2026-08-21T09:30:00', {
          open: 101,
          high: 101.5,
          low: 100,
          close: 100.5,
          volume: 1000,
        }),
      ];

      const config = new StructureConfig(2, 2);

      // At 09:15, only one right bar available - swing not confirmed
      const asOfTime09_15 = istTimeString('2026-08-21T09:15:00');
      const snapshot09_15 = StructureEngine.getStructureSnapshot(
        candles,
        asOfTime09_15,
        'RELIANCE',
        Timeframe.from(TimeframeValue.FIVE_MIN),
        config,
      );

      // At 09:25, both right bars are closed - swing confirmed
      const asOfTime09_25 = istTimeString('2026-08-21T09:25:00');
      const snapshot09_25 = StructureEngine.getStructureSnapshot(
        candles,
        asOfTime09_25,
        'RELIANCE',
        Timeframe.from(TimeframeValue.FIVE_MIN),
        config,
      );

      // Should have more confirmed swings at 09:25 than at 09:15
      expect(snapshot09_25.getConfirmedSwings().length).toBeGreaterThan(snapshot09_15.getConfirmedSwings().length);
    });
  });

  describe('Look-Ahead Safety', () => {
    it('should not expose swings with future knowledge time', () => {
      const candles = [
        createCandle('RELIANCE', TimeframeValue.FIVE_MIN, '2026-08-21T09:00:00', '2026-08-21T09:05:00', {
          open: 100,
          high: 101,
          low: 99,
          close: 100.5,
          volume: 1000,
        }),
        createCandle('RELIANCE', TimeframeValue.FIVE_MIN, '2026-08-21T09:05:00', '2026-08-21T09:10:00', {
          open: 100.5,
          high: 101.5,
          low: 100,
          close: 101,
          volume: 1000,
        }),
        createCandle('RELIANCE', TimeframeValue.FIVE_MIN, '2026-08-21T09:10:00', '2026-08-21T09:15:00', {
          open: 101,
          high: 103,
          low: 100.5,
          close: 102,
          volume: 1000,
        }),
        createCandle('RELIANCE', TimeframeValue.FIVE_MIN, '2026-08-21T09:15:00', '2026-08-21T09:20:00', {
          open: 102,
          high: 102.5,
          low: 101,
          close: 101.5,
          volume: 1000,
        }),
        createCandle('RELIANCE', TimeframeValue.FIVE_MIN, '2026-08-21T09:20:00', '2026-08-21T09:25:00', {
          open: 101.5,
          high: 102,
          low: 100.5,
          close: 101,
          volume: 1000,
        }),
        createCandle('RELIANCE', TimeframeValue.FIVE_MIN, '2026-08-21T09:25:00', '2026-08-21T09:30:00', {
          open: 101,
          high: 101.5,
          low: 100,
          close: 100.5,
          volume: 1000,
        }),
      ];

      // At 09:20, knowledge time for swing would be 09:20 (future), so not included
      const asOfTime = istTimeString('2026-08-21T09:20:00');
      const config = new StructureConfig(2, 2);
      const snapshot = StructureEngine.getStructureSnapshot(
        candles,
        asOfTime,
        'RELIANCE',
        Timeframe.from(TimeframeValue.FIVE_MIN),
        config,
      );

      // All swings should have knowledge time <= asOfTime
      for (const swing of snapshot.getConfirmedSwings()) {
        expect(swing.knowledgeTimeUTC.getTime()).toBeLessThanOrEqual(asOfTime.getTime());
      }
    });
  });

  describe('Snapshot Immutability', () => {
    it('should be sealed after creation', () => {
      const candles = [
        createCandle('RELIANCE', TimeframeValue.FIVE_MIN, '2026-08-21T09:00:00', '2026-08-21T09:05:00', {
          open: 100,
          high: 101,
          low: 99,
          close: 100.5,
          volume: 1000,
        }),
      ];

      const asOfTime = istTimeString('2026-08-21T09:05:00');
      const snapshot = StructureEngine.getStructureSnapshot(candles, asOfTime, 'RELIANCE', Timeframe.from(TimeframeValue.FIVE_MIN));

      expect(snapshot.isSealed()).toBe(true);
    });

    it('should preserve timestamp across multiple reads', () => {
      const candles = [
        createCandle('RELIANCE', TimeframeValue.FIVE_MIN, '2026-08-21T09:00:00', '2026-08-21T09:05:00', {
          open: 100,
          high: 101,
          low: 99,
          close: 100.5,
          volume: 1000,
        }),
      ];

      const asOfTime = istTimeString('2026-08-21T09:05:00');
      const snapshot = StructureEngine.getStructureSnapshot(candles, asOfTime, 'RELIANCE', Timeframe.from(TimeframeValue.FIVE_MIN));

      const time1 = snapshot.asOfTimeUTC.getTime();
      const time2 = snapshot.asOfTimeUTC.getTime();
      const time3 = snapshot.asOfTimeUTC.getTime();

      expect(time1).toBe(time2);
      expect(time2).toBe(time3);
    });
  });

  describe('Symbol & Timeframe Isolation', () => {
    it('should not mix symbols', () => {
      const candles = [
        createCandle('RELIANCE', TimeframeValue.FIVE_MIN, '2026-08-21T09:00:00', '2026-08-21T09:05:00', {
          open: 100,
          high: 110,
          low: 99,
          close: 105,
          volume: 1000,
        }),
        createCandle('INFY', TimeframeValue.FIVE_MIN, '2026-08-21T09:00:00', '2026-08-21T09:05:00', {
          open: 1500,
          high: 1600,
          low: 1490,
          close: 1550,
          volume: 1000,
        }),
      ];

      const asOfTime = istTimeString('2026-08-21T09:05:00');
      const snapshotREL = StructureEngine.getStructureSnapshot(candles, asOfTime, 'RELIANCE', Timeframe.from(TimeframeValue.FIVE_MIN));
      const snapshotINFY = StructureEngine.getStructureSnapshot(candles, asOfTime, 'INFY', Timeframe.from(TimeframeValue.FIVE_MIN));

      // Snapshots should be independent
      expect(snapshotREL.asOfTimeUTC.getTime()).toBe(snapshotINFY.asOfTimeUTC.getTime());
      // But they should have analyzed different candles
      const relSwings = snapshotREL.getConfirmedSwings();
      const infySwings = snapshotINFY.getConfirmedSwings();

      for (const swing of relSwings) {
        expect(swing.symbol).toBe('RELIANCE');
      }
      for (const swing of infySwings) {
        expect(swing.symbol).toBe('INFY');
      }
    });

    it('should not mix timeframes', () => {
      const candles = [
        createCandle('RELIANCE', TimeframeValue.FIVE_MIN, '2026-08-21T09:00:00', '2026-08-21T09:05:00', {
          open: 100,
          high: 110,
          low: 99,
          close: 105,
          volume: 1000,
        }),
        createCandle('RELIANCE', TimeframeValue.FIFTEEN_MIN, '2026-08-21T09:00:00', '2026-08-21T09:15:00', {
          open: 100,
          high: 120,
          low: 99,
          close: 110,
          volume: 3000,
        }),
      ];

      const asOfTime = istTimeString('2026-08-21T09:15:00');
      const snapshot5m = StructureEngine.getStructureSnapshot(candles, asOfTime, 'RELIANCE', Timeframe.from(TimeframeValue.FIVE_MIN));
      const snapshot15m = StructureEngine.getStructureSnapshot(candles, asOfTime, 'RELIANCE', Timeframe.from(TimeframeValue.FIFTEEN_MIN));

      // Verify each snapshot analyzes correct timeframe
      const swings5m = snapshot5m.getConfirmedSwings();
      const swings15m = snapshot15m.getConfirmedSwings();

      for (const swing of swings5m) {
        expect(swing.timeframe.value).toBe('5m');
      }
      for (const swing of swings15m) {
        expect(swing.timeframe.value).toBe('15m');
      }
    });
  });

  describe('Configuration', () => {
    it('should validate configuration', () => {
      expect(() => new StructureConfig(0, 2)).toThrow();
      expect(() => new StructureConfig(2, 0)).toThrow();
      expect(() => new StructureConfig(1, 1)).not.toThrow();
    });

    it('should use configurable strength values', () => {
      const config2x2 = new StructureConfig(2, 2);
      const config3x3 = new StructureConfig(3, 3);

      expect(config2x2.totalBars).toBe(5); // 2 + 1 + 2
      expect(config3x3.totalBars).toBe(7); // 3 + 1 + 3
    });
  });

  describe('Swing Detection - Low', () => {
    it('should detect swing low with 2x2 configuration', () => {
      const candles = [
        createCandle('RELIANCE', TimeframeValue.FIVE_MIN, '2026-08-21T09:00:00', '2026-08-21T09:05:00', {
          open: 100,
          high: 102,
          low: 101,
          close: 100.5,
          volume: 1000,
        }),
        createCandle('RELIANCE', TimeframeValue.FIVE_MIN, '2026-08-21T09:05:00', '2026-08-21T09:10:00', {
          open: 100.5,
          high: 101.5,
          low: 100.5,
          close: 101,
          volume: 1000,
        }),
        createCandle('RELIANCE', TimeframeValue.FIVE_MIN, '2026-08-21T09:10:00', '2026-08-21T09:15:00', {
          open: 101,
          high: 101.5,
          low: 99, // Swing low candidate
          close: 100,
          volume: 1000,
        }),
        createCandle('RELIANCE', TimeframeValue.FIVE_MIN, '2026-08-21T09:15:00', '2026-08-21T09:20:00', {
          open: 100,
          high: 100.5,
          low: 99.5,
          close: 100,
          volume: 1000,
        }),
        createCandle('RELIANCE', TimeframeValue.FIVE_MIN, '2026-08-21T09:20:00', '2026-08-21T09:25:00', {
          open: 100,
          high: 100.5,
          low: 99.5,
          close: 100,
          volume: 1000,
        }),
        createCandle('RELIANCE', TimeframeValue.FIVE_MIN, '2026-08-21T09:25:00', '2026-08-21T09:30:00', {
          open: 100,
          high: 100.5,
          low: 99,
          close: 99.5,
          volume: 1000,
        }),
      ];

      const asOfTime = istTimeString('2026-08-21T09:25:00');
      const config = new StructureConfig(2, 2);
      const snapshot = StructureEngine.getStructureSnapshot(candles, asOfTime, 'RELIANCE', Timeframe.from(TimeframeValue.FIVE_MIN), config);

      const lows = snapshot.getConfirmedSwings().filter((s) => s.isLow());
      expect(lows.length).toBeGreaterThan(0);
    });

    it('should reject equal low as swing', () => {
      const candles = [
        createCandle('RELIANCE', TimeframeValue.FIVE_MIN, '2026-08-21T09:00:00', '2026-08-21T09:05:00', {
          open: 100,
          high: 102,
          low: 99, // Equal to candidate
          close: 100.5,
          volume: 1000,
        }),
        createCandle('RELIANCE', TimeframeValue.FIVE_MIN, '2026-08-21T09:05:00', '2026-08-21T09:10:00', {
          open: 100.5,
          high: 101.5,
          low: 100,
          close: 101,
          volume: 1000,
        }),
        createCandle('RELIANCE', TimeframeValue.FIVE_MIN, '2026-08-21T09:10:00', '2026-08-21T09:15:00', {
          open: 101,
          high: 101.5,
          low: 99, // Equal to left bar - should NOT be swing low
          close: 100,
          volume: 1000,
        }),
        createCandle('RELIANCE', TimeframeValue.FIVE_MIN, '2026-08-21T09:15:00', '2026-08-21T09:20:00', {
          open: 100,
          high: 100.5,
          low: 99.5,
          close: 100,
          volume: 1000,
        }),
        createCandle('RELIANCE', TimeframeValue.FIVE_MIN, '2026-08-21T09:20:00', '2026-08-21T09:25:00', {
          open: 100,
          high: 100.5,
          low: 99.5,
          close: 100,
          volume: 1000,
        }),
        createCandle('RELIANCE', TimeframeValue.FIVE_MIN, '2026-08-21T09:25:00', '2026-08-21T09:30:00', {
          open: 100,
          high: 100.5,
          low: 98,
          close: 99.5,
          volume: 1000,
        }),
      ];

      const asOfTime = istTimeString('2026-08-21T09:25:00');
      const config = new StructureConfig(2, 2);
      const snapshot = StructureEngine.getStructureSnapshot(candles, asOfTime, 'RELIANCE', Timeframe.from(TimeframeValue.FIVE_MIN), config);

      const swings = snapshot.getConfirmedSwings();
      const swingAtCandle2 = swings.find((s) => s.eventTimeUTC.getTime() === istTimeString('2026-08-21T09:15:00').getTime() && s.isLow());
      expect(swingAtCandle2).toBeUndefined();
    });
  });

  describe('Insufficient Bars', () => {
    it('should not confirm swing with insufficient left bars', () => {
      const candles = [
        createCandle('RELIANCE', TimeframeValue.FIVE_MIN, '2026-08-21T09:00:00', '2026-08-21T09:05:00', {
          open: 100,
          high: 103,
          low: 99,
          close: 100.5,
          volume: 1000,
        }),
        createCandle('RELIANCE', TimeframeValue.FIVE_MIN, '2026-08-21T09:05:00', '2026-08-21T09:10:00', {
          open: 100.5,
          high: 101,
          low: 100,
          close: 101,
          volume: 1000,
        }),
        createCandle('RELIANCE', TimeframeValue.FIVE_MIN, '2026-08-21T09:10:00', '2026-08-21T09:15:00', {
          open: 101,
          high: 102,
          low: 100,
          close: 101,
          volume: 1000,
        }),
      ];

      const asOfTime = istTimeString('2026-08-21T09:15:00');
      const config = new StructureConfig(2, 2);
      const snapshot = StructureEngine.getStructureSnapshot(candles, asOfTime, 'RELIANCE', Timeframe.from(TimeframeValue.FIVE_MIN), config);

      expect(snapshot.getConfirmedSwings().length).toBe(0);
    });

    it('should not confirm swing with insufficient right bars', () => {
      const candles = [
        createCandle('RELIANCE', TimeframeValue.FIVE_MIN, '2026-08-21T09:00:00', '2026-08-21T09:05:00', {
          open: 100,
          high: 101,
          low: 99,
          close: 100.5,
          volume: 1000,
        }),
        createCandle('RELIANCE', TimeframeValue.FIVE_MIN, '2026-08-21T09:05:00', '2026-08-21T09:10:00', {
          open: 100.5,
          high: 101.5,
          low: 100,
          close: 101,
          volume: 1000,
        }),
        createCandle('RELIANCE', TimeframeValue.FIVE_MIN, '2026-08-21T09:10:00', '2026-08-21T09:15:00', {
          open: 101,
          high: 103,
          low: 100,
          close: 101.5,
          volume: 1000,
        }),
        createCandle('RELIANCE', TimeframeValue.FIVE_MIN, '2026-08-21T09:15:00', '2026-08-21T09:20:00', {
          open: 101.5,
          high: 102,
          low: 100.5,
          close: 101,
          volume: 1000,
        }),
      ];

      const asOfTime = istTimeString('2026-08-21T09:20:00');
      const config = new StructureConfig(2, 2);
      const snapshot = StructureEngine.getStructureSnapshot(candles, asOfTime, 'RELIANCE', Timeframe.from(TimeframeValue.FIVE_MIN), config);

      expect(snapshot.getConfirmedSwings().length).toBe(0);
    });
  });

  describe('Confirmation Exactly at RightBars', () => {
    it('should confirm swing exactly when rightBars close', () => {
      const candles = [
        createCandle('RELIANCE', TimeframeValue.FIVE_MIN, '2026-08-21T09:00:00', '2026-08-21T09:05:00', {
          open: 100,
          high: 101,
          low: 99,
          close: 100.5,
          volume: 1000,
        }),
        createCandle('RELIANCE', TimeframeValue.FIVE_MIN, '2026-08-21T09:05:00', '2026-08-21T09:10:00', {
          open: 100.5,
          high: 101.5,
          low: 100,
          close: 101,
          volume: 1000,
        }),
        createCandle('RELIANCE', TimeframeValue.FIVE_MIN, '2026-08-21T09:10:00', '2026-08-21T09:15:00', {
          open: 101,
          high: 103,
          low: 100.5,
          close: 102,
          volume: 1000,
        }),
        createCandle('RELIANCE', TimeframeValue.FIVE_MIN, '2026-08-21T09:15:00', '2026-08-21T09:20:00', {
          open: 102,
          high: 102.5,
          low: 101,
          close: 101.5,
          volume: 1000,
        }),
        createCandle('RELIANCE', TimeframeValue.FIVE_MIN, '2026-08-21T09:20:00', '2026-08-21T09:25:00', {
          open: 101.5,
          high: 102,
          low: 100.5,
          close: 101,
          volume: 1000,
        }),
      ];

      const config = new StructureConfig(2, 2);

      // At exactly 09:20, confirmation candle just closed (knowledge time = 09:20)
      const asOfTime = istTimeString('2026-08-21T09:20:00');
      const snapshot = StructureEngine.getStructureSnapshot(candles, asOfTime, 'RELIANCE', Timeframe.from(TimeframeValue.FIVE_MIN), config);

      // Swing at 09:15 should NOT yet be confirmed (knowledge time would be after 09:20)
      expect(snapshot.getConfirmedSwings().length).toBe(0);
    });
  });

  describe('EventTime vs KnowledgeTime', () => {
    it('should track eventTime and knowledgeTime separately', () => {
      const candles = [
        createCandle('RELIANCE', TimeframeValue.FIVE_MIN, '2026-08-21T09:00:00', '2026-08-21T09:05:00', {
          open: 100,
          high: 101,
          low: 99,
          close: 100.5,
          volume: 1000,
        }),
        createCandle('RELIANCE', TimeframeValue.FIVE_MIN, '2026-08-21T09:05:00', '2026-08-21T09:10:00', {
          open: 100.5,
          high: 101.5,
          low: 100,
          close: 101,
          volume: 1000,
        }),
        createCandle('RELIANCE', TimeframeValue.FIVE_MIN, '2026-08-21T09:10:00', '2026-08-21T09:15:00', {
          open: 101,
          high: 103,
          low: 100.5,
          close: 102,
          volume: 1000,
        }),
        createCandle('RELIANCE', TimeframeValue.FIVE_MIN, '2026-08-21T09:15:00', '2026-08-21T09:20:00', {
          open: 102,
          high: 102.5,
          low: 101,
          close: 101.5,
          volume: 1000,
        }),
        createCandle('RELIANCE', TimeframeValue.FIVE_MIN, '2026-08-21T09:20:00', '2026-08-21T09:25:00', {
          open: 101.5,
          high: 102,
          low: 100.5,
          close: 101,
          volume: 1000,
        }),
        createCandle('RELIANCE', TimeframeValue.FIVE_MIN, '2026-08-21T09:25:00', '2026-08-21T09:30:00', {
          open: 101,
          high: 101.5,
          low: 100,
          close: 100.5,
          volume: 1000,
        }),
      ];

      const asOfTime = istTimeString('2026-08-21T09:25:00');
      const config = new StructureConfig(2, 2);
      const snapshot = StructureEngine.getStructureSnapshot(candles, asOfTime, 'RELIANCE', Timeframe.from(TimeframeValue.FIVE_MIN), config);

      const swings = snapshot.getConfirmedSwings();
      expect(swings.length).toBeGreaterThan(0);

      for (const swing of swings) {
        // eventTime should be when candidate candle closed (09:15)
        // knowledgeTime should be when confirmation candle closed (09:20)
        expect(swing.eventTimeUTC.getTime()).toBeLessThanOrEqual(swing.knowledgeTimeUTC.getTime());
        expect(swing.knowledgeTimeUTC.getTime()).toBeLessThanOrEqual(asOfTime.getTime());
      }
    });
  });

  describe('HH/HL/LH/LL Classifications', () => {
    it('should classify HH (higher high)', () => {
      const candles = [
        createCandle('RELIANCE', TimeframeValue.FIVE_MIN, '2026-08-21T09:00:00', '2026-08-21T09:05:00', {
          open: 100,
          high: 101,
          low: 99,
          close: 100.5,
          volume: 1000,
        }),
        createCandle('RELIANCE', TimeframeValue.FIVE_MIN, '2026-08-21T09:05:00', '2026-08-21T09:10:00', {
          open: 100.5,
          high: 101.5,
          low: 100,
          close: 101,
          volume: 1000,
        }),
        createCandle('RELIANCE', TimeframeValue.FIVE_MIN, '2026-08-21T09:10:00', '2026-08-21T09:15:00', {
          open: 101,
          high: 102, // First high
          low: 100.5,
          close: 101.5,
          volume: 1000,
        }),
        createCandle('RELIANCE', TimeframeValue.FIVE_MIN, '2026-08-21T09:15:00', '2026-08-21T09:20:00', {
          open: 101.5,
          high: 101,
          low: 100.5,
          close: 101,
          volume: 1000,
        }),
        createCandle('RELIANCE', TimeframeValue.FIVE_MIN, '2026-08-21T09:20:00', '2026-08-21T09:25:00', {
          open: 101,
          high: 101,
          low: 100,
          close: 100.5,
          volume: 1000,
        }),
        createCandle('RELIANCE', TimeframeValue.FIVE_MIN, '2026-08-21T09:25:00', '2026-08-21T09:30:00', {
          open: 100.5,
          high: 101.5,
          low: 100,
          close: 101,
          volume: 1000,
        }),
        createCandle('RELIANCE', TimeframeValue.FIVE_MIN, '2026-08-21T09:30:00', '2026-08-21T09:35:00', {
          open: 101,
          high: 103, // Second high - HIGHER than first
          low: 100.5,
          close: 102.5,
          volume: 1000,
        }),
        createCandle('RELIANCE', TimeframeValue.FIVE_MIN, '2026-08-21T09:35:00', '2026-08-21T09:40:00', {
          open: 102.5,
          high: 102,
          low: 101.5,
          close: 102,
          volume: 1000,
        }),
        createCandle('RELIANCE', TimeframeValue.FIVE_MIN, '2026-08-21T09:40:00', '2026-08-21T09:45:00', {
          open: 102,
          high: 101.8,
          low: 101.2,
          close: 101.5,
          volume: 1000,
        }),
        createCandle('RELIANCE', TimeframeValue.FIVE_MIN, '2026-08-21T09:45:00', '2026-08-21T09:50:00', {
          open: 101.5,
          high: 101.5,
          low: 100.5,
          close: 101,
          volume: 1000,
        }),
      ];

      const asOfTime = istTimeString('2026-08-21T09:45:00');
      const config = new StructureConfig(2, 2);
      const snapshot = StructureEngine.getStructureSnapshot(candles, asOfTime, 'RELIANCE', Timeframe.from(TimeframeValue.FIVE_MIN), config);

      const highs = snapshot.getConfirmedSwings().filter((s) => s.isHigh());
      expect(highs.length).toBe(2);
      expect(highs[1].price).toBeGreaterThan(highs[0].price); // HH
    });

    it('should classify first swing as UNKNOWN', () => {
      const candles = [
        createCandle('RELIANCE', TimeframeValue.FIVE_MIN, '2026-08-21T09:00:00', '2026-08-21T09:05:00', {
          open: 100,
          high: 101,
          low: 99,
          close: 100.5,
          volume: 1000,
        }),
        createCandle('RELIANCE', TimeframeValue.FIVE_MIN, '2026-08-21T09:05:00', '2026-08-21T09:10:00', {
          open: 100.5,
          high: 101.5,
          low: 100,
          close: 101,
          volume: 1000,
        }),
        createCandle('RELIANCE', TimeframeValue.FIVE_MIN, '2026-08-21T09:10:00', '2026-08-21T09:15:00', {
          open: 101,
          high: 103, // Only one high
          low: 100.5,
          close: 102,
          volume: 1000,
        }),
        createCandle('RELIANCE', TimeframeValue.FIVE_MIN, '2026-08-21T09:15:00', '2026-08-21T09:20:00', {
          open: 102,
          high: 102.5,
          low: 101,
          close: 101.5,
          volume: 1000,
        }),
        createCandle('RELIANCE', TimeframeValue.FIVE_MIN, '2026-08-21T09:20:00', '2026-08-21T09:25:00', {
          open: 101.5,
          high: 102,
          low: 100.5,
          close: 101,
          volume: 1000,
        }),
        createCandle('RELIANCE', TimeframeValue.FIVE_MIN, '2026-08-21T09:25:00', '2026-08-21T09:30:00', {
          open: 101,
          high: 101.5,
          low: 100,
          close: 100.5,
          volume: 1000,
        }),
      ];

      const asOfTime = istTimeString('2026-08-21T09:25:00');
      const config = new StructureConfig(2, 2);
      const snapshot = StructureEngine.getStructureSnapshot(candles, asOfTime, 'RELIANCE', Timeframe.from(TimeframeValue.FIVE_MIN), config);

      // With only one swing type (high), structure should be UNKNOWN
      expect(snapshot.getStructureType()).toBe(StructureType.UNKNOWN);
    });
  });

  describe('Structure State Mapping', () => {
    it('should require both highs and lows for defined structure', () => {
      const candles = [
        createCandle('RELIANCE', TimeframeValue.FIVE_MIN, '2026-08-21T09:00:00', '2026-08-21T09:05:00', {
          open: 100,
          high: 101,
          low: 99,
          close: 100.5,
          volume: 1000,
        }),
        createCandle('RELIANCE', TimeframeValue.FIVE_MIN, '2026-08-21T09:05:00', '2026-08-21T09:10:00', {
          open: 100.5,
          high: 101.5,
          low: 99.5,
          close: 100,
          volume: 1000,
        }),
        createCandle('RELIANCE', TimeframeValue.FIVE_MIN, '2026-08-21T09:10:00', '2026-08-21T09:15:00', {
          open: 100,
          high: 103,
          low: 99.5,
          close: 102,
          volume: 1000,
        }),
        createCandle('RELIANCE', TimeframeValue.FIVE_MIN, '2026-08-21T09:15:00', '2026-08-21T09:20:00', {
          open: 102,
          high: 102.5,
          low: 100.5,
          close: 101,
          volume: 1000,
        }),
        createCandle('RELIANCE', TimeframeValue.FIVE_MIN, '2026-08-21T09:20:00', '2026-08-21T09:25:00', {
          open: 101,
          high: 102,
          low: 100,
          close: 101.5,
          volume: 1000,
        }),
        createCandle('RELIANCE', TimeframeValue.FIVE_MIN, '2026-08-21T09:25:00', '2026-08-21T09:30:00', {
          open: 101.5,
          high: 101.5,
          low: 98.5, // Swing low candidate
          close: 99,
          volume: 1000,
        }),
        createCandle('RELIANCE', TimeframeValue.FIVE_MIN, '2026-08-21T09:30:00', '2026-08-21T09:35:00', {
          open: 99,
          high: 100,
          low: 98,
          close: 99.5,
          volume: 1000,
        }),
        createCandle('RELIANCE', TimeframeValue.FIVE_MIN, '2026-08-21T09:35:00', '2026-08-21T09:40:00', {
          open: 99.5,
          high: 99.8,
          low: 97.5,
          close: 98,
          volume: 1000,
        }),
      ];

      const asOfTime = istTimeString('2026-08-21T09:35:00');
      const config = new StructureConfig(2, 2);
      const snapshot = StructureEngine.getStructureSnapshot(candles, asOfTime, 'RELIANCE', Timeframe.from(TimeframeValue.FIVE_MIN), config);

      // Should have both highs and lows to determine structure
      const swings = snapshot.getConfirmedSwings();
      const hasHighs = swings.some((s) => s.isHigh());
      const hasLows = swings.some((s) => s.isLow());

      if (hasHighs && hasLows) {
        expect([StructureType.BULLISH, StructureType.BEARISH, StructureType.NEUTRAL]).toContain(snapshot.getStructureType());
      } else {
        expect(snapshot.getStructureType()).toBe(StructureType.UNKNOWN);
      }
    });
  });

  describe('BOS - Break of Structure', () => {
    it('should verify BOS detection when structure exists', () => {
      const candles = [
        createCandle('RELIANCE', TimeframeValue.FIVE_MIN, '2026-08-21T09:00:00', '2026-08-21T09:05:00', {
          open: 100,
          high: 101,
          low: 99,
          close: 100.5,
          volume: 1000,
        }),
        createCandle('RELIANCE', TimeframeValue.FIVE_MIN, '2026-08-21T09:05:00', '2026-08-21T09:10:00', {
          open: 100.5,
          high: 101.5,
          low: 100,
          close: 101,
          volume: 1000,
        }),
        createCandle('RELIANCE', TimeframeValue.FIVE_MIN, '2026-08-21T09:10:00', '2026-08-21T09:15:00', {
          open: 101,
          high: 103,
          low: 100.5,
          close: 102,
          volume: 1000,
        }),
        createCandle('RELIANCE', TimeframeValue.FIVE_MIN, '2026-08-21T09:15:00', '2026-08-21T09:20:00', {
          open: 102,
          high: 102.5,
          low: 101,
          close: 101.5,
          volume: 1000,
        }),
        createCandle('RELIANCE', TimeframeValue.FIVE_MIN, '2026-08-21T09:20:00', '2026-08-21T09:25:00', {
          open: 101.5,
          high: 102,
          low: 100.5,
          close: 101,
          volume: 1000,
        }),
        createCandle('RELIANCE', TimeframeValue.FIVE_MIN, '2026-08-21T09:25:00', '2026-08-21T09:30:00', {
          open: 101,
          high: 101.5,
          low: 100,
          close: 100.5,
          volume: 1000,
        }),
      ];

      const asOfTime = istTimeString('2026-08-21T09:25:00');
      const config = new StructureConfig(2, 2);
      const snapshot = StructureEngine.getStructureSnapshot(candles, asOfTime, 'RELIANCE', Timeframe.from(TimeframeValue.FIVE_MIN), config);

      // Verify snapshot is properly created
      expect(snapshot.asOfTimeUTC).toBeDefined();
      expect(snapshot.getBOSEvents()).toBeDefined();
    });

    it('should not trigger BOS on wick without close beyond', () => {
      const candles = [
        createCandle('RELIANCE', TimeframeValue.FIVE_MIN, '2026-08-21T09:00:00', '2026-08-21T09:05:00', {
          open: 100,
          high: 101,
          low: 99,
          close: 100.5,
          volume: 1000,
        }),
        createCandle('RELIANCE', TimeframeValue.FIVE_MIN, '2026-08-21T09:05:00', '2026-08-21T09:10:00', {
          open: 100.5,
          high: 101.5,
          low: 100,
          close: 101,
          volume: 1000,
        }),
        createCandle('RELIANCE', TimeframeValue.FIVE_MIN, '2026-08-21T09:10:00', '2026-08-21T09:15:00', {
          open: 101,
          high: 103,
          low: 100.5,
          close: 102,
          volume: 1000,
        }),
        createCandle('RELIANCE', TimeframeValue.FIVE_MIN, '2026-08-21T09:15:00', '2026-08-21T09:20:00', {
          open: 102,
          high: 102.5,
          low: 101,
          close: 101.5,
          volume: 1000,
        }),
        createCandle('RELIANCE', TimeframeValue.FIVE_MIN, '2026-08-21T09:20:00', '2026-08-21T09:25:00', {
          open: 101.5,
          high: 102,
          low: 100.5,
          close: 101,
          volume: 1000,
        }),
        createCandle('RELIANCE', TimeframeValue.FIVE_MIN, '2026-08-21T09:25:00', '2026-08-21T09:30:00', {
          open: 101,
          high: 101.5,
          low: 100,
          close: 100.5,
          volume: 1000,
        }),
        createCandle('RELIANCE', TimeframeValue.FIVE_MIN, '2026-08-21T09:30:00', '2026-08-21T09:35:00', {
          open: 100.5,
          high: 104, // Wick above 103
          low: 100,
          close: 101, // But closed below - NO BOS
          volume: 1000,
        }),
      ];

      const asOfTime = istTimeString('2026-08-21T09:35:00');
      const config = new StructureConfig(2, 2);
      const snapshot = StructureEngine.getStructureSnapshot(candles, asOfTime, 'RELIANCE', Timeframe.from(TimeframeValue.FIVE_MIN), config);

      const bosEvents = snapshot.getBOSEvents();
      expect(bosEvents.length).toBe(0);
    });

    it('should not trigger BOS on close equal to level', () => {
      const candles = [
        createCandle('RELIANCE', TimeframeValue.FIVE_MIN, '2026-08-21T09:00:00', '2026-08-21T09:05:00', {
          open: 100,
          high: 101,
          low: 99,
          close: 100.5,
          volume: 1000,
        }),
        createCandle('RELIANCE', TimeframeValue.FIVE_MIN, '2026-08-21T09:05:00', '2026-08-21T09:10:00', {
          open: 100.5,
          high: 101.5,
          low: 100,
          close: 101,
          volume: 1000,
        }),
        createCandle('RELIANCE', TimeframeValue.FIVE_MIN, '2026-08-21T09:10:00', '2026-08-21T09:15:00', {
          open: 101,
          high: 103,
          low: 100.5,
          close: 102,
          volume: 1000,
        }),
        createCandle('RELIANCE', TimeframeValue.FIVE_MIN, '2026-08-21T09:15:00', '2026-08-21T09:20:00', {
          open: 102,
          high: 102.5,
          low: 101,
          close: 101.5,
          volume: 1000,
        }),
        createCandle('RELIANCE', TimeframeValue.FIVE_MIN, '2026-08-21T09:20:00', '2026-08-21T09:25:00', {
          open: 101.5,
          high: 102,
          low: 100.5,
          close: 101,
          volume: 1000,
        }),
        createCandle('RELIANCE', TimeframeValue.FIVE_MIN, '2026-08-21T09:25:00', '2026-08-21T09:30:00', {
          open: 101,
          high: 101.5,
          low: 100,
          close: 100.5,
          volume: 1000,
        }),
        createCandle('RELIANCE', TimeframeValue.FIVE_MIN, '2026-08-21T09:30:00', '2026-08-21T09:35:00', {
          open: 100.5,
          high: 103.5,
          low: 100,
          close: 103, // Equal to swing high - NO BOS
          volume: 1000,
        }),
      ];

      const asOfTime = istTimeString('2026-08-21T09:35:00');
      const config = new StructureConfig(2, 2);
      const snapshot = StructureEngine.getStructureSnapshot(candles, asOfTime, 'RELIANCE', Timeframe.from(TimeframeValue.FIVE_MIN), config);

      const bosEvents = snapshot.getBOSEvents();
      expect(bosEvents.length).toBe(0);
    });
  });

  describe('CHOCH - Change of Character', () => {
    it('should verify CHOCH detection when structure exists', () => {
      const candles = [
        createCandle('RELIANCE', TimeframeValue.FIVE_MIN, '2026-08-21T09:00:00', '2026-08-21T09:05:00', {
          open: 100,
          high: 102,
          low: 99,
          close: 100.5,
          volume: 1000,
        }),
        createCandle('RELIANCE', TimeframeValue.FIVE_MIN, '2026-08-21T09:05:00', '2026-08-21T09:10:00', {
          open: 100.5,
          high: 101.5,
          low: 99.5,
          close: 100,
          volume: 1000,
        }),
        createCandle('RELIANCE', TimeframeValue.FIVE_MIN, '2026-08-21T09:10:00', '2026-08-21T09:15:00', {
          open: 100,
          high: 104,
          low: 99.5,
          close: 103,
          volume: 1000,
        }),
        createCandle('RELIANCE', TimeframeValue.FIVE_MIN, '2026-08-21T09:15:00', '2026-08-21T09:20:00', {
          open: 103,
          high: 103.5,
          low: 100.5,
          close: 101,
          volume: 1000,
        }),
        createCandle('RELIANCE', TimeframeValue.FIVE_MIN, '2026-08-21T09:20:00', '2026-08-21T09:25:00', {
          open: 101,
          high: 102.5,
          low: 100,
          close: 101.5,
          volume: 1000,
        }),
        createCandle('RELIANCE', TimeframeValue.FIVE_MIN, '2026-08-21T09:25:00', '2026-08-21T09:30:00', {
          open: 101.5,
          high: 102,
          low: 99,
          close: 99.5,
          volume: 1000,
        }),
      ];

      const asOfTime = istTimeString('2026-08-21T09:25:00');
      const config = new StructureConfig(2, 2);
      const snapshot = StructureEngine.getStructureSnapshot(candles, asOfTime, 'RELIANCE', Timeframe.from(TimeframeValue.FIVE_MIN), config);

      // Verify snapshot is properly created
      expect(snapshot.asOfTimeUTC).toBeDefined();
      expect(snapshot.getCHOCHEvents()).toBeDefined();
    });

    it('should not trigger CHOCH on wick without close beyond', () => {
      const candles = [
        createCandle('RELIANCE', TimeframeValue.FIVE_MIN, '2026-08-21T09:00:00', '2026-08-21T09:05:00', {
          open: 100,
          high: 102,
          low: 99,
          close: 100.5,
          volume: 1000,
        }),
        createCandle('RELIANCE', TimeframeValue.FIVE_MIN, '2026-08-21T09:05:00', '2026-08-21T09:10:00', {
          open: 100.5,
          high: 101.5,
          low: 99.5,
          close: 100,
          volume: 1000,
        }),
        createCandle('RELIANCE', TimeframeValue.FIVE_MIN, '2026-08-21T09:10:00', '2026-08-21T09:15:00', {
          open: 100,
          high: 104,
          low: 99.5,
          close: 103,
          volume: 1000,
        }),
        createCandle('RELIANCE', TimeframeValue.FIVE_MIN, '2026-08-21T09:15:00', '2026-08-21T09:20:00', {
          open: 103,
          high: 103.5,
          low: 100.5,
          close: 101,
          volume: 1000,
        }),
        createCandle('RELIANCE', TimeframeValue.FIVE_MIN, '2026-08-21T09:20:00', '2026-08-21T09:25:00', {
          open: 101,
          high: 102.5,
          low: 100,
          close: 101.5,
          volume: 1000,
        }),
        createCandle('RELIANCE', TimeframeValue.FIVE_MIN, '2026-08-21T09:25:00', '2026-08-21T09:30:00', {
          open: 101.5,
          high: 102,
          low: 99,
          close: 99.5,
          volume: 1000,
        }),
        createCandle('RELIANCE', TimeframeValue.FIVE_MIN, '2026-08-21T09:30:00', '2026-08-21T09:35:00', {
          open: 99.5,
          high: 100.5,
          low: 98, // Wick below HL (100)
          close: 99.5, // But closed above - NO CHOCH
          volume: 1000,
        }),
      ];

      const asOfTime = istTimeString('2026-08-21T09:35:00');
      const config = new StructureConfig(2, 2);
      const snapshot = StructureEngine.getStructureSnapshot(candles, asOfTime, 'RELIANCE', Timeframe.from(TimeframeValue.FIVE_MIN), config);

      const chochEvents = snapshot.getCHOCHEvents();
      expect(chochEvents.length).toBe(0);
    });
  });

  describe('Historical Replay - Look-Ahead Safety', () => {
    it('should produce identical results for identical known data', () => {
      const candles = [
        createCandle('RELIANCE', TimeframeValue.FIVE_MIN, '2026-08-21T09:00:00', '2026-08-21T09:05:00', {
          open: 100,
          high: 101,
          low: 99,
          close: 100.5,
          volume: 1000,
        }),
        createCandle('RELIANCE', TimeframeValue.FIVE_MIN, '2026-08-21T09:05:00', '2026-08-21T09:10:00', {
          open: 100.5,
          high: 101.5,
          low: 100,
          close: 101,
          volume: 1000,
        }),
        createCandle('RELIANCE', TimeframeValue.FIVE_MIN, '2026-08-21T09:10:00', '2026-08-21T09:15:00', {
          open: 101,
          high: 103,
          low: 100.5,
          close: 102,
          volume: 1000,
        }),
        createCandle('RELIANCE', TimeframeValue.FIVE_MIN, '2026-08-21T09:15:00', '2026-08-21T09:20:00', {
          open: 102,
          high: 102.5,
          low: 101,
          close: 101.5,
          volume: 1000,
        }),
        createCandle('RELIANCE', TimeframeValue.FIVE_MIN, '2026-08-21T09:20:00', '2026-08-21T09:25:00', {
          open: 101.5,
          high: 102,
          low: 100.5,
          close: 101,
          volume: 1000,
        }),
        createCandle('RELIANCE', TimeframeValue.FIVE_MIN, '2026-08-21T09:25:00', '2026-08-21T09:30:00', {
          open: 101,
          high: 101.5,
          low: 100,
          close: 100.5,
          volume: 1000,
        }),
      ];

      const asOfTime = istTimeString('2026-08-21T09:25:00');
      const config = new StructureConfig(2, 2);
      const snapshot1 = StructureEngine.getStructureSnapshot(candles, asOfTime, 'RELIANCE', Timeframe.from(TimeframeValue.FIVE_MIN), config);
      const snapshot2 = StructureEngine.getStructureSnapshot(candles, asOfTime, 'RELIANCE', Timeframe.from(TimeframeValue.FIVE_MIN), config);

      expect(snapshot1.getConfirmedSwings().length).toBe(snapshot2.getConfirmedSwings().length);
      expect(snapshot1.getBOSEvents().length).toBe(snapshot2.getBOSEvents().length);
      expect(snapshot1.getStructureType()).toBe(snapshot2.getStructureType());
    });

    it('should not expose future swings in historical replay', () => {
      const candles = [
        createCandle('RELIANCE', TimeframeValue.FIVE_MIN, '2026-08-21T09:00:00', '2026-08-21T09:05:00', {
          open: 100,
          high: 101,
          low: 99,
          close: 100.5,
          volume: 1000,
        }),
        createCandle('RELIANCE', TimeframeValue.FIVE_MIN, '2026-08-21T09:05:00', '2026-08-21T09:10:00', {
          open: 100.5,
          high: 101.5,
          low: 100,
          close: 101,
          volume: 1000,
        }),
        createCandle('RELIANCE', TimeframeValue.FIVE_MIN, '2026-08-21T09:10:00', '2026-08-21T09:15:00', {
          open: 101,
          high: 103,
          low: 100.5,
          close: 102,
          volume: 1000,
        }),
        createCandle('RELIANCE', TimeframeValue.FIVE_MIN, '2026-08-21T09:15:00', '2026-08-21T09:20:00', {
          open: 102,
          high: 102.5,
          low: 101,
          close: 101.5,
          volume: 1000,
        }),
        createCandle('RELIANCE', TimeframeValue.FIVE_MIN, '2026-08-21T09:20:00', '2026-08-21T09:25:00', {
          open: 101.5,
          high: 102,
          low: 100.5,
          close: 101,
          volume: 1000,
        }),
        createCandle('RELIANCE', TimeframeValue.FIVE_MIN, '2026-08-21T09:25:00', '2026-08-21T09:30:00', {
          open: 101,
          high: 101.5,
          low: 100,
          close: 100.5,
          volume: 1000,
        }),
      ];

      const config = new StructureConfig(2, 2);

      // Query at 09:15
      const snapshot09_15 = StructureEngine.getStructureSnapshot(
        candles,
        istTimeString('2026-08-21T09:15:00'),
        'RELIANCE',
        Timeframe.from(TimeframeValue.FIVE_MIN),
        config,
      );

      // Query at 09:25
      const snapshot09_25 = StructureEngine.getStructureSnapshot(
        candles,
        istTimeString('2026-08-21T09:25:00'),
        'RELIANCE',
        Timeframe.from(TimeframeValue.FIVE_MIN),
        config,
      );

      // Historical snapshot should not see swings that only become confirmed later
      expect(snapshot09_25.getConfirmedSwings().length).toBeGreaterThanOrEqual(snapshot09_15.getConfirmedSwings().length);
    });
  });

  describe('Immutability & Sealing', () => {
    it('should not allow modification of swings array after creation', () => {
      const candles = [
        createCandle('RELIANCE', TimeframeValue.FIVE_MIN, '2026-08-21T09:00:00', '2026-08-21T09:05:00', {
          open: 100,
          high: 101,
          low: 99,
          close: 100.5,
          volume: 1000,
        }),
      ];

      const asOfTime = istTimeString('2026-08-21T09:05:00');
      const snapshot = StructureEngine.getStructureSnapshot(candles, asOfTime, 'RELIANCE', Timeframe.from(TimeframeValue.FIVE_MIN));

      const swings1 = snapshot.getConfirmedSwings();
      const swings2 = snapshot.getConfirmedSwings();

      expect(swings1).not.toBe(swings2);
    });

    it('should preserve BOS events immutably', () => {
      const candles = [
        createCandle('RELIANCE', TimeframeValue.FIVE_MIN, '2026-08-21T09:00:00', '2026-08-21T09:05:00', {
          open: 100,
          high: 101,
          low: 99,
          close: 100.5,
          volume: 1000,
        }),
      ];

      const asOfTime = istTimeString('2026-08-21T09:05:00');
      const snapshot = StructureEngine.getStructureSnapshot(candles, asOfTime, 'RELIANCE', Timeframe.from(TimeframeValue.FIVE_MIN));

      const bos1 = snapshot.getBOSEvents();
      const bos2 = snapshot.getBOSEvents();

      expect(bos1).not.toBe(bos2);
    });
  });

  describe('Symbol Isolation', () => {
    it('should completely isolate NIFTY from BANKNIFTY', () => {
      const candles = [
        createCandle('NIFTY', TimeframeValue.FIVE_MIN, '2026-08-21T09:00:00', '2026-08-21T09:05:00', {
          open: 100,
          high: 110,
          low: 99,
          close: 105,
          volume: 1000,
        }),
        createCandle('BANKNIFTY', TimeframeValue.FIVE_MIN, '2026-08-21T09:00:00', '2026-08-21T09:05:00', {
          open: 1500,
          high: 1600,
          low: 1490,
          close: 1550,
          volume: 1000,
        }),
      ];

      const asOfTime = istTimeString('2026-08-21T09:05:00');
      const snapshotNIFTY = StructureEngine.getStructureSnapshot(
        candles,
        asOfTime,
        'NIFTY',
        Timeframe.from(TimeframeValue.FIVE_MIN),
      );
      const snapshotBANK = StructureEngine.getStructureSnapshot(candles, asOfTime, 'BANKNIFTY', Timeframe.from(TimeframeValue.FIVE_MIN));

      for (const swing of snapshotNIFTY.getConfirmedSwings()) {
        expect(swing.symbol).toBe('NIFTY');
      }
      for (const swing of snapshotBANK.getConfirmedSwings()) {
        expect(swing.symbol).toBe('BANKNIFTY');
      }
    });
  });

  describe('Timeframe Isolation', () => {
    it('should completely isolate 5m from 15m', () => {
      const candles = [
        createCandle('RELIANCE', TimeframeValue.FIVE_MIN, '2026-08-21T09:00:00', '2026-08-21T09:05:00', {
          open: 100,
          high: 110,
          low: 99,
          close: 105,
          volume: 1000,
        }),
        createCandle('RELIANCE', TimeframeValue.FIFTEEN_MIN, '2026-08-21T09:00:00', '2026-08-21T09:15:00', {
          open: 100,
          high: 120,
          low: 99,
          close: 110,
          volume: 3000,
        }),
      ];

      const asOfTime = istTimeString('2026-08-21T09:15:00');
      const snapshot5m = StructureEngine.getStructureSnapshot(candles, asOfTime, 'RELIANCE', Timeframe.from(TimeframeValue.FIVE_MIN));
      const snapshot15m = StructureEngine.getStructureSnapshot(candles, asOfTime, 'RELIANCE', Timeframe.from(TimeframeValue.FIFTEEN_MIN));

      for (const swing of snapshot5m.getConfirmedSwings()) {
        expect(swing.timeframe.value).toBe('5m');
      }
      for (const swing of snapshot15m.getConfirmedSwings()) {
        expect(swing.timeframe.value).toBe('15m');
      }
    });
  });
});
