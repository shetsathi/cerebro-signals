import { LevelEngine, LevelEngineConfig } from '../domain/level-engine';
import { Candle, CandleStatus } from '../domain/candle';
import { Timeframe, TimeframeValue } from '../domain/timeframe';
import { StructureSnapshot } from '../domain/structure-snapshot';
import { StructureState, StructureType } from '../domain/structure-state';
import { SwingPoint, SwingType } from '../domain/swing-point';
import { DataSufficiency } from '../domain/location-snapshot';

const config: LevelEngineConfig = {
  k: 3,
  maxBarsFailedBreak: 2,
  maxBarsAfterBreak: 3,
  rulesetVersion: '1.0',
  configHash: 'sufficiency-test',
};

function createCandle(
  symbol: string,
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
    Timeframe.from(TimeframeValue.FIVE_MIN),
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

describe('FIX #2 — DataSufficiency / WARMING_UP Resolution', () => {
  describe('Current Implementation: No Warm-Up Logic', () => {
    it('Should return INSUFFICIENT_DATA when no levels exist', () => {
      const asOfTime = istTime('2026-08-21T10:00:00');
      const structureState = new StructureState(StructureType.NEUTRAL, null, null, null, null);
      const structureSnapshot = new StructureSnapshot(asOfTime, [], structureState, [], []);

      const candle = createCandle('NIFTY', 99, 100, 99, 99.5, istTime('2026-08-21T09:55:00'), asOfTime);

      const snapshot = LevelEngine.getLocationSnapshot([candle], structureSnapshot, asOfTime, 'NIFTY', config);

      expect(snapshot.dataSufficiency).toBe(DataSufficiency.INSUFFICIENT_DATA);
    });

    it('Should return SUFFICIENT when at least one level exists', () => {
      const asOfTime = istTime('2026-08-21T10:00:00');
      const high = new SwingPoint('NIFTY', Timeframe.from(TimeframeValue.FIVE_MIN), SwingType.HIGH, 100, istTime('2026-08-21T09:00:00'), istTime('2026-08-21T09:00:00'), istTime('2026-08-21T09:00:00'));
      const structureState = new StructureState(StructureType.NEUTRAL, high, null, null, null);
      const structureSnapshot = new StructureSnapshot(asOfTime, [high], structureState, [], []);

      const candle = createCandle('NIFTY', 99, 100, 99, 99.5, istTime('2026-08-21T09:55:00'), asOfTime);

      const snapshot = LevelEngine.getLocationSnapshot([candle], structureSnapshot, asOfTime, 'NIFTY', config);

      expect(snapshot.dataSufficiency).toBe(DataSufficiency.SUFFICIENT);
    });

    it('Should return SUFFICIENT even with minimal data (1 candle, 1 level)', () => {
      const asOfTime = istTime('2026-08-21T10:00:00');
      const high = new SwingPoint('NIFTY', Timeframe.from(TimeframeValue.FIVE_MIN), SwingType.HIGH, 100, istTime('2026-08-21T09:00:00'), istTime('2026-08-21T09:00:00'), istTime('2026-08-21T09:00:00'));
      const structureState = new StructureState(StructureType.NEUTRAL, high, null, null, null);
      const structureSnapshot = new StructureSnapshot(asOfTime, [high], structureState, [], []);

      // Single candle, single level
      const candle = createCandle('NIFTY', 99, 100, 99, 99.5, istTime('2026-08-21T09:55:00'), asOfTime);

      const snapshot = LevelEngine.getLocationSnapshot([candle], structureSnapshot, asOfTime, 'NIFTY', config);

      expect(snapshot.dataSufficiency).toBe(DataSufficiency.SUFFICIENT);
    });
  });

  describe('Deterministic Convergence (No Warm-Up Criteria)', () => {
    it('Replay A (early start) and Replay B (late start) should converge at same asOfTime', () => {
      const asOfTime_reference = istTime('2026-08-21T10:15:00');
      const high = new SwingPoint('NIFTY', Timeframe.from(TimeframeValue.FIVE_MIN), SwingType.HIGH, 100, istTime('2026-08-21T09:00:00'), istTime('2026-08-21T09:00:00'), istTime('2026-08-21T09:00:00'));
      const structureState = new StructureState(StructureType.NEUTRAL, high, null, null, null);
      const structureSnapshot = new StructureSnapshot(asOfTime_reference, [high], structureState, [], []);

      // Candle series
      const candles_early = [
        createCandle('NIFTY', 99, 100, 99, 99.5, istTime('2026-08-21T09:55:00'), istTime('2026-08-21T10:00:00')),
        createCandle('NIFTY', 99.5, 100.5, 99, 100, istTime('2026-08-21T10:00:00'), istTime('2026-08-21T10:05:00')),
        createCandle('NIFTY', 100, 101, 99.5, 100.5, istTime('2026-08-21T10:05:00'), istTime('2026-08-21T10:10:00')),
        createCandle('NIFTY', 100.5, 101.5, 100, 101, istTime('2026-08-21T10:10:00'), istTime('2026-08-21T10:15:00')),
      ];

      // Replay A: Start early (index 0)
      const snapshot_A = LevelEngine.getLocationSnapshot(candles_early, structureSnapshot, asOfTime_reference, 'NIFTY', config);

      // Replay B: Start late (skip first candle, start at index 1)
      const candles_late = candles_early.slice(1);
      const snapshot_B = LevelEngine.getLocationSnapshot(candles_late, structureSnapshot, asOfTime_reference, 'NIFTY', config);

      // Both should have same sufficiency at asOfTime_reference
      expect(snapshot_A.dataSufficiency).toBe(snapshot_B.dataSufficiency);
      expect(snapshot_A.dataSufficiency).toBe(DataSufficiency.SUFFICIENT); // Since high level exists

      // Both should have same level count (swings only, no prior-period or gap since only 3-4 candles)
      expect(snapshot_A.getAllLevels().length).toBe(snapshot_B.getAllLevels().length);
    });

    it('Multiple historical replays should produce identical sufficiency', () => {
      const asOfTime = istTime('2026-08-21T10:00:00');
      const high = new SwingPoint('NIFTY', Timeframe.from(TimeframeValue.FIVE_MIN), SwingType.HIGH, 100, istTime('2026-08-21T09:00:00'), istTime('2026-08-21T09:00:00'), istTime('2026-08-21T09:00:00'));
      const structureState = new StructureState(StructureType.NEUTRAL, high, null, null, null);
      const structureSnapshot = new StructureSnapshot(asOfTime, [high], structureState, [], []);

      const candles = [
        createCandle('NIFTY', 99, 100, 99, 99.5, istTime('2026-08-21T09:55:00'), istTime('2026-08-21T10:00:00')),
      ];

      // Run 3 times
      const snapshot_1 = LevelEngine.getLocationSnapshot([...candles], structureSnapshot, asOfTime, 'NIFTY', config);
      const snapshot_2 = LevelEngine.getLocationSnapshot([...candles], structureSnapshot, asOfTime, 'NIFTY', config);
      const snapshot_3 = LevelEngine.getLocationSnapshot([...candles], structureSnapshot, asOfTime, 'NIFTY', config);

      expect(snapshot_1.dataSufficiency).toBe(snapshot_2.dataSufficiency);
      expect(snapshot_2.dataSufficiency).toBe(snapshot_3.dataSufficiency);
    });

    it('WARMING_UP should never be returned (reserved for future use)', () => {
      const asOfTime = istTime('2026-08-21T10:00:00');
      const high = new SwingPoint('NIFTY', Timeframe.from(TimeframeValue.FIVE_MIN), SwingType.HIGH, 100, istTime('2026-08-21T09:00:00'), istTime('2026-08-21T09:00:00'), istTime('2026-08-21T09:00:00'));
      const structureState = new StructureState(StructureType.NEUTRAL, high, null, null, null);
      const structureSnapshot = new StructureSnapshot(asOfTime, [high], structureState, [], []);

      // Generate with minimal data
      const candle = createCandle('NIFTY', 99, 100, 99, 99.5, istTime('2026-08-21T09:55:00'), asOfTime);
      const snapshot = LevelEngine.getLocationSnapshot([candle], structureSnapshot, asOfTime, 'NIFTY', config);

      // Should never be WARMING_UP in V1 (no warm-up logic implemented)
      expect(snapshot.dataSufficiency).not.toBe(DataSufficiency.WARMING_UP);
      expect([DataSufficiency.SUFFICIENT, DataSufficiency.INSUFFICIENT_DATA]).toContain(snapshot.dataSufficiency);
    });
  });

  describe('Contract Documentation', () => {
    it('DataSufficiency contract is deterministic but does not implement warm-up', () => {
      const asOfTime = istTime('2026-08-21T10:00:00');
      const structureState = new StructureState(StructureType.NEUTRAL, null, null, null, null);
      const structureSnapshot = new StructureSnapshot(asOfTime, [], structureState, [], []);

      // Even with no levels, behavior is deterministic
      const snapshot_empty = LevelEngine.getLocationSnapshot([], structureSnapshot, asOfTime, 'NIFTY', config);
      expect(snapshot_empty.dataSufficiency).toBe(DataSufficiency.INSUFFICIENT_DATA);

      // Result is deterministic - same input, same output
      const snapshot_empty_2 = LevelEngine.getLocationSnapshot([], structureSnapshot, asOfTime, 'NIFTY', config);
      expect(snapshot_empty_2.dataSufficiency).toBe(DataSufficiency.INSUFFICIENT_DATA);
    });
  });
});
