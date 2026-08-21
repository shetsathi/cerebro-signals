import { LocationSnapshot } from './location-snapshot';
import { RegimeSnapshot } from './regime-snapshot';
import { StructureSnapshot } from './structure-snapshot';
import { Level, LevelPolarity } from './level';
import { LevelEvent, LevelEventType } from './level-event';
import { Setup, SetupType, SetupStatus, SetupEvidence, SetupGeometry } from './setup';
import { SetupSnapshot } from './setup-snapshot';
import { Timeframe } from './timeframe';

export interface SetupEngineConfig {
  k: number; // K nearest levels (inherited from Part 5)
  maxBarsFailedBreak: number; // From Part 5
  maxBarsAfterBreak: number; // From Part 5
  rulesetVersion: string;
  configHash: string;
}

/**
 * Part 6 — Deterministic Setup Qualification Engine
 *
 * Consumes deterministic facts from Parts 1–5 and produces deterministic
 * setup qualifications.
 *
 * Implements four setup families:
 * 1. PULLBACK_LONG
 * 2. PULLBACK_SHORT
 * 3. BREAKOUT_RETEST_LONG
 * 4. BREAKOUT_RETEST_SHORT
 *
 * Key contract: QUALIFIED does NOT mean tradeable. It means conditions occurred.
 */
export class SetupEngine {
  static getSetupSnapshot(
    locationSnapshot: LocationSnapshot,
    structureSnapshot: StructureSnapshot,
    asOfTimeUTC: Date,
    symbol: string,
    config: SetupEngineConfig,
  ): SetupSnapshot {
    const setups: Setup[] = [];

    // Get all levels and events from LocationSnapshot
    const allLevels = locationSnapshot.getAllLevels();
    const allEvents = locationSnapshot.getAllEvents();

    // Filter by knowledge time
    const validLevels = allLevels.filter(l => l.knowledgeTimeUTC <= asOfTimeUTC);
    const validEvents = allEvents.filter(e => e.knowledgeTimeUTC <= asOfTimeUTC);

    // Evaluate each level for all four setup types
    for (const level of validLevels) {
      // PULLBACK_LONG: RESISTANCE → break → SUPPORT → interaction
      if (level.polarity === LevelPolarity.RESISTANCE) {
        const pullbackLong = this.evaluatePullbackLong(
          level,
          validLevels,
          validEvents,
          locationSnapshot,
          asOfTimeUTC,
          config,
        );
        if (pullbackLong) setups.push(pullbackLong);

        // BREAKOUT_RETEST_LONG: RESISTANCE → break → SUPPORT → retest
        const breakoutRetestLong = this.evaluateBreakoutRetestLong(
          level,
          validLevels,
          validEvents,
          locationSnapshot,
          asOfTimeUTC,
          config,
        );
        if (breakoutRetestLong) setups.push(breakoutRetestLong);
      }

      // PULLBACK_SHORT: SUPPORT → break → RESISTANCE → interaction
      if (level.polarity === LevelPolarity.SUPPORT) {
        const pullbackShort = this.evaluatePullbackShort(
          level,
          validLevels,
          validEvents,
          locationSnapshot,
          asOfTimeUTC,
          config,
        );
        if (pullbackShort) setups.push(pullbackShort);

        // BREAKOUT_RETEST_SHORT: SUPPORT → break → RESISTANCE → retest
        const breakoutRetestShort = this.evaluateBreakoutRetestShort(
          level,
          validLevels,
          validEvents,
          locationSnapshot,
          asOfTimeUTC,
          config,
        );
        if (breakoutRetestShort) setups.push(breakoutRetestShort);
      }
    }

    const snapshot = new SetupSnapshot(
      symbol,
      asOfTimeUTC,
      locationSnapshot.knowledgeTimeUTC,
      config.rulesetVersion,
      config.configHash,
      setups,
    );

    snapshot.seal();
    return snapshot;
  }

  private static evaluatePullbackLong(
    level: Level,
    allLevels: Level[],
    allEvents: LevelEvent[],
    locationSnapshot: LocationSnapshot,
    asOfTimeUTC: Date,
    config: SetupEngineConfig,
  ): Setup | null {
    // Preconditions:
    // 1. RESISTANCE level exists ✓ (passed as parameter)
    // 2. Bullish BREAK on same timeframe
    // 3. Polarity flipped to SUPPORT
    // 4. Subsequent interaction with SUPPORT
    // 5. No opposite break before interaction

    const polarityState = locationSnapshot.getPolarityState(level.levelId);
    if (!polarityState) return null;

    // Check if polarity has flipped (indicates break occurred)
    if (polarityState.currentPolarity !== LevelPolarity.SUPPORT) return null;
    if (!polarityState.brokeAt) return null;

    // Get break event
    const breakEvent = allEvents.find(
      e => e.levelId === level.levelId && e.eventType === LevelEventType.BREAK && e.direction === 'bullish',
    );
    if (!breakEvent) return null;

    // Check for interaction with flipped support after break
    const interactionEvent = allEvents.find(
      e =>
        e.levelId === level.levelId &&
        e.eventType === LevelEventType.INTERACTION &&
        e.eventTimeUTC > breakEvent.eventTimeUTC,
    );

    if (!interactionEvent) {
      // Still FORMING
      return new Setup(
        this.generateSetupId(level.levelId, SetupType.PULLBACK_LONG),
        level.symbol,
        SetupType.PULLBACK_LONG,
        'LONG',
        SetupStatus.FORMING,
        level.timeframe,
        polarityState.brokeAt,
        polarityState.brokeAt,
        null,
        null,
        null,
        null,
        polarityState.brokeAt,
        asOfTimeUTC,
        level.levelId,
        this.createEvidence(level, breakEvent, null, null),
        this.createGeometry(level),
        config.rulesetVersion,
        config.configHash,
      );
    }

    // Check for opposite break that invalidates
    const oppositeBreak = allEvents.find(
      e =>
        e.levelId === level.levelId &&
        e.eventType === LevelEventType.BREAK &&
        e.direction === 'bearish' &&
        e.eventTimeUTC > breakEvent.eventTimeUTC &&
        e.eventTimeUTC <= interactionEvent.eventTimeUTC,
    );

    if (oppositeBreak) {
      return new Setup(
        this.generateSetupId(level.levelId, SetupType.PULLBACK_LONG),
        level.symbol,
        SetupType.PULLBACK_LONG,
        'LONG',
        SetupStatus.INVALIDATED,
        level.timeframe,
        polarityState.brokeAt,
        polarityState.brokeAt,
        null,
        oppositeBreak.eventTimeUTC,
        'OPPOSITE_BREAK',
        null,
        oppositeBreak.knowledgeTimeUTC,
        asOfTimeUTC,
        level.levelId,
        this.createEvidence(level, breakEvent, oppositeBreak, null),
        this.createGeometry(level),
        config.rulesetVersion,
        config.configHash,
      );
    }

    // Interaction occurred, no opposite break → QUALIFIED
    return new Setup(
      this.generateSetupId(level.levelId, SetupType.PULLBACK_LONG),
      level.symbol,
      SetupType.PULLBACK_LONG,
      'LONG',
      SetupStatus.QUALIFIED,
      level.timeframe,
      polarityState.brokeAt,
      polarityState.brokeAt,
      interactionEvent.eventTimeUTC,
      null,
      null,
      null,
      interactionEvent.knowledgeTimeUTC,
      asOfTimeUTC,
      level.levelId,
      this.createEvidence(level, breakEvent, null, interactionEvent),
      this.createGeometry(level),
      config.rulesetVersion,
      config.configHash,
    );
  }

  private static evaluatePullbackShort(
    level: Level,
    allLevels: Level[],
    allEvents: LevelEvent[],
    locationSnapshot: LocationSnapshot,
    asOfTimeUTC: Date,
    config: SetupEngineConfig,
  ): Setup | null {
    // Mirror of PULLBACK_LONG
    const polarityState = locationSnapshot.getPolarityState(level.levelId);
    if (!polarityState) return null;

    if (polarityState.currentPolarity !== LevelPolarity.RESISTANCE) return null;
    if (!polarityState.brokeAt) return null;

    const breakEvent = allEvents.find(
      e => e.levelId === level.levelId && e.eventType === LevelEventType.BREAK && e.direction === 'bearish',
    );
    if (!breakEvent) return null;

    const interactionEvent = allEvents.find(
      e =>
        e.levelId === level.levelId &&
        e.eventType === LevelEventType.INTERACTION &&
        e.eventTimeUTC > breakEvent.eventTimeUTC,
    );

    if (!interactionEvent) {
      return new Setup(
        this.generateSetupId(level.levelId, SetupType.PULLBACK_SHORT),
        level.symbol,
        SetupType.PULLBACK_SHORT,
        'SHORT',
        SetupStatus.FORMING,
        level.timeframe,
        polarityState.brokeAt,
        polarityState.brokeAt,
        null,
        null,
        null,
        null,
        polarityState.brokeAt,
        asOfTimeUTC,
        level.levelId,
        this.createEvidence(level, breakEvent, null, null),
        this.createGeometry(level),
        config.rulesetVersion,
        config.configHash,
      );
    }

    const oppositeBreak = allEvents.find(
      e =>
        e.levelId === level.levelId &&
        e.eventType === LevelEventType.BREAK &&
        e.direction === 'bullish' &&
        e.eventTimeUTC > breakEvent.eventTimeUTC &&
        e.eventTimeUTC <= interactionEvent.eventTimeUTC,
    );

    if (oppositeBreak) {
      return new Setup(
        this.generateSetupId(level.levelId, SetupType.PULLBACK_SHORT),
        level.symbol,
        SetupType.PULLBACK_SHORT,
        'SHORT',
        SetupStatus.INVALIDATED,
        level.timeframe,
        polarityState.brokeAt,
        polarityState.brokeAt,
        null,
        oppositeBreak.eventTimeUTC,
        'OPPOSITE_BREAK',
        null,
        oppositeBreak.knowledgeTimeUTC,
        asOfTimeUTC,
        level.levelId,
        this.createEvidence(level, breakEvent, oppositeBreak, null),
        this.createGeometry(level),
        config.rulesetVersion,
        config.configHash,
      );
    }

    return new Setup(
      this.generateSetupId(level.levelId, SetupType.PULLBACK_SHORT),
      level.symbol,
      SetupType.PULLBACK_SHORT,
      'SHORT',
      SetupStatus.QUALIFIED,
      level.timeframe,
      polarityState.brokeAt,
      polarityState.brokeAt,
      interactionEvent.eventTimeUTC,
      null,
      null,
      null,
      interactionEvent.knowledgeTimeUTC,
      asOfTimeUTC,
      level.levelId,
      this.createEvidence(level, breakEvent, null, interactionEvent),
      this.createGeometry(level),
      config.rulesetVersion,
      config.configHash,
    );
  }

  private static evaluateBreakoutRetestLong(
    level: Level,
    allLevels: Level[],
    allEvents: LevelEvent[],
    locationSnapshot: LocationSnapshot,
    asOfTimeUTC: Date,
    config: SetupEngineConfig,
  ): Setup | null {
    // BREAKOUT_RETEST_LONG: Requires RETEST_INTERACTION event (not generic interaction)
    const polarityState = locationSnapshot.getPolarityState(level.levelId);
    if (!polarityState) return null;

    if (polarityState.currentPolarity !== LevelPolarity.SUPPORT) return null;
    if (!polarityState.brokeAt) return null;

    const breakEvent = allEvents.find(
      e => e.levelId === level.levelId && e.eventType === LevelEventType.BREAK && e.direction === 'bullish',
    );
    if (!breakEvent) return null;

    const retestEvent = allEvents.find(
      e =>
        e.levelId === level.levelId &&
        e.eventType === LevelEventType.RETEST_INTERACTION &&
        e.eventTimeUTC > breakEvent.eventTimeUTC,
    );

    if (!retestEvent) {
      return new Setup(
        this.generateSetupId(level.levelId, SetupType.BREAKOUT_RETEST_LONG),
        level.symbol,
        SetupType.BREAKOUT_RETEST_LONG,
        'LONG',
        SetupStatus.FORMING,
        level.timeframe,
        polarityState.brokeAt,
        polarityState.brokeAt,
        null,
        null,
        null,
        null,
        polarityState.brokeAt,
        asOfTimeUTC,
        level.levelId,
        this.createEvidence(level, breakEvent, null, null),
        this.createGeometry(level),
        config.rulesetVersion,
        config.configHash,
      );
    }

    const oppositeBreak = allEvents.find(
      e =>
        e.levelId === level.levelId &&
        e.eventType === LevelEventType.BREAK &&
        e.direction === 'bearish' &&
        e.eventTimeUTC > breakEvent.eventTimeUTC &&
        e.eventTimeUTC <= retestEvent.eventTimeUTC,
    );

    if (oppositeBreak) {
      return new Setup(
        this.generateSetupId(level.levelId, SetupType.BREAKOUT_RETEST_LONG),
        level.symbol,
        SetupType.BREAKOUT_RETEST_LONG,
        'LONG',
        SetupStatus.INVALIDATED,
        level.timeframe,
        polarityState.brokeAt,
        polarityState.brokeAt,
        null,
        oppositeBreak.eventTimeUTC,
        'OPPOSITE_BREAK',
        null,
        oppositeBreak.knowledgeTimeUTC,
        asOfTimeUTC,
        level.levelId,
        this.createEvidence(level, breakEvent, oppositeBreak, null),
        this.createGeometry(level),
        config.rulesetVersion,
        config.configHash,
      );
    }

    return new Setup(
      this.generateSetupId(level.levelId, SetupType.BREAKOUT_RETEST_LONG),
      level.symbol,
      SetupType.BREAKOUT_RETEST_LONG,
      'LONG',
      SetupStatus.QUALIFIED,
      level.timeframe,
      polarityState.brokeAt,
      polarityState.brokeAt,
      retestEvent.eventTimeUTC,
      null,
      null,
      null,
      retestEvent.knowledgeTimeUTC,
      asOfTimeUTC,
      level.levelId,
      this.createEvidence(level, breakEvent, null, retestEvent),
      this.createGeometry(level),
      config.rulesetVersion,
      config.configHash,
    );
  }

  private static evaluateBreakoutRetestShort(
    level: Level,
    allLevels: Level[],
    allEvents: LevelEvent[],
    locationSnapshot: LocationSnapshot,
    asOfTimeUTC: Date,
    config: SetupEngineConfig,
  ): Setup | null {
    // Mirror of BREAKOUT_RETEST_LONG
    const polarityState = locationSnapshot.getPolarityState(level.levelId);
    if (!polarityState) return null;

    if (polarityState.currentPolarity !== LevelPolarity.RESISTANCE) return null;
    if (!polarityState.brokeAt) return null;

    const breakEvent = allEvents.find(
      e => e.levelId === level.levelId && e.eventType === LevelEventType.BREAK && e.direction === 'bearish',
    );
    if (!breakEvent) return null;

    const retestEvent = allEvents.find(
      e =>
        e.levelId === level.levelId &&
        e.eventType === LevelEventType.RETEST_INTERACTION &&
        e.eventTimeUTC > breakEvent.eventTimeUTC,
    );

    if (!retestEvent) {
      return new Setup(
        this.generateSetupId(level.levelId, SetupType.BREAKOUT_RETEST_SHORT),
        level.symbol,
        SetupType.BREAKOUT_RETEST_SHORT,
        'SHORT',
        SetupStatus.FORMING,
        level.timeframe,
        polarityState.brokeAt,
        polarityState.brokeAt,
        null,
        null,
        null,
        null,
        polarityState.brokeAt,
        asOfTimeUTC,
        level.levelId,
        this.createEvidence(level, breakEvent, null, null),
        this.createGeometry(level),
        config.rulesetVersion,
        config.configHash,
      );
    }

    const oppositeBreak = allEvents.find(
      e =>
        e.levelId === level.levelId &&
        e.eventType === LevelEventType.BREAK &&
        e.direction === 'bullish' &&
        e.eventTimeUTC > breakEvent.eventTimeUTC &&
        e.eventTimeUTC <= retestEvent.eventTimeUTC,
    );

    if (oppositeBreak) {
      return new Setup(
        this.generateSetupId(level.levelId, SetupType.BREAKOUT_RETEST_SHORT),
        level.symbol,
        SetupType.BREAKOUT_RETEST_SHORT,
        'SHORT',
        SetupStatus.INVALIDATED,
        level.timeframe,
        polarityState.brokeAt,
        polarityState.brokeAt,
        null,
        oppositeBreak.eventTimeUTC,
        'OPPOSITE_BREAK',
        null,
        oppositeBreak.knowledgeTimeUTC,
        asOfTimeUTC,
        level.levelId,
        this.createEvidence(level, breakEvent, oppositeBreak, null),
        this.createGeometry(level),
        config.rulesetVersion,
        config.configHash,
      );
    }

    return new Setup(
      this.generateSetupId(level.levelId, SetupType.BREAKOUT_RETEST_SHORT),
      level.symbol,
      SetupType.BREAKOUT_RETEST_SHORT,
      'SHORT',
      SetupStatus.QUALIFIED,
      level.timeframe,
      polarityState.brokeAt,
      polarityState.brokeAt,
      retestEvent.eventTimeUTC,
      null,
      null,
      null,
      retestEvent.knowledgeTimeUTC,
      asOfTimeUTC,
      level.levelId,
      this.createEvidence(level, breakEvent, null, retestEvent),
      this.createGeometry(level),
      config.rulesetVersion,
      config.configHash,
    );
  }

  private static generateSetupId(levelId: string, setupType: SetupType): string {
    return `${setupType}_${levelId}`;
  }

  private static createEvidence(
    level: Level,
    breakEvent: LevelEvent | null,
    oppositeBreak: LevelEvent | null,
    interactionEvent: LevelEvent | null,
  ): SetupEvidence {
    return {
      sourceLevelId: level.levelId,
      sourceLevelPrice: level.price,
      sourceLevelOrigin: level.origin,
      sourceLevelPolarity: level.polarity,
      breakEventId: breakEvent?.eventId ?? null,
      breakEventTime: breakEvent?.eventTimeUTC ?? null,
      breakDirection: breakEvent?.direction ?? null,
      breakMechanism: breakEvent?.breakMechanism ?? null,
      flippedPolarity: breakEvent ? (level.polarity === LevelPolarity.RESISTANCE ? LevelPolarity.SUPPORT : LevelPolarity.RESISTANCE) : null,
      flippedPolarityTime: breakEvent?.eventTimeUTC ?? null,
      interactionEventId: interactionEvent?.eventId ?? null,
      interactionEventTime: interactionEvent?.eventTimeUTC ?? null,
      interactionType: interactionEvent?.eventType as any,
      invalidatingBreakEventId: oppositeBreak?.eventId ?? null,
      invalidatingBreakTime: oppositeBreak?.eventTimeUTC ?? null,
    };
  }

  private static createGeometry(level: Level): SetupGeometry {
    return {
      sourceTimeframe: level.timeframe,
      sourceLevelPrice: level.price,
      flippedLevelPrice: level.price,
      currentTimeframeValue: level.timeframe.value,
    };
  }
}
