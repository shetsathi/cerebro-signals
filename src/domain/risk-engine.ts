import { TriggerSnapshot } from './trigger-snapshot';
import { LocationSnapshot } from './location-snapshot';
import { StructureSnapshot } from './structure-snapshot';
import { Risk, RiskStatus } from './risk';
import { RiskSnapshot } from './risk-snapshot';
import { LevelPolarity } from './level';

export interface RiskEngineConfig {
  minimumRR: number; // Default 2.0
  rulesetVersion: string;
  configHash: string;
}

/**
 * Part 8 — Deterministic Risk Engine
 *
 * Validates triggered trades against structural risk constraints.
 *
 * Risk is a safety/validation layer between Trigger and Decision.
 * Risk does NOT make final trading decisions (LONG/SHORT/WAIT).
 * Risk outputs: VALID, REJECTED, INVALID, UNKNOWN
 *
 * Frozen rules:
 * - Entry = Trigger.confirmationClose (deterministic reference price)
 * - Stop = Setup.evidence.sourceLevelPrice (structural invalidation level)
 * - Target = nearest valid opposing structural level by price
 * - R:R = Reward / Risk must be >= minimumRR for VALID
 * - No look-ahead: only causal data (eventTimeUTC <= asOfTimeUTC)
 */
export class RiskEngine {
  static getRiskSnapshot(
    triggerSnapshot: TriggerSnapshot,
    locationSnapshot: LocationSnapshot,
    asOfTimeUTC: Date,
    config: RiskEngineConfig,
  ): RiskSnapshot {
    const risks: Risk[] = [];

    // Evaluate each trigger for risk validity
    const allTriggers = triggerSnapshot.getAllTriggers();
    for (const trigger of allTriggers) {
      const risk = this.evaluateTriggerForRisk(
        trigger,
        locationSnapshot,
        asOfTimeUTC,
        config,
      );
      if (risk) {
        risks.push(risk);
      }
    }

    const snapshot = new RiskSnapshot(
      triggerSnapshot.symbol,
      asOfTimeUTC,
      triggerSnapshot.knowledgeTimeUTC,
      config.rulesetVersion,
      config.configHash,
      risks,
    );

    snapshot.seal();
    return snapshot;
  }

  private static evaluateTriggerForRisk(
    trigger: any,
    locationSnapshot: LocationSnapshot,
    asOfTimeUTC: Date,
    config: RiskEngineConfig,
  ): Risk | null {
    // Entry: Trigger confirmation close
    const entry = trigger.confirmationClose;

    // Stop: Setup evidence source level price
    const stop = trigger.referenceLevelPrice; // This IS the stop reference from Setup

    const stopLevelId = trigger.referenceLevelId;

    // Causality check: trigger knowledge time must be before evaluation
    if (trigger.knowledgeTimeUTC > asOfTimeUTC) {
      return null;
    }

    // Validate stop geometry
    const stopGeometryValid = this.isStopGeometryValid(
      trigger.direction,
      entry,
      stop,
    );

    if (!stopGeometryValid) {
      const riskId = `RISK_${trigger.triggerId}_INVALID`;
      return new Risk(
        riskId,
        trigger.symbol,
        trigger.triggerId,
        trigger.setupId,
        trigger.setupType,
        trigger.direction,
        trigger.triggerType,
        RiskStatus.INVALID,
        `Stop is on wrong side of Entry (geometry error)`,
        entry,
        stop,
        null,
        0,
        null,
        null,
        stopLevelId,
        null,
        null,
        config.minimumRR,
        trigger.knowledgeTimeUTC,
        asOfTimeUTC,
        config.rulesetVersion,
        config.configHash,
      );
    }

    // Calculate risk
    const risk = Math.abs(entry - stop);

    // Find target: nearest valid opposing structural level
    const targetInfo = this.findTargetLevel(
      trigger.direction,
      entry,
      locationSnapshot,
      asOfTimeUTC,
    );

    if (!targetInfo) {
      const riskId = `RISK_${trigger.triggerId}_UNKNOWN`;
      return new Risk(
        riskId,
        trigger.symbol,
        trigger.triggerId,
        trigger.setupId,
        trigger.setupType,
        trigger.direction,
        trigger.triggerType,
        RiskStatus.UNKNOWN,
        `No reliable opposing structural target level exists in target direction`,
        entry,
        stop,
        null,
        risk,
        null,
        null,
        stopLevelId,
        null,
        null,
        config.minimumRR,
        trigger.knowledgeTimeUTC,
        asOfTimeUTC,
        config.rulesetVersion,
        config.configHash,
      );
    }

    const target = targetInfo.price;
    const targetLevelId = targetInfo.levelId;

    // Calculate reward
    const reward = Math.abs(target - entry);

    // Calculate R:R
    const riskRewardRatio = risk > 0 ? reward / risk : 0;

    // Determine status
    let status: RiskStatus;
    let statusReason: string;

    if (riskRewardRatio < config.minimumRR) {
      status = RiskStatus.REJECTED;
      statusReason = `R:R = ${riskRewardRatio.toFixed(2)} is below minimumRR = ${config.minimumRR.toFixed(2)}`;
    } else {
      status = RiskStatus.VALID;
      statusReason = `Geometric validation passed: Entry=${entry.toFixed(2)}, Stop=${stop.toFixed(2)}, Target=${target.toFixed(2)}, R:R=${riskRewardRatio.toFixed(2)}`;
    }

    const riskId = `RISK_${trigger.triggerId}_${status}`;

    return new Risk(
      riskId,
      trigger.symbol,
      trigger.triggerId,
      trigger.setupId,
      trigger.setupType,
      trigger.direction,
      trigger.triggerType,
      status,
      statusReason,
      entry,
      stop,
      target,
      risk,
      reward,
      riskRewardRatio,
      stopLevelId,
      targetLevelId,
      target,
      config.minimumRR,
      trigger.knowledgeTimeUTC,
      asOfTimeUTC,
      config.rulesetVersion,
      config.configHash,
    );
  }

  private static isStopGeometryValid(
    direction: 'LONG' | 'SHORT',
    entry: number,
    stop: number,
  ): boolean {
    if (direction === 'LONG') {
      // For LONG, stop must be below entry
      return stop < entry;
    } else {
      // For SHORT, stop must be above entry
      return stop > entry;
    }
  }

  private static findTargetLevel(
    direction: 'LONG' | 'SHORT',
    entry: number,
    locationSnapshot: LocationSnapshot,
    asOfTimeUTC: Date,
  ): { price: number; levelId: string } | null {
    const allLevels = locationSnapshot.getAllLevels();

    // Filter by causality
    const validLevels = allLevels.filter(l => l.knowledgeTimeUTC <= asOfTimeUTC);

    if (direction === 'LONG') {
      // Target: RESISTANCE above Entry, nearest by price
      const candidates = validLevels.filter(
        l =>
          l.polarity === LevelPolarity.RESISTANCE &&
          l.price > entry,
      );

      if (candidates.length === 0) {
        return null;
      }

      // Sort by price ascending (nearest above Entry first)
      candidates.sort((a, b) => a.price - b.price);

      return {
        price: candidates[0].price,
        levelId: candidates[0].levelId,
      };
    } else {
      // Target: SUPPORT below Entry, nearest by price
      const candidates = validLevels.filter(
        l =>
          l.polarity === LevelPolarity.SUPPORT &&
          l.price < entry,
      );

      if (candidates.length === 0) {
        return null;
      }

      // Sort by price descending (nearest below Entry first)
      candidates.sort((a, b) => b.price - a.price);

      return {
        price: candidates[0].price,
        levelId: candidates[0].levelId,
      };
    }
  }
}
