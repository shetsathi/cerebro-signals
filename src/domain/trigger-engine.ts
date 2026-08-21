import { Candle, CandleStatus } from './candle';
import { LocationSnapshot } from './location-snapshot';
import { SetupSnapshot } from './setup-snapshot';
import { Trigger, TriggerType } from './trigger';
import { TriggerSnapshot } from './trigger-snapshot';
import { Setup, SetupStatus, SetupType } from './setup';
import { LevelPolarity } from './level';
import { LevelEvent, LevelEventType } from './level-event';

export interface TriggerEngineConfig {
  rulesetVersion: string;
  configHash: string;
}

/**
 * Part 7 — Deterministic Trigger Engine
 *
 * Consumes frozen Setup qualifications and produces deterministic triggers.
 *
 * Key contract: A trigger represents confirmed lower-timeframe (5m) price action
 * that has validated a qualified setup. It is NOT a final trade decision.
 *
 * IMPLEMENTED TRIGGER TYPES:
 * - BULLISH_RECLAIM: Price reclaimed a structural support level
 * - BEARISH_RECLAIM: Price reclaimed a structural resistance level
 * - BULLISH_BREAKOUT: Price confirmed directional continuation above resistance
 * - BEARISH_BREAKDOWN: Price confirmed directional continuation below support
 *
 * DEFINED BUT NOT EXECUTABLE (V1 contract reserves these; execution semantics not yet specified):
 * - BULLISH_REVERSAL: The V1 architecture names this trigger concept, but deterministic
 *   execution semantics are not yet sufficiently specified. Do not invent reversal logic.
 * - BEARISH_REVERSAL: The V1 architecture names this trigger concept, but deterministic
 *   execution semantics are not yet sufficiently specified. Do not invent reversal logic.
 *
 * Mandatory requirements:
 * 1. Qualified setup must exist (status === QUALIFIED)
 * 2. Setup must not be invalidated
 * 3. Trigger direction must match setup direction
 * 4. Confirmation must be on a CLOSED candle (not developing)
 * 5. No future data may be used
 */
export class TriggerEngine {
  static getTriggerSnapshot(
    setupSnapshot: SetupSnapshot,
    locationSnapshot: LocationSnapshot,
    currentCandle: Candle,
    asOfTimeUTC: Date,
    config: TriggerEngineConfig,
  ): TriggerSnapshot {
    const triggers: Trigger[] = [];

    // Guard: candle must be closed for trigger confirmation
    if (currentCandle.status !== CandleStatus.CLOSED) {
      return new TriggerSnapshot(
        setupSnapshot.symbol,
        asOfTimeUTC,
        setupSnapshot.knowledgeTimeUTC,
        config.rulesetVersion,
        config.configHash,
        [],
      );
    }

    // Guard: candle knowledge time must be within evaluation window
    if (currentCandle.knowledgeTimeUTC > asOfTimeUTC) {
      throw new Error(
        `Look-ahead violation: candle knowledge time ${currentCandle.knowledgeTimeUTC.toISOString()} exceeds evaluation time ${asOfTimeUTC.toISOString()}`,
      );
    }

    // Evaluate each qualified setup
    const qualifiedSetups = setupSnapshot.getQualifiedSetups();
    for (const setup of qualifiedSetups) {
      // Skip invalidated setups
      if (setup.status === SetupStatus.INVALIDATED || setup.invalidatedAt !== null) {
        continue;
      }

      const trigger = this.evaluateSetupForTrigger(
        setup,
        locationSnapshot,
        currentCandle,
        asOfTimeUTC,
        config,
      );

      if (trigger) {
        triggers.push(trigger);
      }
    }

    const snapshot = new TriggerSnapshot(
      setupSnapshot.symbol,
      asOfTimeUTC,
      setupSnapshot.knowledgeTimeUTC,
      config.rulesetVersion,
      config.configHash,
      triggers,
    );

    snapshot.seal();
    return snapshot;
  }

  private static evaluateSetupForTrigger(
    setup: Setup,
    locationSnapshot: LocationSnapshot,
    currentCandle: Candle,
    asOfTimeUTC: Date,
    config: TriggerEngineConfig,
  ): Trigger | null {
    // Get the source level from location snapshot
    const sourceLevelId = setup.sourceLevelId;
    const allLevels = locationSnapshot.getAllLevels();
    const sourceLevel = allLevels.find(l => l.levelId === sourceLevelId);

    if (!sourceLevel) {
      return null;
    }

    // Get current polarity state of the level
    const polarityState = locationSnapshot.getPolarityState(sourceLevelId);
    if (!polarityState) {
      return null;
    }

    const currentPolarity = polarityState.currentPolarity;
    const candleClose = currentCandle.ohlc.close;

    // CRITICAL: Option 4 — Check event history for invalidating opposite breaks
    // A qualified setup's retest must not have been subsequently broken
    const allEvents = locationSnapshot.getAllEvents();
    const hasInvalidatingBreak = this.checkForInvalidatingBreak(
      setup,
      sourceLevelId,
      allEvents,
      asOfTimeUTC,
    );

    if (hasInvalidatingBreak) {
      // Retest was broken after qualification; setup no longer triggerable
      return null;
    }

    // Evaluate based on setup type
    switch (setup.setupType) {
      case SetupType.PULLBACK_LONG:
        return this.evaluatePullbackLong(setup, sourceLevel, currentPolarity, candleClose, asOfTimeUTC, config);

      case SetupType.PULLBACK_SHORT:
        return this.evaluatePullbackShort(setup, sourceLevel, currentPolarity, candleClose, asOfTimeUTC, config);

      case SetupType.BREAKOUT_RETEST_LONG:
        return this.evaluateBreakoutRetestLong(setup, sourceLevel, currentPolarity, candleClose, asOfTimeUTC, config);

      case SetupType.BREAKOUT_RETEST_SHORT:
        return this.evaluateBreakoutRetestShort(setup, sourceLevel, currentPolarity, candleClose, asOfTimeUTC, config);

      default:
        return null;
    }
  }

  /**
   * OPTION 4: Explicit Retest Defense Check
   *
   * After a setup qualifies (break + interaction/retest), Part 7 must verify that
   * the retest has not been subsequently broken before allowing trigger confirmation.
   *
   * For LONG setups: Check if a bearish break occurred after the interaction event
   * For SHORT setups: Check if a bullish break occurred after the interaction event
   *
   * Causality: Only events with eventTimeUTC <= asOfTimeUTC are considered.
   * Future events cannot invalidate historical triggers.
   *
   * RETEST_INTERACTION ≠ RETEST_HELD
   * This method ensures Part 7 distinguishes between the two.
   */
  private static checkForInvalidatingBreak(
    setup: Setup,
    sourceLevelId: string,
    allEvents: LevelEvent[],
    asOfTimeUTC: Date,
  ): boolean {
    // Only check if setup has an interaction/retest event (qualified state)
    if (!setup.evidence.interactionEventTime) {
      return false; // No interaction recorded, can't have broken retest
    }

    const interactionTime = setup.evidence.interactionEventTime;
    const knowledgeTimeLimit = setup.knowledgeTimeUTC;

    // Filter events for this specific level
    const levelEvents = allEvents.filter(e => e.levelId === sourceLevelId);

    // Look for an invalidating opposite break after the interaction
    for (const event of levelEvents) {
      // Causality: event must be known at trigger evaluation time
      if (event.eventTimeUTC > asOfTimeUTC || event.knowledgeTimeUTC > asOfTimeUTC) {
        continue;
      }

      // Event must occur after the interaction/retest event
      if (event.eventTimeUTC <= interactionTime) {
        continue;
      }

      // Check for invalidating break based on setup direction
      if (event.eventType === LevelEventType.BREAK) {
        if (setup.direction === 'LONG' && event.direction === 'bearish') {
          // Bearish break after bullish setup's retest = invalidating
          return true;
        }
        if (setup.direction === 'SHORT' && event.direction === 'bullish') {
          // Bullish break after bearish setup's retest = invalidating
          return true;
        }
      }
    }

    return false;
  }

  private static evaluatePullbackLong(
    setup: Setup,
    sourceLevel: any,
    currentPolarity: LevelPolarity,
    candleClose: number,
    asOfTimeUTC: Date,
    config: TriggerEngineConfig,
  ): Trigger | null {
    // PULLBACK_LONG: Resistance broke bullish → became SUPPORT → interaction
    // Trigger: Price closes above the flipped SUPPORT (reclaim)

    if (setup.direction !== 'LONG') return null; // Direction mismatch
    if (currentPolarity !== LevelPolarity.SUPPORT) return null; // Level must be acting as SUPPORT

    // Check if price has reclaimed above the support level
    if (candleClose > sourceLevel.price) {
      return new Trigger(
        this.generateTriggerId(setup.setupId, TriggerType.BULLISH_RECLAIM),
        setup.symbol,
        setup.setupId,
        setup.setupType,
        'LONG',
        TriggerType.BULLISH_RECLAIM,
        sourceLevel.levelId,
        sourceLevel.price,
        asOfTimeUTC,
        candleClose,
        asOfTimeUTC,
        asOfTimeUTC,
        config.rulesetVersion,
        config.configHash,
      );
    }

    return null;
  }

  private static evaluatePullbackShort(
    setup: Setup,
    sourceLevel: any,
    currentPolarity: LevelPolarity,
    candleClose: number,
    asOfTimeUTC: Date,
    config: TriggerEngineConfig,
  ): Trigger | null {
    // PULLBACK_SHORT: Support broke bearish → became RESISTANCE → interaction
    // Trigger: Price closes below the flipped RESISTANCE (reclaim)

    if (setup.direction !== 'SHORT') return null; // Direction mismatch
    if (currentPolarity !== LevelPolarity.RESISTANCE) return null; // Level must be acting as RESISTANCE

    // Check if price has reclaimed below the resistance level
    if (candleClose < sourceLevel.price) {
      return new Trigger(
        this.generateTriggerId(setup.setupId, TriggerType.BEARISH_RECLAIM),
        setup.symbol,
        setup.setupId,
        setup.setupType,
        'SHORT',
        TriggerType.BEARISH_RECLAIM,
        sourceLevel.levelId,
        sourceLevel.price,
        asOfTimeUTC,
        candleClose,
        asOfTimeUTC,
        asOfTimeUTC,
        config.rulesetVersion,
        config.configHash,
      );
    }

    return null;
  }

  private static evaluateBreakoutRetestLong(
    setup: Setup,
    sourceLevel: any,
    currentPolarity: LevelPolarity,
    candleClose: number,
    asOfTimeUTC: Date,
    config: TriggerEngineConfig,
  ): Trigger | null {
    // BREAKOUT_RETEST_LONG: Resistance broke bullish → became SUPPORT → retest
    // Trigger: Price moving above original resistance after retest (breakout/reversal)

    if (setup.direction !== 'LONG') return null; // Direction mismatch
    if (currentPolarity !== LevelPolarity.SUPPORT) return null; // Level must be acting as SUPPORT after break

    // After a retest has occurred (setup is QUALIFIED), we look for price moving above
    // the original resistance level (which is now sourceLevel.price)
    if (candleClose > sourceLevel.price) {
      return new Trigger(
        this.generateTriggerId(setup.setupId, TriggerType.BULLISH_BREAKOUT),
        setup.symbol,
        setup.setupId,
        setup.setupType,
        'LONG',
        TriggerType.BULLISH_BREAKOUT,
        sourceLevel.levelId,
        sourceLevel.price,
        asOfTimeUTC,
        candleClose,
        asOfTimeUTC,
        asOfTimeUTC,
        config.rulesetVersion,
        config.configHash,
      );
    }

    return null;
  }

  private static evaluateBreakoutRetestShort(
    setup: Setup,
    sourceLevel: any,
    currentPolarity: LevelPolarity,
    candleClose: number,
    asOfTimeUTC: Date,
    config: TriggerEngineConfig,
  ): Trigger | null {
    // BREAKOUT_RETEST_SHORT: Support broke bearish → became RESISTANCE → retest
    // Trigger: Price moving below original support after retest (breakdown/reversal)

    if (setup.direction !== 'SHORT') return null; // Direction mismatch
    if (currentPolarity !== LevelPolarity.RESISTANCE) return null; // Level must be acting as RESISTANCE after break

    // After a retest has occurred (setup is QUALIFIED), we look for price moving below
    // the original support level (which is now sourceLevel.price)
    if (candleClose < sourceLevel.price) {
      return new Trigger(
        this.generateTriggerId(setup.setupId, TriggerType.BEARISH_BREAKDOWN),
        setup.symbol,
        setup.setupId,
        setup.setupType,
        'SHORT',
        TriggerType.BEARISH_BREAKDOWN,
        sourceLevel.levelId,
        sourceLevel.price,
        asOfTimeUTC,
        candleClose,
        asOfTimeUTC,
        asOfTimeUTC,
        config.rulesetVersion,
        config.configHash,
      );
    }

    return null;
  }

  private static generateTriggerId(setupId: string, triggerType: TriggerType): string {
    return `${triggerType}_${setupId}`;
  }
}
