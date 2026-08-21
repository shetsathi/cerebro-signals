import { Trigger } from './trigger';

export class TriggerSnapshot {
  readonly symbol: string;
  readonly asOfTimeUTC: Date;
  readonly knowledgeTimeUTC: Date;
  readonly rulesetVersion: string;
  readonly configHash: string;

  private readonly triggersMap: Map<string, Trigger>;
  private sealed: boolean = false;

  constructor(
    symbol: string,
    asOfTimeUTC: Date,
    knowledgeTimeUTC: Date,
    rulesetVersion: string,
    configHash: string,
    triggers: Trigger[],
  ) {
    this.symbol = symbol;
    this.asOfTimeUTC = new Date(asOfTimeUTC.getTime());
    this.knowledgeTimeUTC = new Date(knowledgeTimeUTC.getTime());
    this.rulesetVersion = rulesetVersion;
    this.configHash = configHash;

    // Freeze triggers in map
    this.triggersMap = new Map();
    for (const trigger of triggers) {
      this.triggersMap.set(trigger.triggerId, trigger);
    }
  }

  seal(): void {
    this.sealed = true;
    Object.freeze(this.triggersMap);
    Object.freeze(this);
  }

  isSealed(): boolean {
    return this.sealed;
  }

  getAllTriggers(): Trigger[] {
    return Array.from(this.triggersMap.values());
  }

  getTriggerById(triggerId: string): Trigger | undefined {
    const trigger = this.triggersMap.get(triggerId);
    return trigger ? trigger : undefined;
  }

  getTriggersBySetupId(setupId: string): Trigger[] {
    return this.getAllTriggers().filter(t => t.setupId === setupId);
  }

  toString(): string {
    return `TriggerSnapshot(${this.symbol} @ ${this.asOfTimeUTC.toISOString()}) [${this.triggersMap.size} triggers]`;
  }
}
