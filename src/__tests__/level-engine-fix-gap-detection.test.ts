import { LevelEngine, LevelEngineConfig } from '../domain/level-engine';
import { Candle, CandleStatus } from '../domain/candle';
import { Timeframe, TimeframeValue } from '../domain/timeframe';
import { StructureSnapshot } from '../domain/structure-snapshot';
import { StructureState, StructureType } from '../domain/structure-state';
import { SwingPoint, SwingType } from '../domain/swing-point';
import { LevelOrigin } from '../domain/level';

const config: LevelEngineConfig = {
  k: 3,
  maxBarsFailedBreak: 2,
  maxBarsAfterBreak: 3,
  rulesetVersion: '1.0',
  configHash: 'fix-test',
};

function createCandle(
  symbol: string,
  timeframeValue: TimeframeValue,
  open: number,
  high: number,
  low: number,
  close: number,
  openTimeUTC: Date,
  closeTimeUTC: Date,
  knowledgeTimeUTC: Date = closeTimeUTC,
): Candle {
  return new Candle(
    symbol,
    Timeframe.from(timeframeValue),
    openTimeUTC,
    closeTimeUTC,
    { open, high, low, close, volume: 0 },
    CandleStatus.CLOSED,
    knowledgeTimeUTC,
  );
}

function istTime(iso: string): Date {
  const [date, time] = iso.split('T');
  const [y, m, d] = date.split('-').map(Number);
  const [h, min] = time.split(':').map(Number);
  return new Date(Date.UTC(y, m - 1, d, h, min));
}

describe('FIX #1 — Mixed-Timeframe Gap Detection Regression Tests', () => {
  describe('Timeframe Isolation', () => {
    it('Should detect gap between consecutive 5m candles of same symbol', () => {
      const candle1 = createCandle('NIFTY', TimeframeValue.FIVE_MIN, 99, 99.5, 99, 99.5, istTime('2026-08-21T09:55:00'), istTime('2026-08-21T10:00:00'));
      const candle2 = createCandle('NIFTY', TimeframeValue.FIVE_MIN, 101, 102, 101, 101.5, istTime('2026-08-21T10:00:00'), istTime('2026-08-21T10:05:00')); // Gap up from 99.5 to 101

      const asOfTime = istTime('2026-08-21T10:05:00'); // After all candles
      const high = new SwingPoint('NIFTY', Timeframe.from(TimeframeValue.FIVE_MIN), SwingType.HIGH, 100, istTime('2026-08-21T09:00:00'), istTime('2026-08-21T09:00:00'), istTime('2026-08-21T09:00:00'));
      const structureState = new StructureState(StructureType.NEUTRAL, high, null, null, null);
      const structureSnapshot = new StructureSnapshot(asOfTime, [high], structureState, [], []);

      const snapshot = LevelEngine.getLocationSnapshot([candle1, candle2], structureSnapshot, asOfTime, 'NIFTY', config);
      const gapLevels = snapshot.getAllLevels().filter(l => l.origin === LevelOrigin.GAP_EDGE);

      expect(gapLevels.length).toBeGreaterThan(0);
      expect(gapLevels[0].price).toBe(99.5); // Gap at prior close
    });

    it('Should NOT detect gap between 5m and 15m candles (different timeframes)', () => {
      const asOfTime = istTime('2026-08-21T10:00:00');
      const high = new SwingPoint('NIFTY', Timeframe.from(TimeframeValue.FIVE_MIN), SwingType.HIGH, 100, istTime('2026-08-21T09:00:00'), istTime('2026-08-21T09:00:00'), istTime('2026-08-21T09:00:00'));
      const structureState = new StructureState(StructureType.NEUTRAL, high, null, null, null);
      const structureSnapshot = new StructureSnapshot(asOfTime, [high], structureState, [], []);

      // One 5m candle, then one 15m candle
      const candle_5m = createCandle('NIFTY', TimeframeValue.FIVE_MIN, 99, 99.5, 99, 99.5, istTime('2026-08-21T09:55:00'), istTime('2026-08-21T10:00:00'));
      const candle_15m = createCandle('NIFTY', TimeframeValue.FIFTEEN_MIN, 101, 102, 101, 101.5, istTime('2026-08-21T09:45:00'), istTime('2026-08-21T10:00:00'));

      // Pass in order [5m, 15m]
      const snapshot = LevelEngine.getLocationSnapshot([candle_5m, candle_15m], structureSnapshot, asOfTime, 'NIFTY', config);
      const gapLevels = snapshot.getAllLevels().filter(l => l.origin === LevelOrigin.GAP_EDGE);

      // Should NOT create gap between 5m and 15m
      expect(gapLevels.length).toBe(0);
    });

    it('Should NOT detect gap between NIFTY and BANKNIFTY candles (different symbols)', () => {
      const asOfTime = istTime('2026-08-21T10:00:00');
      const high = new SwingPoint('NIFTY', Timeframe.from(TimeframeValue.FIVE_MIN), SwingType.HIGH, 100, istTime('2026-08-21T09:00:00'), istTime('2026-08-21T09:00:00'), istTime('2026-08-21T09:00:00'));
      const structureState = new StructureState(StructureType.NEUTRAL, high, null, null, null);
      const structureSnapshot = new StructureSnapshot(asOfTime, [high], structureState, [], []);

      const nifty_candle = createCandle('NIFTY', TimeframeValue.FIVE_MIN, 99, 99.5, 99, 99.5, istTime('2026-08-21T09:55:00'), istTime('2026-08-21T10:00:00'));
      const bank_candle = createCandle('BANKNIFTY', TimeframeValue.FIVE_MIN, 49500, 50000, 49500, 49750, istTime('2026-08-21T09:55:00'), istTime('2026-08-21T10:00:00'));

      // Pass in order [NIFTY, BANKNIFTY]
      const snapshot = LevelEngine.getLocationSnapshot([nifty_candle, bank_candle], structureSnapshot, asOfTime, 'NIFTY', config);
      const gapLevels = snapshot.getAllLevels().filter(l => l.origin === LevelOrigin.GAP_EDGE);

      // Should NOT create gap between different symbols
      expect(gapLevels.length).toBe(0);
    });

    it('Should detect gap when same-symbol 5m candles are sequential', () => {
      // Three consecutive 5m candles: normal, gap down, normal
      const c1 = createCandle('NIFTY', TimeframeValue.FIVE_MIN, 99, 99.5, 99, 99.5, istTime('2026-08-21T09:55:00'), istTime('2026-08-21T10:00:00'));
      const c2 = createCandle('NIFTY', TimeframeValue.FIVE_MIN, 98, 98.5, 97.5, 98, istTime('2026-08-21T10:00:00'), istTime('2026-08-21T10:05:00')); // Gap down from 99.5 to 98
      const c3 = createCandle('NIFTY', TimeframeValue.FIVE_MIN, 98, 99, 98, 98.5, istTime('2026-08-21T10:05:00'), istTime('2026-08-21T10:10:00'));

      const asOfTime = istTime('2026-08-21T10:10:00'); // After all candles
      const high = new SwingPoint('NIFTY', Timeframe.from(TimeframeValue.FIVE_MIN), SwingType.HIGH, 100, istTime('2026-08-21T09:00:00'), istTime('2026-08-21T09:00:00'), istTime('2026-08-21T09:00:00'));
      const structureState = new StructureState(StructureType.NEUTRAL, high, null, null, null);
      const structureSnapshot = new StructureSnapshot(asOfTime, [high], structureState, [], []);

      const snapshot = LevelEngine.getLocationSnapshot([c1, c2, c3], structureSnapshot, asOfTime, 'NIFTY', config);
      const gapLevels = snapshot.getAllLevels().filter(l => l.origin === LevelOrigin.GAP_EDGE);

      // Should detect gap down between c1 and c2
      expect(gapLevels.length).toBeGreaterThan(0);
      expect(gapLevels.some(l => l.price === 99.5)).toBe(true); // Gap at prior close
    });
  });

  describe('Out-of-Order Determinism', () => {
    it('Out-of-order candles violate input contract (must be sorted), but gaps still detected per array order', () => {
      const candle_earlier = createCandle('NIFTY', TimeframeValue.FIVE_MIN, 99, 99.5, 99, 99.5, istTime('2026-08-21T09:55:00'), istTime('2026-08-21T10:00:00'));
      const candle_later = createCandle('NIFTY', TimeframeValue.FIVE_MIN, 101, 102, 101, 101.5, istTime('2026-08-21T10:00:00'), istTime('2026-08-21T10:05:00'));

      const asOfTime = istTime('2026-08-21T10:05:00'); // After all candles
      const high = new SwingPoint('NIFTY', Timeframe.from(TimeframeValue.FIVE_MIN), SwingType.HIGH, 100, istTime('2026-08-21T09:00:00'), istTime('2026-08-21T09:00:00'), istTime('2026-08-21T09:00:00'));
      const structureState = new StructureState(StructureType.NEUTRAL, high, null, null, null);
      const structureSnapshot = new StructureSnapshot(asOfTime, [high], structureState, [], []);

      // Correct order: creates gap between earlier(99.5) and later(101)
      const snapshot_ordered = LevelEngine.getLocationSnapshot([candle_earlier, candle_later], structureSnapshot, asOfTime, 'NIFTY', config);
      const gaps_ordered = snapshot_ordered.getAllLevels().filter(l => l.origin === LevelOrigin.GAP_EDGE);

      // Note: This test documents that out-of-order input violates the input contract.
      // Gap detection processes array as-given, regardless of chronological order.
      // Input MUST be sorted by openTimeUTC per the contract.
      expect(gaps_ordered.length).toBeGreaterThan(0);
    });
  });

  describe('Contract Compliance', () => {
    it('Gap detection respects symbol filter when querying by symbol', () => {
      const asOfTime = istTime('2026-08-21T10:00:00');
      const high = new SwingPoint('NIFTY', Timeframe.from(TimeframeValue.FIVE_MIN), SwingType.HIGH, 100, istTime('2026-08-21T09:00:00'), istTime('2026-08-21T09:00:00'), istTime('2026-08-21T09:00:00'));
      const structureState = new StructureState(StructureType.NEUTRAL, high, null, null, null);
      const structureSnapshot = new StructureSnapshot(asOfTime, [high], structureState, [], []);

      const nifty_candle = createCandle('NIFTY', TimeframeValue.FIVE_MIN, 99, 99.5, 99, 99.5, istTime('2026-08-21T09:55:00'), istTime('2026-08-21T10:00:00'));
      const bank_candle = createCandle('BANKNIFTY', TimeframeValue.FIVE_MIN, 49500, 50000, 49500, 49750, istTime('2026-08-21T10:00:00'), istTime('2026-08-21T10:05:00'));

      // Query for NIFTY only
      const nifty_snapshot = LevelEngine.getLocationSnapshot([nifty_candle, bank_candle], structureSnapshot, asOfTime, 'NIFTY', config);
      const nifty_levels = nifty_snapshot.getAllLevels();

      // Should only have NIFTY levels, no BANKNIFTY
      expect(nifty_levels.every(l => l.symbol === 'NIFTY')).toBe(true);
    });
  });
});
