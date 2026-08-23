import { RiskSnapshot } from './risk-snapshot';
import { DecisionSnapshot } from './decision-snapshot';
import { Decision, DecisionAction } from './decision';
import { RiskStatus } from './risk';

export interface DecisionEngineConfig {
  rulesetVersion: string;
  configHash: string;
}

/**
 * Part 9 — Deterministic Decision Engine
 *
 * Frozen Rules:
 * Rule 1: VALID + direction LONG → Decision.LONG
 * Rule 2: VALID + direction SHORT → Decision.SHORT
 * Rule 3: Multiple same-direction VALID → collapse to one decision (reference all riskIds)
 * Rule 4: Opposing VALID (LONG + SHORT) → Decision.WAIT
 * Rule 5: Non-VALID (REJECTED/INVALID/UNKNOWN) → Decision.WAIT
 * Rule 6: No risks at all → Decision.WAIT
 *
 * Input: RiskSnapshot only (no re-querying upstream)
 * Output: DecisionSnapshot (sealed, immutable)
 * Determinism: Same RiskSnapshot → identical DecisionSnapshot
 */
export class DecisionEngine {
  static getDecisionSnapshot(
    riskSnapshot: RiskSnapshot,
    asOfTimeUTC: Date,
    config: DecisionEngineConfig,
  ): DecisionSnapshot {
    const decisions: Decision[] = [];

    // Guard: causality check
    if (riskSnapshot.asOfTimeUTC > asOfTimeUTC) {
      throw new Error(
        `Look-ahead violation: RiskSnapshot.asOfTimeUTC ${riskSnapshot.asOfTimeUTC.toISOString()} exceeds evaluation time ${asOfTimeUTC.toISOString()}`,
      );
    }

    // Collect all risks
    const allRisks = riskSnapshot.getAllRisks();

    // Separate VALID risks by direction (Rule 1–3)
    const validLongRisks = allRisks.filter(
      r => r.status === RiskStatus.VALID && r.direction === 'LONG',
    );
    const validShortRisks = allRisks.filter(
      r => r.status === RiskStatus.VALID && r.direction === 'SHORT',
    );

    // Rule 4: Check for conflict (both LONG and SHORT valid)
    if (validLongRisks.length > 0 && validShortRisks.length > 0) {
      // Conflict: opposing valid directions
      const conflictDecision = new Decision(
        `DECISION_${riskSnapshot.symbol}_CONFLICT_WAIT`,
        riskSnapshot.symbol,
        [], // No specific risk association
        DecisionAction.WAIT,
        'Conflicting directional signals; no unambiguous direction',
        riskSnapshot.knowledgeTimeUTC,
        asOfTimeUTC,
        config.rulesetVersion,
        config.configHash,
      );
      decisions.push(conflictDecision);
    } else if (validLongRisks.length > 0) {
      // Rule 1 + Rule 3: VALID LONG → single LONG decision
      // Multiple LONG risks collapse into one decision, referencing all riskIds
      const longDecision = new Decision(
        `DECISION_${riskSnapshot.symbol}_LONG`,
        riskSnapshot.symbol,
        validLongRisks.map(r => r.riskId), // All riskIds
        DecisionAction.LONG,
        `Risk VALID + direction LONG (${validLongRisks.length} risk${validLongRisks.length !== 1 ? 's' : ''})`,
        riskSnapshot.knowledgeTimeUTC,
        asOfTimeUTC,
        config.rulesetVersion,
        config.configHash,
      );
      decisions.push(longDecision);
    } else if (validShortRisks.length > 0) {
      // Rule 2 + Rule 3: VALID SHORT → single SHORT decision
      // Multiple SHORT risks collapse into one decision, referencing all riskIds
      const shortDecision = new Decision(
        `DECISION_${riskSnapshot.symbol}_SHORT`,
        riskSnapshot.symbol,
        validShortRisks.map(r => r.riskId), // All riskIds
        DecisionAction.SHORT,
        `Risk VALID + direction SHORT (${validShortRisks.length} risk${validShortRisks.length !== 1 ? 's' : ''})`,
        riskSnapshot.knowledgeTimeUTC,
        asOfTimeUTC,
        config.rulesetVersion,
        config.configHash,
      );
      decisions.push(shortDecision);
    } else {
      // Rule 5–6: No VALID risks → WAIT
      const nonValidRisks = allRisks.filter(r => r.status !== RiskStatus.VALID);

      let reason = 'No valid directional opportunity exists';
      if (nonValidRisks.length > 0) {
        // Categorize non-VALID risks for diagnostic reason
        const statusCounts: Record<string, number> = {};
        for (const risk of nonValidRisks) {
          statusCounts[risk.status] = (statusCounts[risk.status] || 0) + 1;
        }

        const counts = Object.entries(statusCounts)
          .map(([status, count]) => `${status}(${count})`)
          .join(', ');
        reason = `No VALID risks available: ${counts}`;
      }

      const waitDecision = new Decision(
        `DECISION_${riskSnapshot.symbol}_WAIT`,
        riskSnapshot.symbol,
        [], // No specific risk association
        DecisionAction.WAIT,
        reason,
        riskSnapshot.knowledgeTimeUTC,
        asOfTimeUTC,
        config.rulesetVersion,
        config.configHash,
      );
      decisions.push(waitDecision);
    }

    // Create snapshot and seal
    const snapshot = new DecisionSnapshot(
      riskSnapshot.symbol,
      asOfTimeUTC,
      riskSnapshot.knowledgeTimeUTC,
      config.rulesetVersion,
      config.configHash,
      decisions,
    );

    snapshot.seal();
    return snapshot;
  }
}
