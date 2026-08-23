import { Decision, DecisionAction } from './decision';

/**
 * DecisionSnapshot — Immutable container for Part 9 decisions
 *
 * Sealed and frozen following Part 8 (RiskSnapshot) pattern.
 * Provides query methods for accessing decisions by action.
 * All decisions are immutable references.
 */
export class DecisionSnapshot {
  readonly symbol: string;
  readonly asOfTimeUTC: Date;
  readonly knowledgeTimeUTC: Date;
  readonly rulesetVersion: string;
  readonly configHash: string;

  private readonly decisionsMap: Map<string, Decision>;
  private sealed: boolean = false;

  constructor(
    symbol: string,
    asOfTimeUTC: Date,
    knowledgeTimeUTC: Date,
    rulesetVersion: string,
    configHash: string,
    decisions: Decision[],
  ) {
    this.symbol = symbol;
    this.asOfTimeUTC = new Date(asOfTimeUTC.getTime());
    this.knowledgeTimeUTC = new Date(knowledgeTimeUTC.getTime());
    this.rulesetVersion = rulesetVersion;
    this.configHash = configHash;

    this.decisionsMap = new Map();
    for (const decision of decisions) {
      this.decisionsMap.set(decision.decisionId, decision);
    }
  }

  seal(): void {
    this.sealed = true;
    Object.freeze(this.decisionsMap);
    Object.freeze(this);
  }

  isSealed(): boolean {
    return this.sealed;
  }

  getAllDecisions(): Decision[] {
    return Array.from(this.decisionsMap.values());
  }

  getDecisionById(decisionId: string): Decision | undefined {
    return this.decisionsMap.get(decisionId);
  }

  getDecisionsByAction(action: DecisionAction): Decision[] {
    return this.getAllDecisions().filter(d => d.action === action);
  }

  getLongDecisions(): Decision[] {
    return this.getDecisionsByAction(DecisionAction.LONG);
  }

  getShortDecisions(): Decision[] {
    return this.getDecisionsByAction(DecisionAction.SHORT);
  }

  getWaitDecisions(): Decision[] {
    return this.getDecisionsByAction(DecisionAction.WAIT);
  }

  toString(): string {
    return `DecisionSnapshot(${this.symbol} @ ${this.asOfTimeUTC.toISOString()}) [${this.decisionsMap.size} decisions]`;
  }
}
