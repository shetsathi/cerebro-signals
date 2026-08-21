import { Candle, CandleStatus, CandleOHLC } from '../domain/candle';
import { Timeframe, TimeframeValue } from '../domain/timeframe';
import { TriggerEngine, TriggerEngineConfig } from '../domain/trigger-engine';
import { TriggerSnapshot } from '../domain/trigger-snapshot';
import { TriggerType } from '../domain/trigger';
import { Setup, SetupType, SetupStatus, SetupEvidence, SetupGeometry } from '../domain/setup';
import { SetupSnapshot } from '../domain/setup-snapshot';
import { Level, LevelPolarity, LevelOrigin } from '../domain/level';
import { LocationSnapshot, DataSufficiency, PolarityState } from '../domain/location-snapshot';
import { LevelEvent, LevelEventType, BreakMechanism } from '../domain/level-event';

describe('Part 7 — Trigger Engine', () => {
  const config: TriggerEngineConfig = {
    rulesetVersion: 'v1.0',
    configHash: 'hash123',
  };

  const symbol = 'NIFTY';
  const baseTime = new Date('2026-08-22T10:00:00Z');
  const timeframe5m = Timeframe.from(TimeframeValue.FIVE_MIN);

  function createCandle(
    status: CandleStatus,
    open: number,
    high: number,
    low: number,
    close: number,
    timeUTC: Date = baseTime,
  ): Candle {
    return new Candle(
      symbol,
      timeframe5m,
      timeUTC,
      new Date(timeUTC.getTime() + 5 * 60 * 1000),
      { open, high, low, close, volume: 1000 } as CandleOHLC,
      status,
      timeUTC,
    );
  }

  function createLevel(
    levelId: string,
    polarity: LevelPolarity,
    price: number,
    eventTime: Date = baseTime,
  ): Level {
    return new Level(
      levelId,
      symbol,
      timeframe5m,
      LevelOrigin.CONFIRMED_SWING,
      polarity,
      price,
      eventTime,
      eventTime,
      'v1.0',
      'hash123',
    );
  }

  function createPullbackLongSetup(
    setupId: string = 'setup-pb-long-1',
    status: SetupStatus = SetupStatus.QUALIFIED,
    qualifiedAt: Date = baseTime,
  ): Setup {
    const evidence: SetupEvidence = {
      sourceLevelId: 'level-100',
      sourceLevelPrice: 100,
      sourceLevelOrigin: 'CONFIRMED_SWING',
      sourceLevelPolarity: 'RESISTANCE',
      breakEventId: 'event-break-1',
      breakEventTime: new Date(baseTime.getTime() - 60 * 1000),
      breakDirection: 'bullish',
      breakMechanism: 'TRADED',
      flippedPolarity: 'SUPPORT',
      flippedPolarityTime: new Date(baseTime.getTime() - 60 * 1000),
      interactionEventId: 'event-interaction-1',
      interactionEventTime: qualifiedAt,
      interactionType: 'INTERACTION',
      invalidatingBreakEventId: null,
      invalidatingBreakTime: null,
    };

    const geometry: SetupGeometry = {
      sourceTimeframe: timeframe5m,
      sourceLevelPrice: 100,
      flippedLevelPrice: 100,
      currentTimeframeValue: '5m',
    };

    return new Setup(
      setupId,
      symbol,
      SetupType.PULLBACK_LONG,
      'LONG',
      status,
      timeframe5m,
      new Date(baseTime.getTime() - 120 * 1000),
      new Date(baseTime.getTime() - 60 * 1000),
      status === SetupStatus.QUALIFIED ? qualifiedAt : null,
      status === SetupStatus.INVALIDATED ? baseTime : null,
      status === SetupStatus.INVALIDATED ? 'OPPOSITE_BREAK' : null,
      null,
      qualifiedAt,
      baseTime,
      'level-100',
      evidence,
      geometry,
      'v1.0',
      'hash123',
    );
  }

  function createBreakoutRetestLongSetup(
    setupId: string = 'setup-br-long-1',
    status: SetupStatus = SetupStatus.QUALIFIED,
    qualifiedAt: Date = baseTime,
  ): Setup {
    const evidence: SetupEvidence = {
      sourceLevelId: 'level-100',
      sourceLevelPrice: 100,
      sourceLevelOrigin: 'CONFIRMED_SWING',
      sourceLevelPolarity: 'RESISTANCE',
      breakEventId: 'event-break-1',
      breakEventTime: new Date(baseTime.getTime() - 60 * 1000),
      breakDirection: 'bullish',
      breakMechanism: 'TRADED',
      flippedPolarity: 'SUPPORT',
      flippedPolarityTime: new Date(baseTime.getTime() - 60 * 1000),
      interactionEventId: 'event-retest-1',
      interactionEventTime: qualifiedAt,
      interactionType: 'RETEST_INTERACTION',
      invalidatingBreakEventId: null,
      invalidatingBreakTime: null,
    };

    const geometry: SetupGeometry = {
      sourceTimeframe: timeframe5m,
      sourceLevelPrice: 100,
      flippedLevelPrice: 100,
      currentTimeframeValue: '5m',
    };

    return new Setup(
      setupId,
      symbol,
      SetupType.BREAKOUT_RETEST_LONG,
      'LONG',
      status,
      timeframe5m,
      new Date(baseTime.getTime() - 120 * 1000),
      new Date(baseTime.getTime() - 60 * 1000),
      status === SetupStatus.QUALIFIED ? qualifiedAt : null,
      status === SetupStatus.INVALIDATED ? baseTime : null,
      status === SetupStatus.INVALIDATED ? 'OPPOSITE_BREAK' : null,
      null,
      qualifiedAt,
      baseTime,
      'level-100',
      evidence,
      geometry,
      'v1.0',
      'hash123',
    );
  }

  function createPullbackShortSetup(
    setupId: string = 'setup-pb-short-1',
    status: SetupStatus = SetupStatus.QUALIFIED,
    qualifiedAt: Date = baseTime,
  ): Setup {
    const evidence: SetupEvidence = {
      sourceLevelId: 'level-100',
      sourceLevelPrice: 100,
      sourceLevelOrigin: 'CONFIRMED_SWING',
      sourceLevelPolarity: 'SUPPORT',
      breakEventId: 'event-break-1',
      breakEventTime: new Date(baseTime.getTime() - 60 * 1000),
      breakDirection: 'bearish',
      breakMechanism: 'TRADED',
      flippedPolarity: 'RESISTANCE',
      flippedPolarityTime: new Date(baseTime.getTime() - 60 * 1000),
      interactionEventId: 'event-interaction-1',
      interactionEventTime: qualifiedAt,
      interactionType: 'INTERACTION',
      invalidatingBreakEventId: null,
      invalidatingBreakTime: null,
    };

    const geometry: SetupGeometry = {
      sourceTimeframe: timeframe5m,
      sourceLevelPrice: 100,
      flippedLevelPrice: 100,
      currentTimeframeValue: '5m',
    };

    return new Setup(
      setupId,
      symbol,
      SetupType.PULLBACK_SHORT,
      'SHORT',
      status,
      timeframe5m,
      new Date(baseTime.getTime() - 120 * 1000),
      new Date(baseTime.getTime() - 60 * 1000),
      status === SetupStatus.QUALIFIED ? qualifiedAt : null,
      status === SetupStatus.INVALIDATED ? baseTime : null,
      status === SetupStatus.INVALIDATED ? 'OPPOSITE_BREAK' : null,
      null,
      qualifiedAt,
      baseTime,
      'level-100',
      evidence,
      geometry,
      'v1.0',
      'hash123',
    );
  }

  function createLocationSnapshot(levels: Level[], events: LevelEvent[] = []): LocationSnapshot {
    const polarityStates = new Map<string, PolarityState>();
    for (const level of levels) {
      polarityStates.set(level.levelId, {
        currentPolarity: level.polarity,
        brokeAt: new Date(baseTime.getTime() - 60 * 1000),
        breakMechanism: 'TRADED',
      });
    }

    return new LocationSnapshot(
      symbol,
      baseTime,
      baseTime,
      DataSufficiency.SUFFICIENT,
      false,
      'v1.0',
      'hash123',
      levels,
      events,
      new Map(),
      new Map(),
      polarityStates,
    );
  }

  describe('Setup Gating', () => {
    it('should not create trigger without qualified setup', () => {
      const setupSnapshot = new SetupSnapshot(symbol, baseTime, baseTime, 'v1.0', 'hash123', []);
      const locationSnapshot = createLocationSnapshot([]);
      const candleAboveLevel = createCandle(CandleStatus.CLOSED, 99, 101, 99, 101);

      const triggerSnapshot = TriggerEngine.getTriggerSnapshot(
        setupSnapshot,
        locationSnapshot,
        candleAboveLevel,
        baseTime,
        config,
      );

      expect(triggerSnapshot.getAllTriggers().length).toBe(0);
    });

    it('should create trigger for qualified setup with matching price action', () => {
      const setup = createPullbackLongSetup();
      const setupSnapshot = new SetupSnapshot(symbol, baseTime, baseTime, 'v1.0', 'hash123', [setup]);
      const level = createLevel('level-100', LevelPolarity.SUPPORT, 100);
      const locationSnapshot = createLocationSnapshot([level]);
      const candleAboveLevel = createCandle(CandleStatus.CLOSED, 99, 102, 99, 101); // Closed above 100

      const triggerSnapshot = TriggerEngine.getTriggerSnapshot(
        setupSnapshot,
        locationSnapshot,
        candleAboveLevel,
        baseTime,
        config,
      );

      expect(triggerSnapshot.getAllTriggers().length).toBe(1);
      const trigger = triggerSnapshot.getAllTriggers()[0];
      expect(trigger.triggerType).toBe(TriggerType.BULLISH_RECLAIM);
      expect(trigger.setupId).toBe('setup-pb-long-1');
    });

    it('should not trigger from random breakout without setup', () => {
      const setupSnapshot = new SetupSnapshot(symbol, baseTime, baseTime, 'v1.0', 'hash123', []);
      const level = createLevel('level-random', LevelPolarity.SUPPORT, 100);
      const locationSnapshot = createLocationSnapshot([level]);
      const candleAboveLevel = createCandle(CandleStatus.CLOSED, 99, 102, 99, 101);

      const triggerSnapshot = TriggerEngine.getTriggerSnapshot(
        setupSnapshot,
        locationSnapshot,
        candleAboveLevel,
        baseTime,
        config,
      );

      expect(triggerSnapshot.getAllTriggers().length).toBe(0);
    });
  });

  describe('Direction Matching', () => {
    it('should not trigger LONG setup with bearish price action', () => {
      const setup = createPullbackLongSetup();
      const setupSnapshot = new SetupSnapshot(symbol, baseTime, baseTime, 'v1.0', 'hash123', [setup]);
      const level = createLevel('level-100', LevelPolarity.SUPPORT, 100);
      const locationSnapshot = createLocationSnapshot([level]);
      const candleBelowLevel = createCandle(CandleStatus.CLOSED, 101, 102, 98, 99); // Closed below 100

      const triggerSnapshot = TriggerEngine.getTriggerSnapshot(
        setupSnapshot,
        locationSnapshot,
        candleBelowLevel,
        baseTime,
        config,
      );

      expect(triggerSnapshot.getAllTriggers().length).toBe(0);
    });

    it('should trigger SHORT setup only with bearish price action', () => {
      const shortSetup = new Setup(
        'setup-pb-short-1',
        symbol,
        SetupType.PULLBACK_SHORT,
        'SHORT',
        SetupStatus.QUALIFIED,
        timeframe5m,
        new Date(baseTime.getTime() - 120 * 1000),
        new Date(baseTime.getTime() - 60 * 1000),
        baseTime,
        null,
        null,
        null,
        baseTime,
        baseTime,
        'level-100',
        {
          sourceLevelId: 'level-100',
          sourceLevelPrice: 100,
          sourceLevelOrigin: 'CONFIRMED_SWING',
          sourceLevelPolarity: 'SUPPORT',
          breakEventId: 'event-break-1',
          breakEventTime: new Date(baseTime.getTime() - 60 * 1000),
          breakDirection: 'bearish',
          breakMechanism: 'TRADED',
          flippedPolarity: 'RESISTANCE',
          flippedPolarityTime: new Date(baseTime.getTime() - 60 * 1000),
          interactionEventId: 'event-interaction-1',
          interactionEventTime: baseTime,
          interactionType: 'INTERACTION',
          invalidatingBreakEventId: null,
          invalidatingBreakTime: null,
        },
        { sourceTimeframe: timeframe5m, sourceLevelPrice: 100, flippedLevelPrice: 100, currentTimeframeValue: '5m' },
        'v1.0',
        'hash123',
      );

      const setupSnapshot = new SetupSnapshot(symbol, baseTime, baseTime, 'v1.0', 'hash123', [shortSetup]);
      const level = createLevel('level-100', LevelPolarity.RESISTANCE, 100);
      const locationSnapshot = createLocationSnapshot([level]);
      const candleBelowLevel = createCandle(CandleStatus.CLOSED, 101, 102, 98, 99); // Closed below 100

      const triggerSnapshot = TriggerEngine.getTriggerSnapshot(
        setupSnapshot,
        locationSnapshot,
        candleBelowLevel,
        baseTime,
        config,
      );

      expect(triggerSnapshot.getAllTriggers().length).toBe(1);
      expect(triggerSnapshot.getAllTriggers()[0].triggerType).toBe(TriggerType.BEARISH_RECLAIM);
    });
  });

  describe('Closed Candle Enforcement', () => {
    it('should not create trigger on developing candle', () => {
      const setup = createPullbackLongSetup();
      const setupSnapshot = new SetupSnapshot(symbol, baseTime, baseTime, 'v1.0', 'hash123', [setup]);
      const level = createLevel('level-100', LevelPolarity.SUPPORT, 100);
      const locationSnapshot = createLocationSnapshot([level]);
      const developingCandle = createCandle(CandleStatus.DEVELOPING, 99, 102, 99, 101);

      const triggerSnapshot = TriggerEngine.getTriggerSnapshot(
        setupSnapshot,
        locationSnapshot,
        developingCandle,
        baseTime,
        config,
      );

      expect(triggerSnapshot.getAllTriggers().length).toBe(0);
    });

    it('should not trigger on wick breach with close back across level', () => {
      const setup = createPullbackLongSetup();
      const setupSnapshot = new SetupSnapshot(symbol, baseTime, baseTime, 'v1.0', 'hash123', [setup]);
      const level = createLevel('level-100', LevelPolarity.SUPPORT, 100);
      const locationSnapshot = createLocationSnapshot([level]);
      // High breaches above 100, but close is below 100 (wick rejection)
      const wickRejectionCandle = createCandle(CandleStatus.CLOSED, 99, 105, 99, 99.5);

      const triggerSnapshot = TriggerEngine.getTriggerSnapshot(
        setupSnapshot,
        locationSnapshot,
        wickRejectionCandle,
        baseTime,
        config,
      );

      expect(triggerSnapshot.getAllTriggers().length).toBe(0);
    });

    it('should trigger only on valid closed confirmation', () => {
      const setup = createPullbackLongSetup();
      const setupSnapshot = new SetupSnapshot(symbol, baseTime, baseTime, 'v1.0', 'hash123', [setup]);
      const level = createLevel('level-100', LevelPolarity.SUPPORT, 100);
      const locationSnapshot = createLocationSnapshot([level]);
      // Close above level confirms bullish reclaim
      const validConfirmationCandle = createCandle(CandleStatus.CLOSED, 99, 105, 99, 100.5);

      const triggerSnapshot = TriggerEngine.getTriggerSnapshot(
        setupSnapshot,
        locationSnapshot,
        validConfirmationCandle,
        baseTime,
        config,
      );

      expect(triggerSnapshot.getAllTriggers().length).toBe(1);
    });
  });

  describe('Invalidation Handling', () => {
    it('should not create trigger for invalidated setup', () => {
      const invalidatedSetup = createPullbackLongSetup('setup-pb-long-invalid', SetupStatus.INVALIDATED);
      const setupSnapshot = new SetupSnapshot(symbol, baseTime, baseTime, 'v1.0', 'hash123', [invalidatedSetup]);
      const level = createLevel('level-100', LevelPolarity.SUPPORT, 100);
      const locationSnapshot = createLocationSnapshot([level]);
      const candleAboveLevel = createCandle(CandleStatus.CLOSED, 99, 102, 99, 101);

      const triggerSnapshot = TriggerEngine.getTriggerSnapshot(
        setupSnapshot,
        locationSnapshot,
        candleAboveLevel,
        baseTime,
        config,
      );

      expect(triggerSnapshot.getAllTriggers().length).toBe(0);
    });

    it('should not resurrect invalidated setup with later favorable movement', () => {
      const invalidatedSetup = createPullbackLongSetup('setup-pb-long-invalid', SetupStatus.INVALIDATED);
      const setupSnapshot = new SetupSnapshot(symbol, baseTime, baseTime, 'v1.0', 'hash123', [invalidatedSetup]);
      const level = createLevel('level-100', LevelPolarity.SUPPORT, 100);
      const locationSnapshot = createLocationSnapshot([level]);
      const laterBullishCandle = createCandle(CandleStatus.CLOSED, 100, 110, 100, 105);

      const triggerSnapshot = TriggerEngine.getTriggerSnapshot(
        setupSnapshot,
        locationSnapshot,
        laterBullishCandle,
        baseTime,
        config,
      );

      expect(triggerSnapshot.getAllTriggers().length).toBe(0);
    });
  });

  describe('Trigger Types', () => {
    it('should create BULLISH_RECLAIM trigger for PULLBACK_LONG', () => {
      const setup = createPullbackLongSetup();
      const setupSnapshot = new SetupSnapshot(symbol, baseTime, baseTime, 'v1.0', 'hash123', [setup]);
      const level = createLevel('level-100', LevelPolarity.SUPPORT, 100);
      const locationSnapshot = createLocationSnapshot([level]);
      const candleAboveLevel = createCandle(CandleStatus.CLOSED, 99, 102, 99, 100.5);

      const triggerSnapshot = TriggerEngine.getTriggerSnapshot(
        setupSnapshot,
        locationSnapshot,
        candleAboveLevel,
        baseTime,
        config,
      );

      const trigger = triggerSnapshot.getAllTriggers()[0];
      expect(trigger.triggerType).toBe(TriggerType.BULLISH_RECLAIM);
      expect(trigger.direction).toBe('LONG');
    });

    it('should create BEARISH_RECLAIM trigger for PULLBACK_SHORT', () => {
      const setup = new Setup(
        'setup-pb-short-1',
        symbol,
        SetupType.PULLBACK_SHORT,
        'SHORT',
        SetupStatus.QUALIFIED,
        timeframe5m,
        new Date(baseTime.getTime() - 120 * 1000),
        new Date(baseTime.getTime() - 60 * 1000),
        baseTime,
        null,
        null,
        null,
        baseTime,
        baseTime,
        'level-100',
        {
          sourceLevelId: 'level-100',
          sourceLevelPrice: 100,
          sourceLevelOrigin: 'CONFIRMED_SWING',
          sourceLevelPolarity: 'SUPPORT',
          breakEventId: 'event-break-1',
          breakEventTime: new Date(baseTime.getTime() - 60 * 1000),
          breakDirection: 'bearish',
          breakMechanism: 'TRADED',
          flippedPolarity: 'RESISTANCE',
          flippedPolarityTime: new Date(baseTime.getTime() - 60 * 1000),
          interactionEventId: 'event-interaction-1',
          interactionEventTime: baseTime,
          interactionType: 'INTERACTION',
          invalidatingBreakEventId: null,
          invalidatingBreakTime: null,
        },
        { sourceTimeframe: timeframe5m, sourceLevelPrice: 100, flippedLevelPrice: 100, currentTimeframeValue: '5m' },
        'v1.0',
        'hash123',
      );

      const setupSnapshot = new SetupSnapshot(symbol, baseTime, baseTime, 'v1.0', 'hash123', [setup]);
      const level = createLevel('level-100', LevelPolarity.RESISTANCE, 100);
      const locationSnapshot = createLocationSnapshot([level]);
      const candleBelowLevel = createCandle(CandleStatus.CLOSED, 101, 102, 98, 99.5);

      const triggerSnapshot = TriggerEngine.getTriggerSnapshot(
        setupSnapshot,
        locationSnapshot,
        candleBelowLevel,
        baseTime,
        config,
      );

      const trigger = triggerSnapshot.getAllTriggers()[0];
      expect(trigger.triggerType).toBe(TriggerType.BEARISH_RECLAIM);
      expect(trigger.direction).toBe('SHORT');
    });
  });

  describe('Determinism', () => {
    it('should produce identical results for identical inputs', () => {
      const setup = createPullbackLongSetup();
      const setupSnapshot = new SetupSnapshot(symbol, baseTime, baseTime, 'v1.0', 'hash123', [setup]);
      const level = createLevel('level-100', LevelPolarity.SUPPORT, 100);
      const locationSnapshot = createLocationSnapshot([level]);
      const candle = createCandle(CandleStatus.CLOSED, 99, 102, 99, 101);

      const result1 = TriggerEngine.getTriggerSnapshot(setupSnapshot, locationSnapshot, candle, baseTime, config);
      const result2 = TriggerEngine.getTriggerSnapshot(setupSnapshot, locationSnapshot, candle, baseTime, config);

      expect(result1.getAllTriggers().length).toBe(result2.getAllTriggers().length);
      if (result1.getAllTriggers().length > 0) {
        const t1 = result1.getAllTriggers()[0];
        const t2 = result2.getAllTriggers()[0];
        expect(t1.triggerId).toBe(t2.triggerId);
        expect(t1.confirmationClose).toBe(t2.confirmationClose);
        expect(t1.triggerType).toBe(t2.triggerType);
      }
    });
  });

  describe('Immutability', () => {
    it('should return sealed trigger snapshot', () => {
      const setup = createPullbackLongSetup();
      const setupSnapshot = new SetupSnapshot(symbol, baseTime, baseTime, 'v1.0', 'hash123', [setup]);
      const level = createLevel('level-100', LevelPolarity.SUPPORT, 100);
      const locationSnapshot = createLocationSnapshot([level]);
      const candle = createCandle(CandleStatus.CLOSED, 99, 102, 99, 101);

      const triggerSnapshot = TriggerEngine.getTriggerSnapshot(setupSnapshot, locationSnapshot, candle, baseTime, config);

      expect(triggerSnapshot.isSealed()).toBe(true);
      expect(() => {
        (triggerSnapshot as any).symbol = 'MODIFIED';
      }).toThrow();
    });

    it('should preserve upstream snapshots', () => {
      const setup = createPullbackLongSetup();
      const setupSnapshot = new SetupSnapshot(symbol, baseTime, baseTime, 'v1.0', 'hash123', [setup]);
      const level = createLevel('level-100', LevelPolarity.SUPPORT, 100);
      const locationSnapshot = createLocationSnapshot([level]);
      const candle = createCandle(CandleStatus.CLOSED, 99, 102, 99, 101);

      const setupSnapshotBefore = setupSnapshot.getAllSetups();
      TriggerEngine.getTriggerSnapshot(setupSnapshot, locationSnapshot, candle, baseTime, config);
      const setupSnapshotAfter = setupSnapshot.getAllSetups();

      expect(setupSnapshotBefore.length).toBe(setupSnapshotAfter.length);
      expect(setupSnapshotBefore[0].status).toBe(setupSnapshotAfter[0].status);
    });
  });

  describe('Causality / No Look-Ahead', () => {
    it('should throw error if candle knowledge time exceeds evaluation time', () => {
      const setup = createPullbackLongSetup();
      const setupSnapshot = new SetupSnapshot(symbol, baseTime, baseTime, 'v1.0', 'hash123', [setup]);
      const level = createLevel('level-100', LevelPolarity.SUPPORT, 100);
      const locationSnapshot = createLocationSnapshot([level]);
      // Candle's knowledge time is in the future
      const futureCandle = new Candle(
        symbol,
        timeframe5m,
        baseTime,
        new Date(baseTime.getTime() + 5 * 60 * 1000),
        { open: 99, high: 102, low: 99, close: 101, volume: 1000 },
        CandleStatus.CLOSED,
        new Date(baseTime.getTime() + 60 * 1000), // Future knowledge time
      );

      expect(() => {
        TriggerEngine.getTriggerSnapshot(setupSnapshot, locationSnapshot, futureCandle, baseTime, config);
      }).toThrow('Look-ahead violation');
    });
  });

  describe('Retest Defense — Option 4 Regression Tests', () => {
    /**
     * REGRESSION TEST A: Valid Retest
     * T1: bullish break
     * T2: retest interaction
     * T3: valid bullish confirmation
     * Expected: BULLISH_BREAKOUT trigger fires
     */
    it('should trigger BULLISH_BREAKOUT when retest is defended (Test A)', () => {
      const t1 = baseTime;
      const t2 = new Date(t1.getTime() + 5 * 60 * 1000);
      const t3 = new Date(t2.getTime() + 5 * 60 * 1000);

      const level = createLevel('level-100', LevelPolarity.RESISTANCE, 100, t1);

      // T1: Initial break event (bullish)
      const breakEvent = new LevelEvent(
        'break-1',
        'level-100',
        LevelEventType.BREAK,
        timeframe5m,
        t1,
        t1,
        'bullish',
        BreakMechanism.TRADED,
      );

      // T2: Retest interaction event (polarity now SUPPORT after break)
      const retestEvent = new LevelEvent(
        'retest-1',
        'level-100',
        LevelEventType.RETEST_INTERACTION,
        timeframe5m,
        t2,
        t2,
        'bullish',
      );

      const locationSnapshot = new LocationSnapshot(
        symbol,
        t3,
        t3,
        DataSufficiency.SUFFICIENT,
        false,
        'v1.0',
        'hash123',
        [level],
        [breakEvent, retestEvent],
        new Map([['5m', [level]]]),
        new Map(),
        new Map([['level-100', { currentPolarity: LevelPolarity.SUPPORT, brokeAt: t1 }]]),
      );

      const setup = createBreakoutRetestLongSetup('setup-br-1');
      setup.evidence.interactionEventTime = t2; // Set retest time
      const setupSnapshot = new SetupSnapshot(symbol, t3, t3, 'v1.0', 'hash123', [setup]);

      // T3: Bullish confirmation candle closes above resistance
      const bullishConfirmCandle = createCandle(CandleStatus.CLOSED, 100, 105, 100, 105, t3);

      const triggerSnapshot = TriggerEngine.getTriggerSnapshot(
        setupSnapshot,
        locationSnapshot,
        bullishConfirmCandle,
        t3,
        config,
      );

      expect(triggerSnapshot.getAllTriggers().length).toBe(1);
      expect(triggerSnapshot.getAllTriggers()[0].triggerType).toBe(TriggerType.BULLISH_BREAKOUT);
    });

    /**
     * REGRESSION TEST B: Failed Retest (CRITICAL)
     * T1: bullish break
     * T2: retest interaction
     * T3: bearish break through flipped support (retest fails)
     * T4: close above original resistance
     * Expected: NO TRIGGER (retest was broken)
     */
    it('should NOT trigger when retest is broken after qualification (Test B)', () => {
      const t1 = baseTime;
      const t2 = new Date(t1.getTime() + 5 * 60 * 1000);
      const t3 = new Date(t2.getTime() + 5 * 60 * 1000);
      const t4 = new Date(t3.getTime() + 5 * 60 * 1000);

      const level = createLevel('level-100', LevelPolarity.RESISTANCE, 100, t1);

      // T1: Initial break event (bullish)
      const breakEvent = new LevelEvent(
        'break-1',
        'level-100',
        LevelEventType.BREAK,
        timeframe5m,
        t1,
        t1,
        'bullish',
        BreakMechanism.TRADED,
      );

      // T2: Retest interaction event
      const retestEvent = new LevelEvent(
        'retest-1',
        'level-100',
        LevelEventType.RETEST_INTERACTION,
        timeframe5m,
        t2,
        t2,
        'bullish',
      );

      // T3: BEARISH BREAK — price closes below support (retest fails)
      const failedRetestBreakEvent = new LevelEvent(
        'break-2-failed-retest',
        'level-100',
        LevelEventType.BREAK,
        timeframe5m,
        t3,
        t3,
        'bearish',
        BreakMechanism.TRADED,
      );

      const locationSnapshot = new LocationSnapshot(
        symbol,
        t4,
        t4,
        DataSufficiency.SUFFICIENT,
        false,
        'v1.0',
        'hash123',
        [level],
        [breakEvent, retestEvent, failedRetestBreakEvent],
        new Map([['5m', [level]]]),
        new Map(),
        new Map([['level-100', { currentPolarity: LevelPolarity.SUPPORT, brokeAt: t1 }]]),
      );

      const setup = createBreakoutRetestLongSetup('setup-br-2');
      setup.evidence.interactionEventTime = t2; // Retest time
      const setupSnapshot = new SetupSnapshot(symbol, t4, t4, 'v1.0', 'hash123', [setup]);

      // T4: Later candle tries to trigger (close above old resistance)
      const laterBullishCandle = createCandle(CandleStatus.CLOSED, 100, 108, 100, 105, t4);

      const triggerSnapshot = TriggerEngine.getTriggerSnapshot(
        setupSnapshot,
        locationSnapshot,
        laterBullishCandle,
        t4,
        config,
      );

      // Critical: Should NOT trigger because retest was broken at T3
      expect(triggerSnapshot.getAllTriggers().length).toBe(0);
    });

    /**
     * REGRESSION TEST C: Failed Retest Does Not Resurrect
     * T1: bullish break
     * T2: retest interaction → setup qualifies
     * T3: bearish break (retest fails)
     * T4: setup still exists as QUALIFIED in snapshot (Part 6 doesn't re-invalidate)
     * T5: price recovers above old resistance
     * Expected: NO TRIGGER (Part 7 must block it via event history)
     */
    it('should not resurrect setup after failed retest even when setup remains QUALIFIED (Test C)', () => {
      const t1 = baseTime;
      const t2 = new Date(t1.getTime() + 5 * 60 * 1000);
      const t3 = new Date(t2.getTime() + 5 * 60 * 1000);
      const t5 = new Date(t3.getTime() + 10 * 60 * 1000);

      const level = createLevel('level-100', LevelPolarity.RESISTANCE, 100, t1);

      const breakEvent = new LevelEvent(
        'break-1',
        'level-100',
        LevelEventType.BREAK,
        timeframe5m,
        t1,
        t1,
        'bullish',
        BreakMechanism.TRADED,
      );

      const retestEvent = new LevelEvent(
        'retest-1',
        'level-100',
        LevelEventType.RETEST_INTERACTION,
        timeframe5m,
        t2,
        t2,
        'bullish',
      );

      const failedRetestBreak = new LevelEvent(
        'break-2',
        'level-100',
        LevelEventType.BREAK,
        timeframe5m,
        t3,
        t3,
        'bearish',
        BreakMechanism.TRADED,
      );

      const locationSnapshot = new LocationSnapshot(
        symbol,
        t5,
        t5,
        DataSufficiency.SUFFICIENT,
        false,
        'v1.0',
        'hash123',
        [level],
        [breakEvent, retestEvent, failedRetestBreak],
        new Map([['5m', [level]]]),
        new Map(),
        new Map([['level-100', { currentPolarity: LevelPolarity.SUPPORT, brokeAt: t1 }]]),
      );

      const setup = createBreakoutRetestLongSetup('setup-br-3');
      setup.evidence.interactionEventTime = t2;
      // Setup is QUALIFIED (because Part 6 only invalidates breaks before retest)
      const setupSnapshot = new SetupSnapshot(symbol, t5, t5, 'v1.0', 'hash123', [setup]);

      // T5: Later recovery to above resistance
      const recoveryCandle = createCandle(CandleStatus.CLOSED, 102, 110, 102, 107, t5);

      const triggerSnapshot = TriggerEngine.getTriggerSnapshot(
        setupSnapshot,
        locationSnapshot,
        recoveryCandle,
        t5,
        config,
      );

      // Critical: Part 7 must NOT trigger despite setup being QUALIFIED
      expect(triggerSnapshot.getAllTriggers().length).toBe(0);
    });

    /**
     * REGRESSION TEST D: Future Events Do Not Affect Past Triggers
     * T1: bullish break
     * T2: retest interaction
     * T3: bullish confirmation → trigger fires at T3
     * T4: bearish break (occurs after trigger was already confirmed)
     * Expected: Trigger should have fired at T3; T4 event doesn't invalidate historical T3 result
     */
    it('should not invalidate historical trigger confirmation by future events (Test D)', () => {
      const t1 = baseTime;
      const t2 = new Date(t1.getTime() + 5 * 60 * 1000);
      const t3 = new Date(t2.getTime() + 5 * 60 * 1000);
      // Intentionally evaluate at T3, not after T4

      const level = createLevel('level-100', LevelPolarity.RESISTANCE, 100, t1);

      const breakEvent = new LevelEvent(
        'break-1',
        'level-100',
        LevelEventType.BREAK,
        timeframe5m,
        t1,
        t1,
        'bullish',
        BreakMechanism.TRADED,
      );

      const retestEvent = new LevelEvent(
        'retest-1',
        'level-100',
        LevelEventType.RETEST_INTERACTION,
        timeframe5m,
        t2,
        t2,
        'bullish',
      );

      // Note: No T4 break event in snapshot because we're evaluating at T3
      const locationSnapshot = new LocationSnapshot(
        symbol,
        t3,
        t3,
        DataSufficiency.SUFFICIENT,
        false,
        'v1.0',
        'hash123',
        [level],
        [breakEvent, retestEvent],
        new Map([['5m', [level]]]),
        new Map(),
        new Map([['level-100', { currentPolarity: LevelPolarity.SUPPORT, brokeAt: t1 }]]),
      );

      const setup = createBreakoutRetestLongSetup('setup-br-4');
      setup.evidence.interactionEventTime = t2;
      const setupSnapshot = new SetupSnapshot(symbol, t3, t3, 'v1.0', 'hash123', [setup]);

      // T3: Confirmation candle
      const confirmCandle = createCandle(CandleStatus.CLOSED, 100, 105, 100, 104, t3);

      const triggerSnapshot = TriggerEngine.getTriggerSnapshot(
        setupSnapshot,
        locationSnapshot,
        confirmCandle,
        t3,
        config,
      );

      // Should trigger at T3 because no invalidating events exist at that time
      expect(triggerSnapshot.getAllTriggers().length).toBe(1);
      expect(triggerSnapshot.getAllTriggers()[0].triggerType).toBe(TriggerType.BULLISH_BREAKOUT);
    });

    /**
     * REGRESSION TEST E: Pullback Invalidation
     * PULLBACK_LONG: interaction occurs, then bearish break invalidates
     */
    it('should not trigger PULLBACK_LONG if pullback is broken after interaction (Test E)', () => {
      const t1 = baseTime;
      const t2 = new Date(t1.getTime() + 5 * 60 * 1000);
      const t3 = new Date(t2.getTime() + 5 * 60 * 1000);

      const level = createLevel('level-100', LevelPolarity.SUPPORT, 100, t1);

      // T1: Bullish break of support (becomes resistance)
      const breakEvent = new LevelEvent(
        'break-pb-1',
        'level-100',
        LevelEventType.BREAK,
        timeframe5m,
        t1,
        t1,
        'bullish',
        BreakMechanism.TRADED,
      );

      // T2: Interaction event (pullback touches old support)
      const interactionEvent = new LevelEvent(
        'interaction-pb-1',
        'level-100',
        LevelEventType.INTERACTION,
        timeframe5m,
        t2,
        t2,
        'bullish',
      );

      // T3: Bearish break invalidates pullback (price breaks below old support)
      const invalidatingBreak = new LevelEvent(
        'break-pb-2',
        'level-100',
        LevelEventType.BREAK,
        timeframe5m,
        t3,
        t3,
        'bearish',
        BreakMechanism.TRADED,
      );

      const locationSnapshot = new LocationSnapshot(
        symbol,
        t3,
        t3,
        DataSufficiency.SUFFICIENT,
        false,
        'v1.0',
        'hash123',
        [level],
        [breakEvent, interactionEvent, invalidatingBreak],
        new Map([['5m', [level]]]),
        new Map(),
        new Map([['level-100', { currentPolarity: LevelPolarity.RESISTANCE, brokeAt: t1 }]]),
      );

      const setup = createPullbackLongSetup('setup-pb-1');
      setup.evidence.interactionEventTime = t2; // Interaction at T2
      const setupSnapshot = new SetupSnapshot(symbol, t3, t3, 'v1.0', 'hash123', [setup]);

      // Later candle tries to reclaim above the old support
      const reclaimCandle = createCandle(CandleStatus.CLOSED, 99, 102, 99, 101, t3);

      const triggerSnapshot = TriggerEngine.getTriggerSnapshot(
        setupSnapshot,
        locationSnapshot,
        reclaimCandle,
        t3,
        config,
      );

      // Should NOT trigger because invalidating bearish break occurred
      expect(triggerSnapshot.getAllTriggers().length).toBe(0);
    });
  });
});
