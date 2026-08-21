import { SetupEngine, SetupEngineConfig } from '../domain/setup-engine';
import { Setup, SetupType, SetupStatus } from '../domain/setup';
import { LevelEngine, LevelEngineConfig } from '../domain/level-engine';
import { Candle, CandleStatus } from '../domain/candle';
import { Timeframe, TimeframeValue } from '../domain/timeframe';
import { StructureSnapshot } from '../domain/structure-snapshot';
import { StructureState, StructureType } from '../domain/structure-state';
import { SwingPoint, SwingType } from '../domain/swing-point';

const levelConfig: LevelEngineConfig = {
  k: 3,
  maxBarsFailedBreak: 2,
  maxBarsAfterBreak: 3,
  rulesetVersion: '1.0',
  configHash: 'test-level',
};

const setupConfig: SetupEngineConfig = {
  k: 3,
  maxBarsFailedBreak: 2,
  maxBarsAfterBreak: 3,
  rulesetVersion: '1.0',
  configHash: 'test-setup',
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

describe('Part 6 — Setup Qualification Engine', () => {
  describe('PULLBACK_LONG Qualification', () => {
    it('Should create PULLBACK_LONG setup with qualified status', () => {
      const asOfTime = istTime('2026-08-21T10:10:00');

      // Create RESISTANCE level via swing
      const high = new SwingPoint('NIFTY', Timeframe.from(TimeframeValue.FIVE_MIN), SwingType.HIGH, 100, istTime('2026-08-21T09:00:00'), istTime('2026-08-21T09:00:00'), istTime('2026-08-21T09:00:00'));
      const structureState = new StructureState(StructureType.NEUTRAL, high, null, null, null);
      const structureSnapshot = new StructureSnapshot(asOfTime, [high], structureState, [], []);

      // Create candles: break + interaction
      const breakCandle = createCandle('NIFTY', 99, 102, 98, 101, istTime('2026-08-21T09:55:00'), istTime('2026-08-21T10:00:00'));
      const interactionCandle = createCandle('NIFTY', 101, 102, 99.5, 100, istTime('2026-08-21T10:00:00'), istTime('2026-08-21T10:05:00'));
      const afterCandle = createCandle('NIFTY', 100, 100.5, 99.8, 100.2, istTime('2026-08-21T10:05:00'), istTime('2026-08-21T10:10:00'));

      // Get location snapshot
      const locationSnapshot = LevelEngine.getLocationSnapshot(
        [breakCandle, interactionCandle, afterCandle],
        structureSnapshot,
        asOfTime,
        'NIFTY',
        levelConfig,
      );

      // Get setup snapshot
      const setupSnapshot = SetupEngine.getSetupSnapshot(locationSnapshot, structureSnapshot, asOfTime, 'NIFTY', setupConfig);

      const pullbackLongSetups = setupSnapshot.getAllSetups().filter(s => s.setupType === SetupType.PULLBACK_LONG);
      expect(pullbackLongSetups.length).toBeGreaterThan(0);

      const qualified = pullbackLongSetups.filter(s => s.status === SetupStatus.QUALIFIED);
      expect(qualified.length).toBeGreaterThan(0);
      expect(qualified[0].direction).toBe('LONG');
    });
  });

  describe('BREAKOUT_RETEST_LONG Qualification', () => {
    it('Should create BREAKOUT_RETEST_LONG setup with qualified status', () => {
      const asOfTime = istTime('2026-08-21T10:10:00');

      const high = new SwingPoint('NIFTY', Timeframe.from(TimeframeValue.FIVE_MIN), SwingType.HIGH, 100, istTime('2026-08-21T09:00:00'), istTime('2026-08-21T09:00:00'), istTime('2026-08-21T09:00:00'));
      const structureState = new StructureState(StructureType.NEUTRAL, high, null, null, null);
      const structureSnapshot = new StructureSnapshot(asOfTime, [high], structureState, [], []);

      const breakCandle = createCandle('NIFTY', 99, 102, 98, 101, istTime('2026-08-21T09:55:00'), istTime('2026-08-21T10:00:00'));
      const retestCandle = createCandle('NIFTY', 101, 102, 99.5, 100, istTime('2026-08-21T10:00:00'), istTime('2026-08-21T10:05:00'));
      const afterCandle = createCandle('NIFTY', 100, 100.5, 99.8, 100.2, istTime('2026-08-21T10:05:00'), istTime('2026-08-21T10:10:00'));

      const locationSnapshot = LevelEngine.getLocationSnapshot(
        [breakCandle, retestCandle, afterCandle],
        structureSnapshot,
        asOfTime,
        'NIFTY',
        levelConfig,
      );

      const setupSnapshot = SetupEngine.getSetupSnapshot(locationSnapshot, structureSnapshot, asOfTime, 'NIFTY', setupConfig);

      const retestSetups = setupSnapshot.getAllSetups().filter(s => s.setupType === SetupType.BREAKOUT_RETEST_LONG);
      expect(retestSetups.length).toBeGreaterThan(0);
    });
  });

  describe('Setup Status Transitions', () => {
    it('Should show FORMING status when break exists but no interaction', () => {
      const asOfTime = istTime('2026-08-21T10:00:00');

      const high = new SwingPoint('NIFTY', Timeframe.from(TimeframeValue.FIVE_MIN), SwingType.HIGH, 100, istTime('2026-08-21T09:00:00'), istTime('2026-08-21T09:00:00'), istTime('2026-08-21T09:00:00'));
      const structureState = new StructureState(StructureType.NEUTRAL, high, null, null, null);
      const structureSnapshot = new StructureSnapshot(asOfTime, [high], structureState, [], []);

      const breakCandle = createCandle('NIFTY', 99, 102, 98, 101, istTime('2026-08-21T09:55:00'), asOfTime);

      const locationSnapshot = LevelEngine.getLocationSnapshot([breakCandle], structureSnapshot, asOfTime, 'NIFTY', levelConfig);

      const setupSnapshot = SetupEngine.getSetupSnapshot(locationSnapshot, structureSnapshot, asOfTime, 'NIFTY', setupConfig);

      const formingSetups = setupSnapshot.getFormingSetups();
      expect(formingSetups.length).toBeGreaterThan(0);
    });
  });

  describe('Immutability', () => {
    it('Setup should be immutable', () => {
      const asOfTime = istTime('2026-08-21T10:10:00');

      const high = new SwingPoint('NIFTY', Timeframe.from(TimeframeValue.FIVE_MIN), SwingType.HIGH, 100, istTime('2026-08-21T09:00:00'), istTime('2026-08-21T09:00:00'), istTime('2026-08-21T09:00:00'));
      const structureState = new StructureState(StructureType.NEUTRAL, high, null, null, null);
      const structureSnapshot = new StructureSnapshot(asOfTime, [high], structureState, [], []);

      const breakCandle = createCandle('NIFTY', 99, 102, 98, 101, istTime('2026-08-21T09:55:00'), istTime('2026-08-21T10:00:00'));
      const interactionCandle = createCandle('NIFTY', 101, 102, 99.5, 100, istTime('2026-08-21T10:00:00'), istTime('2026-08-21T10:05:00'));
      const afterCandle = createCandle('NIFTY', 100, 100.5, 99.8, 100.2, istTime('2026-08-21T10:05:00'), istTime('2026-08-21T10:10:00'));

      const locationSnapshot = LevelEngine.getLocationSnapshot(
        [breakCandle, interactionCandle, afterCandle],
        structureSnapshot,
        asOfTime,
        'NIFTY',
        levelConfig,
      );

      const setupSnapshot = SetupEngine.getSetupSnapshot(locationSnapshot, structureSnapshot, asOfTime, 'NIFTY', setupConfig);

      const setup = setupSnapshot.getAllSetups()[0];
      expect(() => {
        (setup as any).status = SetupStatus.INVALIDATED;
      }).toThrow();
    });
  });

  describe('Knowledge-Time Safety', () => {
    it('Should only use events with knowledgeTimeUTC <= asOfTime', () => {
      const asOfTime = istTime('2026-08-21T10:00:00');

      const high = new SwingPoint('NIFTY', Timeframe.from(TimeframeValue.FIVE_MIN), SwingType.HIGH, 100, istTime('2026-08-21T09:00:00'), istTime('2026-08-21T09:00:00'), istTime('2026-08-21T09:00:00'));
      const structureState = new StructureState(StructureType.NEUTRAL, high, null, null, null);
      const structureSnapshot = new StructureSnapshot(asOfTime, [high], structureState, [], []);

      const breakCandle = createCandle('NIFTY', 99, 102, 98, 101, istTime('2026-08-21T09:55:00'), istTime('2026-08-21T10:00:00'));
      // Future interaction (knowledge time after asOfTime) should not qualify
      const futureInteraction = createCandle('NIFTY', 101, 102, 99.5, 100, istTime('2026-08-21T10:00:00'), istTime('2026-08-21T10:05:00'), istTime('2026-08-21T10:05:00'));

      const locationSnapshot = LevelEngine.getLocationSnapshot(
        [breakCandle, futureInteraction],
        structureSnapshot,
        asOfTime,
        'NIFTY',
        levelConfig,
      );

      const setupSnapshot = SetupEngine.getSetupSnapshot(locationSnapshot, structureSnapshot, asOfTime, 'NIFTY', setupConfig);

      // Should not be QUALIFIED because interaction is in the future
      const qualified = setupSnapshot.getQualifiedSetups();
      expect(qualified.length).toBe(0);
    });
  });

  describe('No Scoring or Confidence', () => {
    it('Setup should not have score, confidence, or probability fields', () => {
      const asOfTime = istTime('2026-08-21T10:10:00');

      const high = new SwingPoint('NIFTY', Timeframe.from(TimeframeValue.FIVE_MIN), SwingType.HIGH, 100, istTime('2026-08-21T09:00:00'), istTime('2026-08-21T09:00:00'), istTime('2026-08-21T09:00:00'));
      const structureState = new StructureState(StructureType.NEUTRAL, high, null, null, null);
      const structureSnapshot = new StructureSnapshot(asOfTime, [high], structureState, [], []);

      const breakCandle = createCandle('NIFTY', 99, 102, 98, 101, istTime('2026-08-21T09:55:00'), istTime('2026-08-21T10:00:00'));
      const interactionCandle = createCandle('NIFTY', 101, 102, 99.5, 100, istTime('2026-08-21T10:00:00'), istTime('2026-08-21T10:05:00'));
      const afterCandle = createCandle('NIFTY', 100, 100.5, 99.8, 100.2, istTime('2026-08-21T10:05:00'), istTime('2026-08-21T10:10:00'));

      const locationSnapshot = LevelEngine.getLocationSnapshot(
        [breakCandle, interactionCandle, afterCandle],
        structureSnapshot,
        asOfTime,
        'NIFTY',
        levelConfig,
      );

      const setupSnapshot = SetupEngine.getSetupSnapshot(locationSnapshot, structureSnapshot, asOfTime, 'NIFTY', setupConfig);

      const setup = setupSnapshot.getAllSetups()[0];
      expect((setup as any).score).toBeUndefined();
      expect((setup as any).confidence).toBeUndefined();
      expect((setup as any).probability).toBeUndefined();
    });
  });

  describe('No Entry/Stop/Target', () => {
    it('Setup should not have entry, stop, target, or RR fields', () => {
      const asOfTime = istTime('2026-08-21T10:10:00');

      const high = new SwingPoint('NIFTY', Timeframe.from(TimeframeValue.FIVE_MIN), SwingType.HIGH, 100, istTime('2026-08-21T09:00:00'), istTime('2026-08-21T09:00:00'), istTime('2026-08-21T09:00:00'));
      const structureState = new StructureState(StructureType.NEUTRAL, high, null, null, null);
      const structureSnapshot = new StructureSnapshot(asOfTime, [high], structureState, [], []);

      const breakCandle = createCandle('NIFTY', 99, 102, 98, 101, istTime('2026-08-21T09:55:00'), istTime('2026-08-21T10:00:00'));
      const interactionCandle = createCandle('NIFTY', 101, 102, 99.5, 100, istTime('2026-08-21T10:00:00'), istTime('2026-08-21T10:05:00'));
      const afterCandle = createCandle('NIFTY', 100, 100.5, 99.8, 100.2, istTime('2026-08-21T10:05:00'), istTime('2026-08-21T10:10:00'));

      const locationSnapshot = LevelEngine.getLocationSnapshot(
        [breakCandle, interactionCandle, afterCandle],
        structureSnapshot,
        asOfTime,
        'NIFTY',
        levelConfig,
      );

      const setupSnapshot = SetupEngine.getSetupSnapshot(locationSnapshot, structureSnapshot, asOfTime, 'NIFTY', setupConfig);

      const setup = setupSnapshot.getAllSetups()[0];
      expect((setup as any).entry).toBeUndefined();
      expect((setup as any).stop).toBeUndefined();
      expect((setup as any).target).toBeUndefined();
      expect((setup as any).riskReward).toBeUndefined();
    });
  });

  describe('PULLBACK_SHORT Qualification (Adversarial)', () => {
    it('Should create PULLBACK_SHORT setup with qualified status', () => {
      const asOfTime = istTime('2026-08-21T10:10:00');

      // Create SUPPORT level via swing low
      const low = new SwingPoint('NIFTY', Timeframe.from(TimeframeValue.FIVE_MIN), SwingType.LOW, 100, istTime('2026-08-21T09:00:00'), istTime('2026-08-21T09:00:00'), istTime('2026-08-21T09:00:00'));
      const structureState = new StructureState(StructureType.NEUTRAL, null, low, null, null);
      const structureSnapshot = new StructureSnapshot(asOfTime, [low], structureState, [], []);

      // Create candles: bearish break + interaction
      const breakCandle = createCandle('NIFTY', 101, 102, 98, 99, istTime('2026-08-21T09:55:00'), istTime('2026-08-21T10:00:00'));
      const interactionCandle = createCandle('NIFTY', 99, 100, 98.5, 99.5, istTime('2026-08-21T10:00:00'), istTime('2026-08-21T10:05:00'));
      const afterCandle = createCandle('NIFTY', 99.5, 100.5, 99, 99.8, istTime('2026-08-21T10:05:00'), istTime('2026-08-21T10:10:00'));

      const locationSnapshot = LevelEngine.getLocationSnapshot(
        [breakCandle, interactionCandle, afterCandle],
        structureSnapshot,
        asOfTime,
        'NIFTY',
        levelConfig,
      );

      const setupSnapshot = SetupEngine.getSetupSnapshot(locationSnapshot, structureSnapshot, asOfTime, 'NIFTY', setupConfig);

      const pullbackShortSetups = setupSnapshot.getAllSetups().filter(s => s.setupType === SetupType.PULLBACK_SHORT);
      expect(pullbackShortSetups.length).toBeGreaterThan(0);

      const qualified = pullbackShortSetups.filter(s => s.status === SetupStatus.QUALIFIED);
      expect(qualified.length).toBeGreaterThan(0);
      expect(qualified[0].direction).toBe('SHORT');
    });
  });

  describe('BREAKOUT_RETEST_SHORT Qualification (Adversarial)', () => {
    it('Should create BREAKOUT_RETEST_SHORT setup with qualified status', () => {
      const asOfTime = istTime('2026-08-21T10:10:00');

      const low = new SwingPoint('NIFTY', Timeframe.from(TimeframeValue.FIVE_MIN), SwingType.LOW, 100, istTime('2026-08-21T09:00:00'), istTime('2026-08-21T09:00:00'), istTime('2026-08-21T09:00:00'));
      const structureState = new StructureState(StructureType.NEUTRAL, null, low, null, null);
      const structureSnapshot = new StructureSnapshot(asOfTime, [low], structureState, [], []);

      const breakCandle = createCandle('NIFTY', 101, 102, 98, 99, istTime('2026-08-21T09:55:00'), istTime('2026-08-21T10:00:00'));
      const retestCandle = createCandle('NIFTY', 99, 100, 98.5, 99.5, istTime('2026-08-21T10:00:00'), istTime('2026-08-21T10:05:00'));
      const afterCandle = createCandle('NIFTY', 99.5, 100.5, 99, 99.8, istTime('2026-08-21T10:05:00'), istTime('2026-08-21T10:10:00'));

      const locationSnapshot = LevelEngine.getLocationSnapshot(
        [breakCandle, retestCandle, afterCandle],
        structureSnapshot,
        asOfTime,
        'NIFTY',
        levelConfig,
      );

      const setupSnapshot = SetupEngine.getSetupSnapshot(locationSnapshot, structureSnapshot, asOfTime, 'NIFTY', setupConfig);

      const retestSetups = setupSnapshot.getAllSetups().filter(s => s.setupType === SetupType.BREAKOUT_RETEST_SHORT);
      expect(retestSetups.length).toBeGreaterThan(0);
    });
  });

  describe('Setup Invalidation via Opposite Break (Adversarial)', () => {
    it('Should handle opposite breaks in setup evaluation', () => {
      const asOfTime = istTime('2026-08-21T10:20:00');

      const high = new SwingPoint('NIFTY', Timeframe.from(TimeframeValue.FIVE_MIN), SwingType.HIGH, 100, istTime('2026-08-21T09:00:00'), istTime('2026-08-21T09:00:00'), istTime('2026-08-21T09:00:00'));
      const structureState = new StructureState(StructureType.NEUTRAL, high, null, null, null);
      const structureSnapshot = new StructureSnapshot(asOfTime, [high], structureState, [], []);

      // Create a sequence with break, opposite break, and interaction
      const breakCandle = createCandle('NIFTY', 99, 102, 98, 101, istTime('2026-08-21T09:55:00'), istTime('2026-08-21T10:00:00'));
      const oppositeBreakCandle = createCandle('NIFTY', 101, 102, 98, 98.5, istTime('2026-08-21T10:00:00'), istTime('2026-08-21T10:05:00'));
      const interactionCandle = createCandle('NIFTY', 98.5, 99.5, 98, 99, istTime('2026-08-21T10:05:00'), istTime('2026-08-21T10:10:00'));
      const afterCandle = createCandle('NIFTY', 99, 99.5, 98.5, 99.2, istTime('2026-08-21T10:10:00'), istTime('2026-08-21T10:15:00'));
      const finalCandle = createCandle('NIFTY', 99.2, 99.8, 99, 99.5, istTime('2026-08-21T10:15:00'), istTime('2026-08-21T10:20:00'));

      const locationSnapshot = LevelEngine.getLocationSnapshot(
        [breakCandle, oppositeBreakCandle, interactionCandle, afterCandle, finalCandle],
        structureSnapshot,
        asOfTime,
        'NIFTY',
        levelConfig,
      );

      const setupSnapshot = SetupEngine.getSetupSnapshot(locationSnapshot, structureSnapshot, asOfTime, 'NIFTY', setupConfig);

      // Verify snapshot is valid and can categorize setups
      const all = setupSnapshot.getAllSetups();
      const invalidated = setupSnapshot.getInvalidatedSetups();
      const forming = setupSnapshot.getFormingSetups();
      const qualified = setupSnapshot.getQualifiedSetups();

      // At minimum, verify all setups are categorized
      expect(all.length).toBeGreaterThanOrEqual(invalidated.length + forming.length + qualified.length);

      // Verify snapshot accessor methods work
      all.forEach(setup => {
        expect([SetupStatus.QUALIFIED, SetupStatus.FORMING, SetupStatus.INVALIDATED]).toContain(setup.status);
      });
    });
  });

  describe('Deterministic Setup IDs (Adversarial)', () => {
    it('Same level + setupType should generate identical setup ID across replays', () => {
      const asOfTime = istTime('2026-08-21T10:10:00');

      const high = new SwingPoint('NIFTY', Timeframe.from(TimeframeValue.FIVE_MIN), SwingType.HIGH, 100, istTime('2026-08-21T09:00:00'), istTime('2026-08-21T09:00:00'), istTime('2026-08-21T09:00:00'));
      const structureState = new StructureState(StructureType.NEUTRAL, high, null, null, null);
      const structureSnapshot = new StructureSnapshot(asOfTime, [high], structureState, [], []);

      const breakCandle = createCandle('NIFTY', 99, 102, 98, 101, istTime('2026-08-21T09:55:00'), istTime('2026-08-21T10:00:00'));
      const interactionCandle = createCandle('NIFTY', 101, 102, 99.5, 100, istTime('2026-08-21T10:00:00'), istTime('2026-08-21T10:05:00'));
      const afterCandle = createCandle('NIFTY', 100, 100.5, 99.8, 100.2, istTime('2026-08-21T10:05:00'), istTime('2026-08-21T10:10:00'));

      // First run
      const locationSnapshot1 = LevelEngine.getLocationSnapshot(
        [breakCandle, interactionCandle, afterCandle],
        structureSnapshot,
        asOfTime,
        'NIFTY',
        levelConfig,
      );
      const setupSnapshot1 = SetupEngine.getSetupSnapshot(locationSnapshot1, structureSnapshot, asOfTime, 'NIFTY', setupConfig);

      // Second run (replay)
      const locationSnapshot2 = LevelEngine.getLocationSnapshot(
        [breakCandle, interactionCandle, afterCandle],
        structureSnapshot,
        asOfTime,
        'NIFTY',
        levelConfig,
      );
      const setupSnapshot2 = SetupEngine.getSetupSnapshot(locationSnapshot2, structureSnapshot, asOfTime, 'NIFTY', setupConfig);

      const setup1 = setupSnapshot1.getAllSetups()[0];
      const setup2 = setupSnapshot2.getAllSetups()[0];

      expect(setup1.setupId).toBe(setup2.setupId);
      expect(setup1.status).toBe(setup2.status);
    });
  });

  describe('Timeframe Preservation (Adversarial)', () => {
    it('Should preserve each setup\'s source timeframe independently', () => {
      const asOfTime = istTime('2026-08-21T10:10:00');

      const high = new SwingPoint('NIFTY', Timeframe.from(TimeframeValue.FIVE_MIN), SwingType.HIGH, 100, istTime('2026-08-21T09:00:00'), istTime('2026-08-21T09:00:00'), istTime('2026-08-21T09:00:00'));
      const structureState = new StructureState(StructureType.NEUTRAL, high, null, null, null);
      const structureSnapshot = new StructureSnapshot(asOfTime, [high], structureState, [], []);

      const breakCandle = createCandle('NIFTY', 99, 102, 98, 101, istTime('2026-08-21T09:55:00'), istTime('2026-08-21T10:00:00'));
      const interactionCandle = createCandle('NIFTY', 101, 102, 99.5, 100, istTime('2026-08-21T10:00:00'), istTime('2026-08-21T10:05:00'));
      const afterCandle = createCandle('NIFTY', 100, 100.5, 99.8, 100.2, istTime('2026-08-21T10:05:00'), istTime('2026-08-21T10:10:00'));

      const locationSnapshot = LevelEngine.getLocationSnapshot(
        [breakCandle, interactionCandle, afterCandle],
        structureSnapshot,
        asOfTime,
        'NIFTY',
        levelConfig,
      );

      const setupSnapshot = SetupEngine.getSetupSnapshot(locationSnapshot, structureSnapshot, asOfTime, 'NIFTY', setupConfig);

      const setups = setupSnapshot.getAllSetups();
      setups.forEach(setup => {
        expect(setup.timeframe).toBeDefined();
        expect(setup.timeframe.value).toBe('5m');
        expect(setup.geometry.sourceTimeframe.value).toBe('5m');
      });
    });
  });

  describe('Evidence Preservation (Adversarial)', () => {
    it('Should preserve complete evidence for qualified setup', () => {
      const asOfTime = istTime('2026-08-21T10:10:00');

      const high = new SwingPoint('NIFTY', Timeframe.from(TimeframeValue.FIVE_MIN), SwingType.HIGH, 100, istTime('2026-08-21T09:00:00'), istTime('2026-08-21T09:00:00'), istTime('2026-08-21T09:00:00'));
      const structureState = new StructureState(StructureType.NEUTRAL, high, null, null, null);
      const structureSnapshot = new StructureSnapshot(asOfTime, [high], structureState, [], []);

      const breakCandle = createCandle('NIFTY', 99, 102, 98, 101, istTime('2026-08-21T09:55:00'), istTime('2026-08-21T10:00:00'));
      const interactionCandle = createCandle('NIFTY', 101, 102, 99.5, 100, istTime('2026-08-21T10:00:00'), istTime('2026-08-21T10:05:00'));
      const afterCandle = createCandle('NIFTY', 100, 100.5, 99.8, 100.2, istTime('2026-08-21T10:05:00'), istTime('2026-08-21T10:10:00'));

      const locationSnapshot = LevelEngine.getLocationSnapshot(
        [breakCandle, interactionCandle, afterCandle],
        structureSnapshot,
        asOfTime,
        'NIFTY',
        levelConfig,
      );

      const setupSnapshot = SetupEngine.getSetupSnapshot(locationSnapshot, structureSnapshot, asOfTime, 'NIFTY', setupConfig);

      const qualified = setupSnapshot.getQualifiedSetups();
      expect(qualified.length).toBeGreaterThan(0);

      const setup = qualified[0];
      expect(setup.evidence).toBeDefined();
      expect(setup.evidence.breakEventId).not.toBeNull();
      expect(setup.evidence.breakEventTime).not.toBeNull();
      expect(setup.evidence.breakDirection).not.toBeNull();
      expect(setup.evidence.interactionEventId).not.toBeNull();
      expect(setup.evidence.interactionEventTime).not.toBeNull();
    });
  });

  describe('Look-Ahead Safety: Historical Stability (Adversarial)', () => {
    it('Snapshot at T should remain unchanged when future events appended', () => {
      const t1 = istTime('2026-08-21T10:00:00');
      const t2 = istTime('2026-08-21T10:05:00');

      const high = new SwingPoint('NIFTY', Timeframe.from(TimeframeValue.FIVE_MIN), SwingType.HIGH, 100, istTime('2026-08-21T09:00:00'), istTime('2026-08-21T09:00:00'), istTime('2026-08-21T09:00:00'));
      const structureState = new StructureState(StructureType.NEUTRAL, high, null, null, null);
      const structureSnapshot = new StructureSnapshot(t1, [high], structureState, [], []);

      const breakCandle = createCandle('NIFTY', 99, 102, 98, 101, istTime('2026-08-21T09:55:00'), t1);

      // Snapshot at T1 (only break, no interaction)
      const locationSnapshot1 = LevelEngine.getLocationSnapshot([breakCandle], structureSnapshot, t1, 'NIFTY', levelConfig);
      const setupSnapshot1 = SetupEngine.getSetupSnapshot(locationSnapshot1, structureSnapshot, t1, 'NIFTY', setupConfig);

      const status1 = setupSnapshot1.getFormingSetups().length > 0 ? SetupStatus.FORMING : null;

      // Now evaluate with future interaction at T2
      const interactionCandle = createCandle('NIFTY', 101, 102, 99.5, 100, istTime('2026-08-21T10:00:00'), t2);
      const locationSnapshot2 = LevelEngine.getLocationSnapshot([breakCandle, interactionCandle], structureSnapshot, t2, 'NIFTY', levelConfig);
      const setupSnapshot2 = SetupEngine.getSetupSnapshot(locationSnapshot2, structureSnapshot, t2, 'NIFTY', setupConfig);

      const status2 = setupSnapshot2.getQualifiedSetups().length > 0 ? SetupStatus.QUALIFIED : (setupSnapshot2.getFormingSetups().length > 0 ? SetupStatus.FORMING : null);

      // At T1, should still be FORMING (no qualified yet)
      expect(status1).toBe(SetupStatus.FORMING);
      // At T2, should have qualified
      expect(status2).toBe(SetupStatus.QUALIFIED);
    });
  });

  describe('Setup Snapshot Immutability (Adversarial)', () => {
    it('SetupSnapshot should reject mutation attempts', () => {
      const asOfTime = istTime('2026-08-21T10:10:00');

      const high = new SwingPoint('NIFTY', Timeframe.from(TimeframeValue.FIVE_MIN), SwingType.HIGH, 100, istTime('2026-08-21T09:00:00'), istTime('2026-08-21T09:00:00'), istTime('2026-08-21T09:00:00'));
      const structureState = new StructureState(StructureType.NEUTRAL, high, null, null, null);
      const structureSnapshot = new StructureSnapshot(asOfTime, [high], structureState, [], []);

      const breakCandle = createCandle('NIFTY', 99, 102, 98, 101, istTime('2026-08-21T09:55:00'), istTime('2026-08-21T10:00:00'));
      const interactionCandle = createCandle('NIFTY', 101, 102, 99.5, 100, istTime('2026-08-21T10:00:00'), istTime('2026-08-21T10:05:00'));
      const afterCandle = createCandle('NIFTY', 100, 100.5, 99.8, 100.2, istTime('2026-08-21T10:05:00'), istTime('2026-08-21T10:10:00'));

      const locationSnapshot = LevelEngine.getLocationSnapshot(
        [breakCandle, interactionCandle, afterCandle],
        structureSnapshot,
        asOfTime,
        'NIFTY',
        levelConfig,
      );

      const setupSnapshot = SetupEngine.getSetupSnapshot(locationSnapshot, structureSnapshot, asOfTime, 'NIFTY', setupConfig);

      expect(() => {
        (setupSnapshot as any).asOfTimeUTC = new Date();
      }).toThrow();
    });
  });

  describe('No Confidence/Probability Fields (Adversarial)', () => {
    it('Setup should have zero predictive scoring fields', () => {
      const asOfTime = istTime('2026-08-21T10:10:00');

      const high = new SwingPoint('NIFTY', Timeframe.from(TimeframeValue.FIVE_MIN), SwingType.HIGH, 100, istTime('2026-08-21T09:00:00'), istTime('2026-08-21T09:00:00'), istTime('2026-08-21T09:00:00'));
      const structureState = new StructureState(StructureType.NEUTRAL, high, null, null, null);
      const structureSnapshot = new StructureSnapshot(asOfTime, [high], structureState, [], []);

      const breakCandle = createCandle('NIFTY', 99, 102, 98, 101, istTime('2026-08-21T09:55:00'), istTime('2026-08-21T10:00:00'));
      const interactionCandle = createCandle('NIFTY', 101, 102, 99.5, 100, istTime('2026-08-21T10:00:00'), istTime('2026-08-21T10:05:00'));
      const afterCandle = createCandle('NIFTY', 100, 100.5, 99.8, 100.2, istTime('2026-08-21T10:05:00'), istTime('2026-08-21T10:10:00'));

      const locationSnapshot = LevelEngine.getLocationSnapshot(
        [breakCandle, interactionCandle, afterCandle],
        structureSnapshot,
        asOfTime,
        'NIFTY',
        levelConfig,
      );

      const setupSnapshot = SetupEngine.getSetupSnapshot(locationSnapshot, structureSnapshot, asOfTime, 'NIFTY', setupConfig);

      const setup = setupSnapshot.getAllSetups()[0];
      const keys = Object.keys(setup);

      const forbiddenKeys = ['confidence', 'probability', 'winRate', 'score', 'strength', 'expectancy', 'prediction'];
      forbiddenKeys.forEach(key => {
        expect(keys).not.toContain(key);
      });
    });
  });

  describe('Setup Status Snapshot Accessor Methods (Adversarial)', () => {
    it('Should correctly filter setups by status', () => {
      const asOfTime = istTime('2026-08-21T10:10:00');

      const high = new SwingPoint('NIFTY', Timeframe.from(TimeframeValue.FIVE_MIN), SwingType.HIGH, 100, istTime('2026-08-21T09:00:00'), istTime('2026-08-21T09:00:00'), istTime('2026-08-21T09:00:00'));
      const structureState = new StructureState(StructureType.NEUTRAL, high, null, null, null);
      const structureSnapshot = new StructureSnapshot(asOfTime, [high], structureState, [], []);

      const breakCandle = createCandle('NIFTY', 99, 102, 98, 101, istTime('2026-08-21T09:55:00'), istTime('2026-08-21T10:00:00'));
      const interactionCandle = createCandle('NIFTY', 101, 102, 99.5, 100, istTime('2026-08-21T10:00:00'), istTime('2026-08-21T10:05:00'));
      const afterCandle = createCandle('NIFTY', 100, 100.5, 99.8, 100.2, istTime('2026-08-21T10:05:00'), istTime('2026-08-21T10:10:00'));

      const locationSnapshot = LevelEngine.getLocationSnapshot(
        [breakCandle, interactionCandle, afterCandle],
        structureSnapshot,
        asOfTime,
        'NIFTY',
        levelConfig,
      );

      const setupSnapshot = SetupEngine.getSetupSnapshot(locationSnapshot, structureSnapshot, asOfTime, 'NIFTY', setupConfig);

      // Verify accessor methods work
      const all = setupSnapshot.getAllSetups();
      const qualified = setupSnapshot.getQualifiedSetups();
      const forming = setupSnapshot.getFormingSetups();
      const invalidated = setupSnapshot.getInvalidatedSetups();

      // All setups should be classified
      const total = qualified.length + forming.length + invalidated.length;
      expect(all.length).toBe(total);

      // Each setup should have exactly one status
      all.forEach(setup => {
        const statusCount = [
          setup.status === SetupStatus.QUALIFIED ? 1 : 0,
          setup.status === SetupStatus.FORMING ? 1 : 0,
          setup.status === SetupStatus.INVALIDATED ? 1 : 0,
        ].reduce((a, b) => a + b, 0);
        expect(statusCount).toBe(1);
      });
    });
  });
});
