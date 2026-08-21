import { RiskEngine, RiskEngineConfig } from '../domain/risk-engine';
import { RiskStatus } from '../domain/risk';
import { TriggerSnapshot } from '../domain/trigger-snapshot';
import { Trigger, TriggerType } from '../domain/trigger';
import { LocationSnapshot, DataSufficiency } from '../domain/location-snapshot';
import { Level, LevelPolarity, LevelOrigin } from '../domain/level';
import { SetupType } from '../domain/setup';
import { Timeframe, TimeframeValue } from '../domain/timeframe';

describe('Part 8 — Risk Engine', () => {
  const mockConfig: RiskEngineConfig = {
    minimumRR: 2.0,
    rulesetVersion: 'V1.0',
    configHash: 'TEST_HASH',
  };

  const baseTime = new Date('2026-08-21T10:15:00Z'); // 15:45 IST

  // Helper to create a Trigger
  const createTrigger = (overrides: Partial<any> = {}): Trigger => {
    return new Trigger(
      overrides.triggerId ?? 'trigger_1',
      overrides.symbol ?? 'RELIANCE',
      overrides.setupId ?? 'setup_1',
      overrides.setupType ?? SetupType.PULLBACK_LONG,
      overrides.direction ?? 'LONG',
      overrides.triggerType ?? TriggerType.BULLISH_RECLAIM,
      overrides.referenceLevelId ?? 'level_1',
      overrides.referenceLevelPrice ?? 2500, // Stop price
      overrides.confirmationCloseUTC ?? baseTime,
      overrides.confirmationClose ?? 2505, // Entry price
      overrides.knowledgeTimeUTC ?? baseTime,
      overrides.asOfTimeUTC ?? baseTime,
      overrides.rulesetVersion ?? 'V1.0',
      overrides.configHash ?? 'TEST_HASH',
    );
  };

  // Helper to create a Level
  const createLevel = (overrides: Partial<any> = {}): Level => {
    return new Level(
      overrides.levelId ?? 'level_1',
      overrides.symbol ?? 'RELIANCE',
      overrides.timeframe ?? Timeframe.from(TimeframeValue.FIVE_MIN),
      overrides.origin ?? LevelOrigin.CONFIRMED_SWING,
      overrides.polarity ?? LevelPolarity.RESISTANCE,
      overrides.price ?? 2510,
      overrides.eventTimeUTC ?? baseTime,
      overrides.knowledgeTimeUTC ?? baseTime,
      overrides.rulesetVersion ?? 'V1.0',
      overrides.configHash ?? 'TEST_HASH',
    );
  };

  // Helper to create LocationSnapshot with levels
  const createLocationSnapshot = (levels: Level[] = []): LocationSnapshot => {
    const nearestAbove = new Map<string, Level[]>();
    const nearestBelow = new Map<string, Level[]>();

    for (const tf of ['5m', '15m', '60m', '1D']) {
      const tfLevels = levels.filter(l => l.timeframe.value === tf);
      nearestAbove.set(tf, tfLevels.filter(l => l.polarity === LevelPolarity.RESISTANCE));
      nearestBelow.set(tf, tfLevels.filter(l => l.polarity === LevelPolarity.SUPPORT));
    }

    const polarityStates = new Map();
    for (const level of levels) {
      polarityStates.set(level.levelId, {
        currentPolarity: level.polarity,
        brokeAt: null,
      });
    }

    return new LocationSnapshot(
      'RELIANCE',
      baseTime,
      baseTime,
      DataSufficiency.SUFFICIENT,
      false,
      'V1.0',
      'TEST_HASH',
      levels,
      [],
      nearestAbove,
      nearestBelow,
      polarityStates,
    );
  };

  describe('Entry Validation', () => {
    it('should use Trigger.confirmationClose as Entry', () => {
      const trigger = createTrigger({ confirmationClose: 2505 });
      const triggerSnapshot = new TriggerSnapshot(
        'RELIANCE',
        baseTime,
        baseTime,
        'V1.0',
        'TEST_HASH',
        [trigger],
      );
      triggerSnapshot.seal();

      const target = createLevel({
        levelId: 'level_target',
        price: 2515,
        polarity: LevelPolarity.RESISTANCE,
      });
      const locationSnapshot = createLocationSnapshot([target]);

      const riskSnapshot = RiskEngine.getRiskSnapshot(
        triggerSnapshot,
        locationSnapshot,
        baseTime,
        mockConfig,
      );

      const risk = riskSnapshot.getRiskById('RISK_trigger_1_VALID');
      expect(risk?.entry).toBe(2505);
    });
  });

  describe('Stop Validation', () => {
    it('should derive Stop from Trigger.referenceLevelPrice', () => {
      const trigger = createTrigger({
        referenceLevelPrice: 2500,
        confirmationClose: 2505,
      });
      const triggerSnapshot = new TriggerSnapshot(
        'RELIANCE',
        baseTime,
        baseTime,
        'V1.0',
        'TEST_HASH',
        [trigger],
      );
      triggerSnapshot.seal();

      const target = createLevel({
        levelId: 'level_target',
        price: 2515,
        polarity: LevelPolarity.RESISTANCE,
      });
      const locationSnapshot = createLocationSnapshot([target]);

      const riskSnapshot = RiskEngine.getRiskSnapshot(
        triggerSnapshot,
        locationSnapshot,
        baseTime,
        mockConfig,
      );

      const risk = riskSnapshot.getRiskById('RISK_trigger_1_VALID');
      expect(risk?.stop).toBe(2500);
    });

    it('should output INVALID if LONG stop is not below Entry', () => {
      const trigger = createTrigger({
        direction: 'LONG',
        referenceLevelPrice: 2510, // Stop ABOVE entry
        confirmationClose: 2505,
      });
      const triggerSnapshot = new TriggerSnapshot(
        'RELIANCE',
        baseTime,
        baseTime,
        'V1.0',
        'TEST_HASH',
        [trigger],
      );
      triggerSnapshot.seal();

      const locationSnapshot = createLocationSnapshot([]);

      const riskSnapshot = RiskEngine.getRiskSnapshot(
        triggerSnapshot,
        locationSnapshot,
        baseTime,
        mockConfig,
      );

      const risk = riskSnapshot.getRiskById('RISK_trigger_1_INVALID');
      expect(risk?.status).toBe(RiskStatus.INVALID);
      expect(risk?.statusReason).toContain('wrong side of Entry');
    });

    it('should output INVALID if SHORT stop is not above Entry', () => {
      const trigger = createTrigger({
        direction: 'SHORT',
        referenceLevelPrice: 2495, // Stop BELOW entry
        confirmationClose: 2500,
      });
      const triggerSnapshot = new TriggerSnapshot(
        'RELIANCE',
        baseTime,
        baseTime,
        'V1.0',
        'TEST_HASH',
        [trigger],
      );
      triggerSnapshot.seal();

      const locationSnapshot = createLocationSnapshot([]);

      const riskSnapshot = RiskEngine.getRiskSnapshot(
        triggerSnapshot,
        locationSnapshot,
        baseTime,
        mockConfig,
      );

      const risk = riskSnapshot.getRiskById('RISK_trigger_1_INVALID');
      expect(risk?.status).toBe(RiskStatus.INVALID);
    });
  });

  describe('Target Selection', () => {
    it('should select nearest RESISTANCE above Entry for LONG', () => {
      const trigger = createTrigger({
        direction: 'LONG',
        confirmationClose: 2505,
        referenceLevelPrice: 2500,
      });
      const triggerSnapshot = new TriggerSnapshot(
        'RELIANCE',
        baseTime,
        baseTime,
        'V1.0',
        'TEST_HASH',
        [trigger],
      );
      triggerSnapshot.seal();

      const target1 = createLevel({
        levelId: 'target_near',
        price: 2515, // Risk=5, Reward=10, R:R=2.0
        polarity: LevelPolarity.RESISTANCE,
      });
      const target2 = createLevel({
        levelId: 'target_far',
        price: 2530,
        polarity: LevelPolarity.RESISTANCE,
      });
      const locationSnapshot = createLocationSnapshot([target1, target2]);

      const riskSnapshot = RiskEngine.getRiskSnapshot(
        triggerSnapshot,
        locationSnapshot,
        baseTime,
        mockConfig,
      );

      const risk = riskSnapshot.getRiskById('RISK_trigger_1_VALID');
      expect(risk?.target).toBe(2515); // Nearest above entry
      expect(risk?.targetLevelId).toBe('target_near');
    });

    it('should select nearest SUPPORT below Entry for SHORT', () => {
      const trigger = createTrigger({
        direction: 'SHORT',
        confirmationClose: 2500,
        referenceLevelPrice: 2505,
      });
      const triggerSnapshot = new TriggerSnapshot(
        'RELIANCE',
        baseTime,
        baseTime,
        'V1.0',
        'TEST_HASH',
        [trigger],
      );
      triggerSnapshot.seal();

      const target1 = createLevel({
        levelId: 'target_near',
        price: 2490,
        polarity: LevelPolarity.SUPPORT,
      });
      const target2 = createLevel({
        levelId: 'target_far',
        price: 2480,
        polarity: LevelPolarity.SUPPORT,
      });
      const locationSnapshot = createLocationSnapshot([target1, target2]);

      const riskSnapshot = RiskEngine.getRiskSnapshot(
        triggerSnapshot,
        locationSnapshot,
        baseTime,
        mockConfig,
      );

      const risk = riskSnapshot.getRiskById('RISK_trigger_1_VALID');
      expect(risk?.target).toBe(2490); // Nearest below entry
      expect(risk?.targetLevelId).toBe('target_near');
    });

    it('should ignore levels with wrong polarity', () => {
      const trigger = createTrigger({
        direction: 'LONG',
        confirmationClose: 2505,
        referenceLevelPrice: 2500,
      });
      const triggerSnapshot = new TriggerSnapshot(
        'RELIANCE',
        baseTime,
        baseTime,
        'V1.0',
        'TEST_HASH',
        [trigger],
      );
      triggerSnapshot.seal();

      const wrongPolarity = createLevel({
        levelId: 'wrong',
        price: 2510,
        polarity: LevelPolarity.SUPPORT, // Wrong for LONG target
      });
      const correctPolarity = createLevel({
        levelId: 'correct',
        price: 2515,
        polarity: LevelPolarity.RESISTANCE,
      });
      const locationSnapshot = createLocationSnapshot([wrongPolarity, correctPolarity]);

      const riskSnapshot = RiskEngine.getRiskSnapshot(
        triggerSnapshot,
        locationSnapshot,
        baseTime,
        mockConfig,
      );

      const risk = riskSnapshot.getRiskById('RISK_trigger_1_VALID');
      expect(risk?.target).toBe(2515); // Correct polarity selected
      expect(risk?.targetLevelId).toBe('correct');
    });

    it('should ignore levels on wrong side of Entry', () => {
      const trigger = createTrigger({
        direction: 'LONG',
        confirmationClose: 2505,
        referenceLevelPrice: 2500,
      });
      const triggerSnapshot = new TriggerSnapshot(
        'RELIANCE',
        baseTime,
        baseTime,
        'V1.0',
        'TEST_HASH',
        [trigger],
      );
      triggerSnapshot.seal();

      const wrongSide = createLevel({
        levelId: 'wrong_side',
        price: 2500, // Below entry
        polarity: LevelPolarity.RESISTANCE,
      });
      const correctSide = createLevel({
        levelId: 'correct_side',
        price: 2515, // Above entry (10 point reward for R:R = 2.0)
        polarity: LevelPolarity.RESISTANCE,
      });
      const locationSnapshot = createLocationSnapshot([wrongSide, correctSide]);

      const riskSnapshot = RiskEngine.getRiskSnapshot(
        triggerSnapshot,
        locationSnapshot,
        baseTime,
        mockConfig,
      );

      const risk = riskSnapshot.getRiskById('RISK_trigger_1_VALID');
      expect(risk?.target).toBe(2515);
      expect(risk?.targetLevelId).toBe('correct_side');
    });
  });

  describe('Target Absence — UNKNOWN', () => {
    it('should output UNKNOWN if no RESISTANCE exists above Entry for LONG', () => {
      const trigger = createTrigger({
        direction: 'LONG',
        confirmationClose: 2505,
        referenceLevelPrice: 2500,
      });
      const triggerSnapshot = new TriggerSnapshot(
        'RELIANCE',
        baseTime,
        baseTime,
        'V1.0',
        'TEST_HASH',
        [trigger],
      );
      triggerSnapshot.seal();

      const support = createLevel({
        levelId: 'support',
        price: 2495,
        polarity: LevelPolarity.SUPPORT,
      });
      const locationSnapshot = createLocationSnapshot([support]);

      const riskSnapshot = RiskEngine.getRiskSnapshot(
        triggerSnapshot,
        locationSnapshot,
        baseTime,
        mockConfig,
      );

      const risk = riskSnapshot.getRiskById('RISK_trigger_1_UNKNOWN');
      expect(risk?.status).toBe(RiskStatus.UNKNOWN);
      expect(risk?.statusReason).toContain('No reliable opposing structural target');
    });

    it('should output UNKNOWN if no SUPPORT exists below Entry for SHORT', () => {
      const trigger = createTrigger({
        direction: 'SHORT',
        confirmationClose: 2500,
        referenceLevelPrice: 2505,
      });
      const triggerSnapshot = new TriggerSnapshot(
        'RELIANCE',
        baseTime,
        baseTime,
        'V1.0',
        'TEST_HASH',
        [trigger],
      );
      triggerSnapshot.seal();

      const resistance = createLevel({
        levelId: 'resistance',
        price: 2510,
        polarity: LevelPolarity.RESISTANCE,
      });
      const locationSnapshot = createLocationSnapshot([resistance]);

      const riskSnapshot = RiskEngine.getRiskSnapshot(
        triggerSnapshot,
        locationSnapshot,
        baseTime,
        mockConfig,
      );

      const risk = riskSnapshot.getRiskById('RISK_trigger_1_UNKNOWN');
      expect(risk?.status).toBe(RiskStatus.UNKNOWN);
    });

    it('should output UNKNOWN if no levels exist', () => {
      const trigger = createTrigger({
        direction: 'LONG',
        confirmationClose: 2505,
        referenceLevelPrice: 2500,
      });
      const triggerSnapshot = new TriggerSnapshot(
        'RELIANCE',
        baseTime,
        baseTime,
        'V1.0',
        'TEST_HASH',
        [trigger],
      );
      triggerSnapshot.seal();

      const locationSnapshot = createLocationSnapshot([]);

      const riskSnapshot = RiskEngine.getRiskSnapshot(
        triggerSnapshot,
        locationSnapshot,
        baseTime,
        mockConfig,
      );

      const risk = riskSnapshot.getRiskById('RISK_trigger_1_UNKNOWN');
      expect(risk?.status).toBe(RiskStatus.UNKNOWN);
    });
  });

  describe('Risk & Reward Calculation', () => {
    it('should calculate Risk = |Entry - Stop| for LONG', () => {
      const trigger = createTrigger({
        direction: 'LONG',
        confirmationClose: 2505,
        referenceLevelPrice: 2500,
      });
      const triggerSnapshot = new TriggerSnapshot(
        'RELIANCE',
        baseTime,
        baseTime,
        'V1.0',
        'TEST_HASH',
        [trigger],
      );
      triggerSnapshot.seal();

      const target = createLevel({
        levelId: 'target',
        price: 2515,
        polarity: LevelPolarity.RESISTANCE,
      });
      const locationSnapshot = createLocationSnapshot([target]);

      const riskSnapshot = RiskEngine.getRiskSnapshot(
        triggerSnapshot,
        locationSnapshot,
        baseTime,
        mockConfig,
      );

      const risk = riskSnapshot.getRiskById('RISK_trigger_1_VALID');
      expect(risk?.risk).toBe(5); // 2505 - 2500
    });

    it('should calculate Reward = |Target - Entry| for LONG', () => {
      const trigger = createTrigger({
        direction: 'LONG',
        confirmationClose: 2505,
        referenceLevelPrice: 2500,
      });
      const triggerSnapshot = new TriggerSnapshot(
        'RELIANCE',
        baseTime,
        baseTime,
        'V1.0',
        'TEST_HASH',
        [trigger],
      );
      triggerSnapshot.seal();

      const target = createLevel({
        levelId: 'target',
        price: 2515,
        polarity: LevelPolarity.RESISTANCE,
      });
      const locationSnapshot = createLocationSnapshot([target]);

      const riskSnapshot = RiskEngine.getRiskSnapshot(
        triggerSnapshot,
        locationSnapshot,
        baseTime,
        mockConfig,
      );

      const risk = riskSnapshot.getRiskById('RISK_trigger_1_VALID');
      expect(risk?.reward).toBe(10); // 2515 - 2505
    });

    it('should calculate R:R = Reward / Risk', () => {
      const trigger = createTrigger({
        direction: 'LONG',
        confirmationClose: 2505,
        referenceLevelPrice: 2500,
      });
      const triggerSnapshot = new TriggerSnapshot(
        'RELIANCE',
        baseTime,
        baseTime,
        'V1.0',
        'TEST_HASH',
        [trigger],
      );
      triggerSnapshot.seal();

      const target = createLevel({
        levelId: 'target',
        price: 2515,
        polarity: LevelPolarity.RESISTANCE,
      });
      const locationSnapshot = createLocationSnapshot([target]);

      const riskSnapshot = RiskEngine.getRiskSnapshot(
        triggerSnapshot,
        locationSnapshot,
        baseTime,
        mockConfig,
      );

      const risk = riskSnapshot.getRiskById('RISK_trigger_1_VALID');
      expect(risk?.riskRewardRatio).toBe(2); // 10 / 5
    });

    it('should calculate Risk = |Stop - Entry| for SHORT', () => {
      const trigger = createTrigger({
        direction: 'SHORT',
        confirmationClose: 2500,
        referenceLevelPrice: 2505,
      });
      const triggerSnapshot = new TriggerSnapshot(
        'RELIANCE',
        baseTime,
        baseTime,
        'V1.0',
        'TEST_HASH',
        [trigger],
      );
      triggerSnapshot.seal();

      const target = createLevel({
        levelId: 'target',
        price: 2490,
        polarity: LevelPolarity.SUPPORT,
      });
      const locationSnapshot = createLocationSnapshot([target]);

      const riskSnapshot = RiskEngine.getRiskSnapshot(
        triggerSnapshot,
        locationSnapshot,
        baseTime,
        mockConfig,
      );

      const risk = riskSnapshot.getRiskById('RISK_trigger_1_VALID');
      expect(risk?.risk).toBe(5); // 2505 - 2500
    });

    it('should calculate Reward = |Entry - Target| for SHORT', () => {
      const trigger = createTrigger({
        direction: 'SHORT',
        confirmationClose: 2500,
        referenceLevelPrice: 2505,
      });
      const triggerSnapshot = new TriggerSnapshot(
        'RELIANCE',
        baseTime,
        baseTime,
        'V1.0',
        'TEST_HASH',
        [trigger],
      );
      triggerSnapshot.seal();

      const target = createLevel({
        levelId: 'target',
        price: 2490,
        polarity: LevelPolarity.SUPPORT,
      });
      const locationSnapshot = createLocationSnapshot([target]);

      const riskSnapshot = RiskEngine.getRiskSnapshot(
        triggerSnapshot,
        locationSnapshot,
        baseTime,
        mockConfig,
      );

      const risk = riskSnapshot.getRiskById('RISK_trigger_1_VALID');
      expect(risk?.reward).toBe(10); // 2500 - 2490
    });
  });

  describe('R:R Threshold — REJECTED', () => {
    it('should output REJECTED if R:R < minimumRR', () => {
      const trigger = createTrigger({
        direction: 'LONG',
        confirmationClose: 2505,
        referenceLevelPrice: 2500,
      });
      const triggerSnapshot = new TriggerSnapshot(
        'RELIANCE',
        baseTime,
        baseTime,
        'V1.0',
        'TEST_HASH',
        [trigger],
      );
      triggerSnapshot.seal();

      const target = createLevel({
        levelId: 'target',
        price: 2507, // Reward = 2, Risk = 5, R:R = 0.4
        polarity: LevelPolarity.RESISTANCE,
      });
      const locationSnapshot = createLocationSnapshot([target]);

      const riskSnapshot = RiskEngine.getRiskSnapshot(
        triggerSnapshot,
        locationSnapshot,
        baseTime,
        mockConfig,
      );

      const risk = riskSnapshot.getRiskById('RISK_trigger_1_REJECTED');
      expect(risk?.status).toBe(RiskStatus.REJECTED);
      expect(risk?.riskRewardRatio).toBeLessThan(mockConfig.minimumRR);
      expect(risk?.statusReason).toContain('below minimumRR');
    });

    it('should output VALID if R:R >= minimumRR', () => {
      const trigger = createTrigger({
        direction: 'LONG',
        confirmationClose: 2505,
        referenceLevelPrice: 2500,
      });
      const triggerSnapshot = new TriggerSnapshot(
        'RELIANCE',
        baseTime,
        baseTime,
        'V1.0',
        'TEST_HASH',
        [trigger],
      );
      triggerSnapshot.seal();

      const target = createLevel({
        levelId: 'target',
        price: 2515, // Reward = 10, Risk = 5, R:R = 2.0
        polarity: LevelPolarity.RESISTANCE,
      });
      const locationSnapshot = createLocationSnapshot([target]);

      const riskSnapshot = RiskEngine.getRiskSnapshot(
        triggerSnapshot,
        locationSnapshot,
        baseTime,
        mockConfig,
      );

      const risk = riskSnapshot.getRiskById('RISK_trigger_1_VALID');
      expect(risk?.status).toBe(RiskStatus.VALID);
      expect(risk?.riskRewardRatio).toBeGreaterThanOrEqual(mockConfig.minimumRR);
    });

    it('should respect custom minimumRR config', () => {
      const customConfig: RiskEngineConfig = {
        minimumRR: 3.0,
        rulesetVersion: 'V1.0',
        configHash: 'TEST_HASH',
      };

      const trigger = createTrigger({
        direction: 'LONG',
        confirmationClose: 2505,
        referenceLevelPrice: 2500,
      });
      const triggerSnapshot = new TriggerSnapshot(
        'RELIANCE',
        baseTime,
        baseTime,
        'V1.0',
        'TEST_HASH',
        [trigger],
      );
      triggerSnapshot.seal();

      const target = createLevel({
        levelId: 'target',
        price: 2512, // Reward = 7, Risk = 5, R:R = 1.4 (fails 3.0 threshold)
        polarity: LevelPolarity.RESISTANCE,
      });
      const locationSnapshot = createLocationSnapshot([target]);

      const riskSnapshot = RiskEngine.getRiskSnapshot(
        triggerSnapshot,
        locationSnapshot,
        baseTime,
        customConfig,
      );

      const risk = riskSnapshot.getRiskById('RISK_trigger_1_REJECTED');
      expect(risk?.status).toBe(RiskStatus.REJECTED);
    });
  });

  describe('Causality — No Look-Ahead', () => {
    it('should ignore levels with future knowledgeTime', () => {
      const futureTime = new Date(baseTime.getTime() + 60000); // 1 minute in future

      const trigger = createTrigger({
        direction: 'LONG',
        confirmationClose: 2505,
        referenceLevelPrice: 2500,
        asOfTimeUTC: baseTime,
      });
      const triggerSnapshot = new TriggerSnapshot(
        'RELIANCE',
        baseTime,
        baseTime,
        'V1.0',
        'TEST_HASH',
        [trigger],
      );
      triggerSnapshot.seal();

      const futureTarget = createLevel({
        levelId: 'future_target',
        price: 2515,
        polarity: LevelPolarity.RESISTANCE,
        knowledgeTimeUTC: futureTime, // Future knowledge time
      });
      const causalTarget = createLevel({
        levelId: 'causal_target',
        price: 2520, // Far enough for R:R >= 2.0
        polarity: LevelPolarity.RESISTANCE,
        knowledgeTimeUTC: baseTime,
      });
      const locationSnapshot = createLocationSnapshot([futureTarget, causalTarget]);

      const riskSnapshot = RiskEngine.getRiskSnapshot(
        triggerSnapshot,
        locationSnapshot,
        baseTime,
        mockConfig,
      );

      const risk = riskSnapshot.getRiskById('RISK_trigger_1_VALID');
      expect(risk?.target).toBe(2520); // Causal target selected, future ignored
      expect(risk?.targetLevelId).toBe('causal_target');
    });
  });

  describe('Immutability', () => {
    it('should seal RiskSnapshot', () => {
      const trigger = createTrigger();
      const triggerSnapshot = new TriggerSnapshot(
        'RELIANCE',
        baseTime,
        baseTime,
        'V1.0',
        'TEST_HASH',
        [trigger],
      );
      triggerSnapshot.seal();

      const target = createLevel({
        levelId: 'target',
        price: 2515,
        polarity: LevelPolarity.RESISTANCE,
      });
      const locationSnapshot = createLocationSnapshot([target]);

      const riskSnapshot = RiskEngine.getRiskSnapshot(
        triggerSnapshot,
        locationSnapshot,
        baseTime,
        mockConfig,
      );

      expect(riskSnapshot.isSealed()).toBe(true);
      expect(Object.isFrozen(riskSnapshot)).toBe(true);
    });

    it('should freeze Risk objects', () => {
      const trigger = createTrigger();
      const triggerSnapshot = new TriggerSnapshot(
        'RELIANCE',
        baseTime,
        baseTime,
        'V1.0',
        'TEST_HASH',
        [trigger],
      );
      triggerSnapshot.seal();

      const target = createLevel({
        levelId: 'target',
        price: 2515,
        polarity: LevelPolarity.RESISTANCE,
      });
      const locationSnapshot = createLocationSnapshot([target]);

      const riskSnapshot = RiskEngine.getRiskSnapshot(
        triggerSnapshot,
        locationSnapshot,
        baseTime,
        mockConfig,
      );

      const risk = riskSnapshot.getRiskById('RISK_trigger_1_VALID');
      expect(Object.isFrozen(risk)).toBe(true);
    });
  });

  describe('Determinism', () => {
    it('should produce same output for identical input', () => {
      const trigger = createTrigger();
      const triggerSnapshot = new TriggerSnapshot(
        'RELIANCE',
        baseTime,
        baseTime,
        'V1.0',
        'TEST_HASH',
        [trigger],
      );
      triggerSnapshot.seal();

      const target = createLevel({
        levelId: 'target',
        price: 2515,
        polarity: LevelPolarity.RESISTANCE,
      });
      const locationSnapshot = createLocationSnapshot([target]);

      // Run twice
      const result1 = RiskEngine.getRiskSnapshot(
        triggerSnapshot,
        locationSnapshot,
        baseTime,
        mockConfig,
      );
      const result2 = RiskEngine.getRiskSnapshot(
        triggerSnapshot,
        locationSnapshot,
        baseTime,
        mockConfig,
      );

      // Compare results
      const risk1 = result1.getRiskById('RISK_trigger_1_VALID');
      const risk2 = result2.getRiskById('RISK_trigger_1_VALID');

      expect(risk1?.entry).toBe(risk2?.entry);
      expect(risk1?.stop).toBe(risk2?.stop);
      expect(risk1?.target).toBe(risk2?.target);
      expect(risk1?.risk).toBe(risk2?.risk);
      expect(risk1?.reward).toBe(risk2?.reward);
      expect(risk1?.riskRewardRatio).toBe(risk2?.riskRewardRatio);
      expect(risk1?.status).toBe(risk2?.status);
    });
  });

  describe('Multiple Triggers', () => {
    it('should evaluate all triggers in snapshot', () => {
      const trigger1 = createTrigger({ triggerId: 'trigger_1', direction: 'LONG' });
      const trigger2 = createTrigger({ triggerId: 'trigger_2', direction: 'SHORT' });
      const triggerSnapshot = new TriggerSnapshot(
        'RELIANCE',
        baseTime,
        baseTime,
        'V1.0',
        'TEST_HASH',
        [trigger1, trigger2],
      );
      triggerSnapshot.seal();

      const target1 = createLevel({
        levelId: 'target1',
        price: 2515,
        polarity: LevelPolarity.RESISTANCE,
      });
      const target2 = createLevel({
        levelId: 'target2',
        price: 2495,
        polarity: LevelPolarity.SUPPORT,
      });
      const locationSnapshot = createLocationSnapshot([target1, target2]);

      const riskSnapshot = RiskEngine.getRiskSnapshot(
        triggerSnapshot,
        locationSnapshot,
        baseTime,
        mockConfig,
      );

      expect(riskSnapshot.getAllRisks().length).toBe(2);
      expect(riskSnapshot.getRisksByTriggerId('trigger_1').length).toBe(1);
      expect(riskSnapshot.getRisksByTriggerId('trigger_2').length).toBe(1);
    });
  });
});
