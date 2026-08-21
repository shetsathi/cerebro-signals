import { Risk } from './risk';

export class RiskSnapshot {
  readonly symbol: string;
  readonly asOfTimeUTC: Date;
  readonly knowledgeTimeUTC: Date;
  readonly rulesetVersion: string;
  readonly configHash: string;

  private readonly risksMap: Map<string, Risk>;
  private sealed: boolean = false;

  constructor(
    symbol: string,
    asOfTimeUTC: Date,
    knowledgeTimeUTC: Date,
    rulesetVersion: string,
    configHash: string,
    risks: Risk[],
  ) {
    this.symbol = symbol;
    this.asOfTimeUTC = new Date(asOfTimeUTC.getTime());
    this.knowledgeTimeUTC = new Date(knowledgeTimeUTC.getTime());
    this.rulesetVersion = rulesetVersion;
    this.configHash = configHash;

    this.risksMap = new Map();
    for (const risk of risks) {
      this.risksMap.set(risk.riskId, risk);
    }
  }

  seal(): void {
    this.sealed = true;
    Object.freeze(this.risksMap);
    Object.freeze(this);
  }

  isSealed(): boolean {
    return this.sealed;
  }

  getAllRisks(): Risk[] {
    return Array.from(this.risksMap.values());
  }

  getRiskById(riskId: string): Risk | undefined {
    return this.risksMap.get(riskId);
  }

  getRisksByTriggerId(triggerId: string): Risk[] {
    return this.getAllRisks().filter(r => r.triggerId === triggerId);
  }

  getRisksBySetupId(setupId: string): Risk[] {
    return this.getAllRisks().filter(r => r.setupId === setupId);
  }

  toString(): string {
    return `RiskSnapshot(${this.symbol} @ ${this.asOfTimeUTC.toISOString()}) [${this.risksMap.size} risks]`;
  }
}
