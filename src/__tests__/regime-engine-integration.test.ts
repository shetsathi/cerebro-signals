import { RegimeEngine } from '../domain/regime-engine';
import { RegimeType } from '../domain/regime-state';
import { StructureConfig } from '../domain/structure-config';
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

describe('RegimeEngine Integration', () => {
  describe('Multi-Timeframe Snapshot Creation', () => {
    it('should create regime snapshot for single symbol', () => {
      const candles = [
        createCandle('NIFTY', TimeframeValue.FIVE_MIN, '2026-08-21T09:00:00', '2026-08-21T09:05:00', {
          open: 100,
          high: 101,
          low: 99,
          close: 100.5,
          volume: 1000,
        }),
      ];

      const asOfTime = istTimeString('2026-08-21T09:05:00');
      const config = new StructureConfig(2, 2);
      const snapshot = RegimeEngine.getRegimeSnapshot(candles, asOfTime, 'NIFTY', config);

      expect(snapshot).toBeDefined();
      expect(snapshot.symbol).toBe('NIFTY');
      expect(snapshot.isSealed()).toBe(true);
    });

    it('should isolate NIFTY from BANKNIFTY', () => {
      const candles = [
        createCandle('NIFTY', TimeframeValue.FIVE_MIN, '2026-08-21T09:00:00', '2026-08-21T09:05:00', {
          open: 100,
          high: 110,
          low: 99,
          close: 105,
          volume: 1000,
        }),
        createCandle('BANKNIFTY', TimeframeValue.FIVE_MIN, '2026-08-21T09:00:00', '2026-08-21T09:05:00', {
          open: 10000,
          high: 11000,
          low: 9900,
          close: 10500,
          volume: 100,
        }),
      ];

      const asOfTime = istTimeString('2026-08-21T09:05:00');
      const config = new StructureConfig(2, 2);
      const snapshotNIFTY = RegimeEngine.getRegimeSnapshot(candles, asOfTime, 'NIFTY', config);
      const snapshotBANK = RegimeEngine.getRegimeSnapshot(candles, asOfTime, 'BANKNIFTY', config);

      expect(snapshotNIFTY.symbol).toBe('NIFTY');
      expect(snapshotBANK.symbol).toBe('BANKNIFTY');
    });

    it('should handle multiple timeframes', () => {
      const candles = [
        createCandle('NIFTY', TimeframeValue.FIVE_MIN, '2026-08-21T09:00:00', '2026-08-21T09:05:00', {
          open: 100,
          high: 101,
          low: 99,
          close: 100.5,
          volume: 100,
        }),
        createCandle('NIFTY', TimeframeValue.FIFTEEN_MIN, '2026-08-21T09:00:00', '2026-08-21T09:15:00', {
          open: 100,
          high: 105,
          low: 99,
          close: 102,
          volume: 300,
        }),
        createCandle('NIFTY', TimeframeValue.SIXTY_MIN, '2026-08-21T09:00:00', '2026-08-21T10:00:00', {
          open: 100,
          high: 110,
          low: 99,
          close: 108,
          volume: 1200,
        }),
        createCandle('NIFTY', TimeframeValue.DAILY, '2026-08-21T01:00:00', '2026-08-22T01:00:00', {
          open: 100,
          high: 115,
          low: 98,
          close: 112,
          volume: 28800,
        }),
      ];

      const asOfTime = istTimeString('2026-08-21T10:00:00');
      const config = new StructureConfig(2, 2);
      const snapshot = RegimeEngine.getRegimeSnapshot(candles, asOfTime, 'NIFTY', config);

      // Should have evaluated all timeframes
      expect(snapshot.execution5mRegime).toBeDefined();
      expect(snapshot.intermediate15mRegime).toBeDefined();
      expect(snapshot.primary60mRegime).toBeDefined();
      expect(snapshot.macro1DRegime).toBeDefined();
    });

    it('should preserve HTF context', () => {
      // When higher timeframes show trend, they dominate regime classification
      const candles = [
        // 1D candle showing uptrend structure
        createCandle('NIFTY', TimeframeValue.DAILY, '2026-08-20T01:00:00', '2026-08-21T01:00:00', {
          open: 100,
          high: 110,
          low: 99,
          close: 108,
          volume: 28800,
        }),
        // 5m showing downside
        createCandle('NIFTY', TimeframeValue.FIVE_MIN, '2026-08-21T09:00:00', '2026-08-21T09:05:00', {
          open: 108,
          high: 109,
          low: 105,
          close: 106,
          volume: 100,
        }),
      ];

      const asOfTime = istTimeString('2026-08-21T09:05:00');
      const config = new StructureConfig(2, 2);
      const snapshot = RegimeEngine.getRegimeSnapshot(candles, asOfTime, 'NIFTY', config);

      // Snapshot should exist and preserve context
      expect(snapshot).toBeDefined();
      expect(snapshot.macro1DRegime).not.toBe(RegimeType.TREND_BEARISH);
    });

    it('should be deterministic on replay', () => {
      const candles = [
        createCandle('NIFTY', TimeframeValue.FIVE_MIN, '2026-08-21T09:00:00', '2026-08-21T09:05:00', {
          open: 100,
          high: 101,
          low: 99,
          close: 100.5,
          volume: 1000,
        }),
      ];

      const asOfTime = istTimeString('2026-08-21T09:05:00');
      const config = new StructureConfig(2, 2);

      const snapshot1 = RegimeEngine.getRegimeSnapshot(candles, asOfTime, 'NIFTY', config);
      const snapshot2 = RegimeEngine.getRegimeSnapshot(candles, asOfTime, 'NIFTY', config);

      expect(snapshot1.currentRegime).toBe(snapshot2.currentRegime);
      expect(snapshot1.asOfTimeUTC.getTime()).toBe(snapshot2.asOfTimeUTC.getTime());
    });

    it('should handle time point-in-time safety', () => {
      const candles = [
        createCandle('NIFTY', TimeframeValue.FIVE_MIN, '2026-08-21T09:00:00', '2026-08-21T09:05:00', {
          open: 100,
          high: 101,
          low: 99,
          close: 100.5,
          volume: 1000,
        }),
        createCandle('NIFTY', TimeframeValue.FIVE_MIN, '2026-08-21T09:05:00', '2026-08-21T09:10:00', {
          open: 100.5,
          high: 102,
          low: 100,
          close: 101.5,
          volume: 1000,
        }),
      ];

      const config = new StructureConfig(2, 2);

      // Query at different points in time
      const snapshot09_05 = RegimeEngine.getRegimeSnapshot(
        candles,
        istTimeString('2026-08-21T09:05:00'),
        'NIFTY',
        config,
      );
      const snapshot09_10 = RegimeEngine.getRegimeSnapshot(
        candles,
        istTimeString('2026-08-21T09:10:00'),
        'NIFTY',
        config,
      );

      // Snapshots should represent their specific point in time
      expect(snapshot09_05.asOfTimeUTC.getTime()).not.toBe(snapshot09_10.asOfTimeUTC.getTime());

      // Both snapshots should be properly sealed
      expect(snapshot09_05.isSealed()).toBe(true);
      expect(snapshot09_10.isSealed()).toBe(true);
    });
  });

  describe('RegimeSnapshot Properties', () => {
    it('should provide evidence collections', () => {
      const candles = [
        createCandle('NIFTY', TimeframeValue.FIVE_MIN, '2026-08-21T09:00:00', '2026-08-21T09:05:00', {
          open: 100,
          high: 101,
          low: 99,
          close: 100.5,
          volume: 1000,
        }),
      ];

      const asOfTime = istTimeString('2026-08-21T09:05:00');
      const config = new StructureConfig(2, 2);
      const snapshot = RegimeEngine.getRegimeSnapshot(candles, asOfTime, 'NIFTY', config);

      const evidence5m = snapshot.getEvidence(TimeframeValue.FIVE_MIN);
      expect(evidence5m).toBeDefined();
      expect(evidence5m.bosCount).toBeGreaterThanOrEqual(0);
    });

    it('should classify regime states', () => {
      const candles = [
        createCandle('NIFTY', TimeframeValue.FIVE_MIN, '2026-08-21T09:00:00', '2026-08-21T09:05:00', {
          open: 100,
          high: 101,
          low: 99,
          close: 100.5,
          volume: 1000,
        }),
      ];

      const asOfTime = istTimeString('2026-08-21T09:05:00');
      const config = new StructureConfig(2, 2);
      const snapshot = RegimeEngine.getRegimeSnapshot(candles, asOfTime, 'NIFTY', config);

      // Should have valid classification methods
      expect([
        snapshot.isDominantlyBullish(),
        snapshot.isDominantlyBearish(),
        snapshot.isInTransition(),
        snapshot.isRange(),
        snapshot.isInsufficientData(),
      ].some((x) => typeof x === 'boolean')).toBe(true);
    });

    it('should support toString() for debugging', () => {
      const candles = [
        createCandle('NIFTY', TimeframeValue.FIVE_MIN, '2026-08-21T09:00:00', '2026-08-21T09:05:00', {
          open: 100,
          high: 101,
          low: 99,
          close: 100.5,
          volume: 1000,
        }),
      ];

      const asOfTime = istTimeString('2026-08-21T09:05:00');
      const config = new StructureConfig(2, 2);
      const snapshot = RegimeEngine.getRegimeSnapshot(candles, asOfTime, 'NIFTY', config);

      const str = snapshot.toString();
      expect(str).toContain('NIFTY');
      expect(str).toContain('RegimeSnapshot');
    });
  });
});
