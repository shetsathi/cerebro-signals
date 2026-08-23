/**
 * Part 9 — Deterministic Decision Engine
 *
 * Decision class represents a deterministic V1 decision: LONG, SHORT, or WAIT.
 *
 * Semantics:
 * - LONG: Deterministic V1 decision that a valid long directional opportunity
 *   has passed upstream validation and Risk constraints.
 * - SHORT: Deterministic V1 decision that a valid short directional opportunity
 *   has passed upstream validation and Risk constraints.
 * - WAIT: No unambiguous valid directional opportunity exists at evaluation time.
 *
 * These are decision-support outputs only. NOT broker orders, NOT sizing,
 * NOT probability predictions, NOT recommendations.
 *
 * Immutability: Decision is frozen after construction.
 * Causality: Includes asOfTimeUTC and knowledgeTimeUTC for replaying.
 * Determinism: Same RiskSnapshot → same Decision.
 */

export enum DecisionAction {
  LONG = 'LONG',
  SHORT = 'SHORT',
  WAIT = 'WAIT',
}

export class Decision {
  readonly decisionId: string;
  readonly symbol: string;
  readonly riskIds: readonly string[]; // Immutable reference to riskIds
  readonly action: DecisionAction;
  readonly reason: string;

  readonly knowledgeTimeUTC: Date;
  readonly asOfTimeUTC: Date;

  readonly rulesetVersion: string;
  readonly configHash: string;

  constructor(
    decisionId: string,
    symbol: string,
    riskIds: string[],
    action: DecisionAction,
    reason: string,
    knowledgeTimeUTC: Date,
    asOfTimeUTC: Date,
    rulesetVersion: string,
    configHash: string,
  ) {
    this.decisionId = decisionId;
    this.symbol = symbol;
    this.riskIds = Object.freeze([...riskIds]); // Defensive copy + freeze array
    this.action = action;
    this.reason = reason;
    this.knowledgeTimeUTC = new Date(knowledgeTimeUTC.getTime());
    this.asOfTimeUTC = new Date(asOfTimeUTC.getTime());
    this.rulesetVersion = rulesetVersion;
    this.configHash = configHash;

    Object.freeze(this);
  }

  toString(): string {
    return `Decision(${this.decisionId} ${this.symbol} ${this.action} @ ${this.asOfTimeUTC.toISOString()})`;
  }
}
