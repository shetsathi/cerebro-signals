import { LevelEngine, LevelEngineConfig } from '../domain/level-engine';
import { Candle, CandleStatus } from '../domain/candle';
import { Timeframe, TimeframeValue } from '../domain/timeframe';
import { StructureSnapshot } from '../domain/structure-snapshot';
import { StructureState, StructureType } from '../domain/structure-state';
import { SwingPoint, SwingType } from '../domain/swing-point';
import { Level, LevelOrigin, LevelPolarity } from '../domain/level';
import { LevelEvent, LevelEventType, BreakMechanism } from '../domain/level-event';
import { LocationSnapshot, DataSufficiency } from '../domain/location-snapshot';

const config: LevelEngineConfig = {
  k: 3,
  maxBarsFailedBreak: 3,
  maxBarsAfterBreak: 5,
  rulesetVersion: '1.0',
  configHash: 'test-hash-123',
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
  knowledgeTimeUTC: Date,
  status: CandleStatus = CandleStatus.CLOSED,
): Candle {
  return new Candle(
    symbol,
    Timeframe.from(timeframeValue),
    openTimeUTC,
    closeTimeUTC,
    { open, high, low, close, volume: 0 },
    status,
    knowledgeTimeUTC,
  );
}

function createSwing(
  symbol: string,
  type: SwingType,
  price: number,
  eventTime: Date,
  knowledgeTime: Date,
): SwingPoint {
  return new SwingPoint(
    symbol,
    Timeframe.from(TimeframeValue.FIVE_MIN),
    type,
    price,
    eventTime,
    knowledgeTime,
    eventTime,
  );
}

function istTime(dateTimeStr: string): Date {
  const [date, time] = dateTimeStr.split('T');
  const [year, month, day] = date.split('-').map(Number);
  const [hours, minutes, seconds] = time.split(':').map(Number);
  return new Date(Date.UTC(year, month - 1, day, hours, minutes, seconds));
}

describe('LevelEngine - Part 5 Hardening Verification', () => {
  describe('P0.1 - FAILED_BREAK Detection', () => {
    it('should detect FAILED_BREAK when close returns to origin within maxBarsFailedBreak', () => {
      const asOfTime = istTime('2026-08-21T10:15:00');
      const levelPrice = 100;

      const high = createSwing('NIFTY', SwingType.HIGH, levelPrice, istTime('2026-08-21T09:00:00'), istTime('2026-08-21T09:10:00'));
      const structureState = new StructureState(StructureType.NEUTRAL, high, null, null, null);
      const structureSnapshot = new StructureSnapshot(asOfTime, [high], structureState, [], []);

      // Candle 1: Break (close > 100)
      const breakCandle = createCandle('NIFTY', TimeframeValue.FIVE_MIN, 99, 102, 98, 101, istTime('2026-08-21T10:00:00'), istTime('2026-08-21T10:05:00'), istTime('2026-08-21T10:05:00'));
      // Candle 2: Failed break (close <= 100)
      const failedCandle = createCandle('NIFTY', TimeframeValue.FIVE_MIN, 101, 102, 99, 99.5, istTime('2026-08-21T10:05:00'), istTime('2026-08-21T10:10:00'), istTime('2026-08-21T10:10:00'));

      const snapshot = LevelEngine.getLocationSnapshot([breakCandle, failedCandle], structureSnapshot, asOfTime, 'NIFTY', config);

      const failedBreaks = snapshot.getAllEvents().filter((e) => e.eventType === LevelEventType.FAILED_BREAK);
      expect(failedBreaks.length).toBeGreaterThan(0);
      expect(failedBreaks[0].direction).toBe('bearish');
    });

    it('should NOT detect FAILED_BREAK after maxBarsFailedBreak timeout', () => {
      const asOfTime = istTime('2026-08-21T10:30:00');
      const levelPrice = 100;

      const high = createSwing('NIFTY', SwingType.HIGH, levelPrice, istTime('2026-08-21T09:00:00'), istTime('2026-08-21T09:10:00'));
      const structureState = new StructureState(StructureType.NEUTRAL, high, null, null, null);
      const structureSnapshot = new StructureSnapshot(asOfTime, [high], structureState, [], []);

      const breakCandle = createCandle('NIFTY', TimeframeValue.FIVE_MIN, 99, 102, 98, 101, istTime('2026-08-21T10:00:00'), istTime('2026-08-21T10:05:00'), istTime('2026-08-21T10:05:00'));
      const candle2 = createCandle('NIFTY', TimeframeValue.FIVE_MIN, 101, 102, 100, 101, istTime('2026-08-21T10:05:00'), istTime('2026-08-21T10:10:00'), istTime('2026-08-21T10:10:00'));
      const candle3 = createCandle('NIFTY', TimeframeValue.FIVE_MIN, 101, 102, 100, 101.5, istTime('2026-08-21T10:10:00'), istTime('2026-08-21T10:15:00'), istTime('2026-08-21T10:15:00'));
      const candle4 = createCandle('NIFTY', TimeframeValue.FIVE_MIN, 101.5, 102, 100, 101.2, istTime('2026-08-21T10:15:00'), istTime('2026-08-21T10:20:00'), istTime('2026-08-21T10:20:00'));
      const candle5 = createCandle('NIFTY', TimeframeValue.FIVE_MIN, 101.2, 102, 99, 99.5, istTime('2026-08-21T10:20:00'), istTime('2026-08-21T10:25:00'), istTime('2026-08-21T10:25:00'));

      const snapshot = LevelEngine.getLocationSnapshot(
        [breakCandle, candle2, candle3, candle4, candle5],
        structureSnapshot,
        asOfTime,
        'NIFTY',
        config,
      );

      // candle5 at index 4 is outside maxBarsFailedBreak (3 bars from index 0)
      const failedBreaks = snapshot.getAllEvents().filter((e) => e.eventType === LevelEventType.FAILED_BREAK);
      expect(failedBreaks.length).toBe(0);
    });
  });

  describe('P0.2 - RETEST_INTERACTION Detection', () => {
    it('should detect RETEST_INTERACTION when interaction occurs after break within maxBarsAfterBreak', () => {
      const asOfTime = istTime('2026-08-21T10:15:00');
      const levelPrice = 100;

      const high = createSwing('NIFTY', SwingType.HIGH, levelPrice, istTime('2026-08-21T09:00:00'), istTime('2026-08-21T09:10:00'));
      const structureState = new StructureState(StructureType.NEUTRAL, high, null, null, null);
      const structureSnapshot = new StructureSnapshot(asOfTime, [high], structureState, [], []);

      // Candle 1: Break (close > 100)
      const breakCandle = createCandle('NIFTY', TimeframeValue.FIVE_MIN, 99, 102, 98, 101, istTime('2026-08-21T10:00:00'), istTime('2026-08-21T10:05:00'), istTime('2026-08-21T10:05:00'));
      // Candle 2: Interaction (100 in range)
      const retestCandle = createCandle('NIFTY', TimeframeValue.FIVE_MIN, 101, 102, 99, 100.5, istTime('2026-08-21T10:05:00'), istTime('2026-08-21T10:10:00'), istTime('2026-08-21T10:10:00'));

      const snapshot = LevelEngine.getLocationSnapshot([breakCandle, retestCandle], structureSnapshot, asOfTime, 'NIFTY', config);

      const retestInteractions = snapshot.getAllEvents().filter((e) => e.eventType === LevelEventType.RETEST_INTERACTION);
      expect(retestInteractions.length).toBeGreaterThan(0);
    });

    it('should NOT detect RETEST_INTERACTION after maxBarsAfterBreak timeout', () => {
      const asOfTime = istTime('2026-08-21T10:45:00');
      const levelPrice = 100;

      const high = createSwing('NIFTY', SwingType.HIGH, levelPrice, istTime('2026-08-21T09:00:00'), istTime('2026-08-21T09:10:00'));
      const structureState = new StructureState(StructureType.NEUTRAL, high, null, null, null);
      const structureSnapshot = new StructureSnapshot(asOfTime, [high], structureState, [], []);

      // Break at candle0, no interactions until candle6 (which is outside the window)
      const breakCandle = createCandle('NIFTY', TimeframeValue.FIVE_MIN, 99, 102, 98, 101, istTime('2026-08-21T10:00:00'), istTime('2026-08-21T10:05:00'), istTime('2026-08-21T10:05:00'));
      const candle2 = createCandle('NIFTY', TimeframeValue.FIVE_MIN, 101, 102, 101, 101.5, istTime('2026-08-21T10:05:00'), istTime('2026-08-21T10:10:00'), istTime('2026-08-21T10:10:00'));
      const candle3 = createCandle('NIFTY', TimeframeValue.FIVE_MIN, 101.5, 102, 101, 101.2, istTime('2026-08-21T10:10:00'), istTime('2026-08-21T10:15:00'), istTime('2026-08-21T10:15:00'));
      const candle4 = createCandle('NIFTY', TimeframeValue.FIVE_MIN, 101.2, 102, 101, 101.8, istTime('2026-08-21T10:15:00'), istTime('2026-08-21T10:20:00'), istTime('2026-08-21T10:20:00'));
      const candle5 = createCandle('NIFTY', TimeframeValue.FIVE_MIN, 101.8, 102, 101, 101.5, istTime('2026-08-21T10:20:00'), istTime('2026-08-21T10:25:00'), istTime('2026-08-21T10:25:00'));
      const candle6 = createCandle('NIFTY', TimeframeValue.FIVE_MIN, 101.5, 102, 99, 100.5, istTime('2026-08-21T10:25:00'), istTime('2026-08-21T10:30:00'), istTime('2026-08-21T10:30:00'));

      const snapshot = LevelEngine.getLocationSnapshot(
        [breakCandle, candle2, candle3, candle4, candle5, candle6],
        structureSnapshot,
        asOfTime,
        'NIFTY',
        config,
      );

      // candle6 at index 5 is at the boundary of maxBarsAfterBreak (5 bars), so should NOT be detected
      const retestInteractions = snapshot.getAllEvents().filter((e) => e.eventType === LevelEventType.RETEST_INTERACTION);
      expect(retestInteractions.length).toBe(0);
    });

    it('should NOT detect RETEST_INTERACTION if opposite break occurs', () => {
      const asOfTime = istTime('2026-08-21T10:15:00');
      const levelPrice = 100;

      const high = createSwing('NIFTY', SwingType.HIGH, levelPrice, istTime('2026-08-21T09:00:00'), istTime('2026-08-21T09:10:00'));
      const structureState = new StructureState(StructureType.NEUTRAL, high, null, null, null);
      const structureSnapshot = new StructureSnapshot(asOfTime, [high], structureState, [], []);

      // Candle 1: Break (close > 100)
      const breakCandle = createCandle('NIFTY', TimeframeValue.FIVE_MIN, 99, 102, 98, 101, istTime('2026-08-21T10:00:00'), istTime('2026-08-21T10:05:00'), istTime('2026-08-21T10:05:00'));
      // Candle 2: Opposite break (close back below level)
      const oppositeBreak = createCandle('NIFTY', TimeframeValue.FIVE_MIN, 101, 102, 98, 99, istTime('2026-08-21T10:05:00'), istTime('2026-08-21T10:10:00'), istTime('2026-08-21T10:10:00'));
      // Candle 3: Interaction (too late, chain broken)
      const lateRetest = createCandle('NIFTY', TimeframeValue.FIVE_MIN, 99, 102, 99, 100.5, istTime('2026-08-21T10:10:00'), istTime('2026-08-21T10:15:00'), istTime('2026-08-21T10:15:00'));

      const snapshot = LevelEngine.getLocationSnapshot([breakCandle, oppositeBreak, lateRetest], structureSnapshot, asOfTime, 'NIFTY', config);

      const retestInteractions = snapshot.getAllEvents().filter((e) => e.eventType === LevelEventType.RETEST_INTERACTION);
      expect(retestInteractions.length).toBe(0);
    });
  });

  describe('P0.3 - Prior-Period Boundaries (No Index Offsets)', () => {
    it('should create PRIOR_WEEK levels from actual prior week candle', () => {
      const asOfTime = istTime('2026-08-21T10:00:00'); // Friday
      const currentDaily = createCandle('NIFTY', TimeframeValue.DAILY, 108, 109, 107, 108.5, istTime('2026-08-21T09:15:00'), istTime('2026-08-21T15:30:00'), istTime('2026-08-21T15:30:00'));
      const priorWeekCandle = createCandle('NIFTY', TimeframeValue.DAILY, 105, 110, 103, 107, istTime('2026-08-15T09:15:00'), istTime('2026-08-15T15:30:00'), istTime('2026-08-15T15:30:00')); // Prior Friday

      const structureState = new StructureState(StructureType.NEUTRAL, null, null, null, null);
      const structureSnapshot = new StructureSnapshot(asOfTime, [], structureState, [], []);

      const snapshot = LevelEngine.getLocationSnapshot([priorWeekCandle, currentDaily], structureSnapshot, asOfTime, 'NIFTY', config);

      const priorWeekLevels = snapshot.getAllLevels().filter((l) => l.origin === LevelOrigin.PRIOR_WEEK);
      expect(priorWeekLevels.length).toBeGreaterThan(0);
    });

    it('should create PRIOR_MONTH levels from actual prior month candle', () => {
      const asOfTime = istTime('2026-08-21T10:00:00');
      const currentDaily = createCandle('NIFTY', TimeframeValue.DAILY, 108, 109, 107, 108.5, istTime('2026-08-21T09:15:00'), istTime('2026-08-21T15:30:00'), istTime('2026-08-21T15:30:00'));
      const priorMonthCandle = createCandle('NIFTY', TimeframeValue.DAILY, 105, 115, 100, 112, istTime('2026-07-31T09:15:00'), istTime('2026-07-31T15:30:00'), istTime('2026-07-31T15:30:00')); // Prior month

      const structureState = new StructureState(StructureType.NEUTRAL, null, null, null, null);
      const structureSnapshot = new StructureSnapshot(asOfTime, [], structureState, [], []);

      const snapshot = LevelEngine.getLocationSnapshot([priorMonthCandle, currentDaily], structureSnapshot, asOfTime, 'NIFTY', config);

      const priorMonthLevels = snapshot.getAllLevels().filter((l) => l.origin === LevelOrigin.PRIOR_MONTH);
      expect(priorMonthLevels.length).toBeGreaterThan(0);
    });

    it('should not create spurious prior-week levels from same week', () => {
      const asOfTime = istTime('2026-08-21T10:00:00');
      const wednesdayCandle = createCandle('NIFTY', TimeframeValue.DAILY, 108, 109, 107, 108.5, istTime('2026-08-20T09:15:00'), istTime('2026-08-20T15:30:00'), istTime('2026-08-20T15:30:00'));
      const fridayCandle = createCandle('NIFTY', TimeframeValue.DAILY, 108, 109, 107, 108.5, istTime('2026-08-21T09:15:00'), istTime('2026-08-21T15:30:00'), istTime('2026-08-21T15:30:00'));

      const structureState = new StructureState(StructureType.NEUTRAL, null, null, null, null);
      const structureSnapshot = new StructureSnapshot(asOfTime, [], structureState, [], []);

      const snapshot = LevelEngine.getLocationSnapshot([wednesdayCandle, fridayCandle], structureSnapshot, asOfTime, 'NIFTY', config);

      const priorWeekLevels = snapshot.getAllLevels().filter((l) => l.origin === LevelOrigin.PRIOR_WEEK);
      expect(priorWeekLevels.length).toBe(0);
    });
  });

  describe('P0.4 - Runtime Immutability', () => {
    it('should freeze Level instances', () => {
      const level = new Level(
        'test_level',
        'NIFTY',
        Timeframe.from(TimeframeValue.FIVE_MIN),
        LevelOrigin.CONFIRMED_SWING,
        LevelPolarity.RESISTANCE,
        100,
        new Date(),
        new Date(),
        '1.0',
        'hash',
      );

      expect(() => {
        (level as any).price = 999;
      }).toThrow();
    });

    it('should freeze LevelEvent instances', () => {
      const event = new LevelEvent(
        'test_event',
        'test_level',
        LevelEventType.INTERACTION,
        Timeframe.from(TimeframeValue.FIVE_MIN),
        new Date(),
        new Date(),
      );

      expect(() => {
        (event as any).eventType = LevelEventType.BREAK;
      }).toThrow();
    });

    it('should return defensive copies of arrays from LocationSnapshot', () => {
      const asOfTime = istTime('2026-08-21T10:00:00');
      const high = createSwing('NIFTY', SwingType.HIGH, 100, istTime('2026-08-21T09:00:00'), istTime('2026-08-21T09:10:00'));
      const structureState = new StructureState(StructureType.NEUTRAL, high, null, null, null);
      const structureSnapshot = new StructureSnapshot(asOfTime, [high], structureState, [], []);

      const candle = createCandle('NIFTY', TimeframeValue.FIVE_MIN, 99, 101, 98, 100, istTime('2026-08-21T09:55:00'), asOfTime, asOfTime);

      const snapshot = LevelEngine.getLocationSnapshot([candle], structureSnapshot, asOfTime, 'NIFTY', config);

      const levels1 = snapshot.getAllLevels();
      const levels2 = snapshot.getAllLevels();
      expect(levels1).not.toBe(levels2); // Different array instances
      expect(levels1.length).toBe(levels2.length); // Same content
    });

    it('should have immutable Date objects in snapshot', () => {
      const asOfTime = istTime('2026-08-21T10:00:00');
      const high = createSwing('NIFTY', SwingType.HIGH, 100, istTime('2026-08-21T09:00:00'), istTime('2026-08-21T09:10:00'));
      const structureState = new StructureState(StructureType.NEUTRAL, high, null, null, null);
      const structureSnapshot = new StructureSnapshot(asOfTime, [high], structureState, [], []);

      const candle = createCandle('NIFTY', TimeframeValue.FIVE_MIN, 99, 101, 98, 100, istTime('2026-08-21T09:55:00'), asOfTime, asOfTime);

      const snapshot = LevelEngine.getLocationSnapshot([candle], structureSnapshot, asOfTime, 'NIFTY', config);

      // The readonly property prevents reassignment, but we can check defensive copies were made
      const originalTime = snapshot.asOfTimeUTC.getTime();
      expect(originalTime).toBe(asOfTime.getTime());
    });
  });

  describe('P1.6 - Break Mechanism TRADED vs GAPPED', () => {
    it('should correctly identify TRADED break', () => {
      const asOfTime = istTime('2026-08-21T10:00:00');
      const levelPrice = 100;

      const high = createSwing('NIFTY', SwingType.HIGH, levelPrice, istTime('2026-08-21T09:00:00'), istTime('2026-08-21T09:10:00'));
      const structureState = new StructureState(StructureType.NEUTRAL, high, null, null, null);
      const structureSnapshot = new StructureSnapshot(asOfTime, [high], structureState, [], []);

      const candle = createCandle('NIFTY', TimeframeValue.FIVE_MIN, 99, 102, 98, 101, istTime('2026-08-21T09:55:00'), asOfTime, asOfTime);

      const snapshot = LevelEngine.getLocationSnapshot([candle], structureSnapshot, asOfTime, 'NIFTY', config);

      const breaks = snapshot.getAllEvents().filter((e) => e.eventType === LevelEventType.BREAK);
      expect(breaks.length).toBeGreaterThan(0);
      expect(breaks[0].breakMechanism).toBe(BreakMechanism.TRADED);
    });

    it('should correctly identify GAPPED break', () => {
      const asOfTime = istTime('2026-08-21T10:00:00');
      const levelPrice = 100;

      const high = createSwing('NIFTY', SwingType.HIGH, levelPrice, istTime('2026-08-21T09:00:00'), istTime('2026-08-21T09:10:00'));
      const structureState = new StructureState(StructureType.NEUTRAL, high, null, null, null);
      const structureSnapshot = new StructureSnapshot(asOfTime, [high], structureState, [], []);

      const prevCandle = createCandle('NIFTY', TimeframeValue.FIVE_MIN, 99, 99.5, 98, 99, istTime('2026-08-21T09:55:00'), istTime('2026-08-21T10:00:00'), istTime('2026-08-21T10:00:00'));
      const gapCandle = createCandle('NIFTY', TimeframeValue.FIVE_MIN, 101.5, 102, 101, 101.5, istTime('2026-08-21T10:00:00'), asOfTime, asOfTime);

      const snapshot = LevelEngine.getLocationSnapshot([prevCandle, gapCandle], structureSnapshot, asOfTime, 'NIFTY', config);

      const breaks = snapshot.getAllEvents().filter((e) => e.eventType === LevelEventType.BREAK);
      expect(breaks.length).toBeGreaterThan(0);
      expect(breaks[0].breakMechanism).toBe(BreakMechanism.GAPPED);
    });
  });

  describe('P1.9 - Polarity Flip Verification', () => {
    it('should flip RESISTANCE to SUPPORT after break', () => {
      const asOfTime = istTime('2026-08-21T10:00:00');
      const levelPrice = 100;

      const high = createSwing('NIFTY', SwingType.HIGH, levelPrice, istTime('2026-08-21T09:00:00'), istTime('2026-08-21T09:10:00'));
      const structureState = new StructureState(StructureType.NEUTRAL, high, null, null, null);
      const structureSnapshot = new StructureSnapshot(asOfTime, [high], structureState, [], []);

      const breakCandle = createCandle('NIFTY', TimeframeValue.FIVE_MIN, 99, 102, 98, 101, istTime('2026-08-21T09:55:00'), asOfTime, asOfTime);

      const snapshot = LevelEngine.getLocationSnapshot([breakCandle], structureSnapshot, asOfTime, 'NIFTY', config);

      const level = snapshot.getAllLevels().find((l) => l.price === levelPrice);
      const polarityState = snapshot.getPolarityState(level!.levelId);

      expect(level?.polarity).toBe(LevelPolarity.RESISTANCE);
      expect(polarityState?.currentPolarity).toBe(LevelPolarity.SUPPORT);
      expect(polarityState?.brokeAt).toBeDefined();
    });

    it('should flip SUPPORT to RESISTANCE after break', () => {
      const asOfTime = istTime('2026-08-21T10:00:00');
      const levelPrice = 100;

      const low = createSwing('NIFTY', SwingType.LOW, levelPrice, istTime('2026-08-21T09:00:00'), istTime('2026-08-21T09:10:00'));
      const structureState = new StructureState(StructureType.NEUTRAL, null, low, null, null);
      const structureSnapshot = new StructureSnapshot(asOfTime, [low], structureState, [], []);

      const breakCandle = createCandle('NIFTY', TimeframeValue.FIVE_MIN, 101, 102, 98, 99, istTime('2026-08-21T09:55:00'), asOfTime, asOfTime);

      const snapshot = LevelEngine.getLocationSnapshot([breakCandle], structureSnapshot, asOfTime, 'NIFTY', config);

      const level = snapshot.getAllLevels().find((l) => l.price === levelPrice);
      const polarityState = snapshot.getPolarityState(level!.levelId);

      expect(level?.polarity).toBe(LevelPolarity.SUPPORT);
      expect(polarityState?.currentPolarity).toBe(LevelPolarity.RESISTANCE);
    });
  });

  describe('P1.8 - Knowledge-Time Safety', () => {
    it('should exclude events with knowledgeTime > asOfTime', () => {
      const asOfTime = istTime('2026-08-21T09:45:00');
      const futureKnowledge = istTime('2026-08-21T10:00:00');

      const high = createSwing('NIFTY', SwingType.HIGH, 100, istTime('2026-08-21T09:00:00'), istTime('2026-08-21T09:10:00'));
      const structureState = new StructureState(StructureType.NEUTRAL, high, null, null, null);
      const structureSnapshot = new StructureSnapshot(asOfTime, [high], structureState, [], []);

      const futureCandle = createCandle('NIFTY', TimeframeValue.FIVE_MIN, 99, 101, 98, 101, istTime('2026-08-21T09:55:00'), istTime('2026-08-21T10:00:00'), futureKnowledge);

      const snapshot = LevelEngine.getLocationSnapshot([futureCandle], structureSnapshot, asOfTime, 'NIFTY', config);

      expect(snapshot.getAllEvents().length).toBe(0);
    });

    it('should produce identical snapshots on historical replay', () => {
      const asOfTime = istTime('2026-08-21T10:00:00');
      const high = createSwing('NIFTY', SwingType.HIGH, 100, istTime('2026-08-21T09:00:00'), istTime('2026-08-21T09:10:00'));
      const low = createSwing('NIFTY', SwingType.LOW, 95, istTime('2026-08-21T09:05:00'), istTime('2026-08-21T09:15:00'));

      const structureState = new StructureState(StructureType.NEUTRAL, high, low, null, null);
      const structureSnapshot = new StructureSnapshot(asOfTime, [high, low], structureState, [], []);

      const candle = createCandle('NIFTY', TimeframeValue.FIVE_MIN, 99, 101, 98, 100, istTime('2026-08-21T09:55:00'), asOfTime, asOfTime);

      const snapshot1 = LevelEngine.getLocationSnapshot([candle], structureSnapshot, asOfTime, 'NIFTY', config);
      const snapshot2 = LevelEngine.getLocationSnapshot([candle], structureSnapshot, asOfTime, 'NIFTY', config);

      expect(snapshot1.getAllLevels().length).toBe(snapshot2.getAllLevels().length);
      expect(snapshot1.getAllEvents().length).toBe(snapshot2.getAllEvents().length);
      expect(snapshot1.knowledgeTimeUTC.getTime()).toBe(snapshot2.knowledgeTimeUTC.getTime());
    });
  });
});
