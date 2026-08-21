import { Setup, SetupType, SetupStatus } from './setup';

export class SetupSnapshot {
  readonly symbol: string;
  readonly asOfTimeUTC: Date;
  readonly knowledgeTimeUTC: Date;
  readonly rulesetVersion: string;
  readonly configHash: string;

  private readonly setupsMap: Map<string, Setup>;
  private sealed: boolean = false;

  constructor(
    symbol: string,
    asOfTimeUTC: Date,
    knowledgeTimeUTC: Date,
    rulesetVersion: string,
    configHash: string,
    setups: Setup[],
  ) {
    this.symbol = symbol;
    this.asOfTimeUTC = new Date(asOfTimeUTC.getTime());
    this.knowledgeTimeUTC = new Date(knowledgeTimeUTC.getTime());
    this.rulesetVersion = rulesetVersion;
    this.configHash = configHash;

    // Freeze setups in map
    this.setupsMap = new Map();
    for (const setup of setups) {
      this.setupsMap.set(setup.setupId, setup);
    }
  }

  seal(): void {
    this.sealed = true;
    Object.freeze(this.setupsMap);
    Object.freeze(this);
  }

  isSealed(): boolean {
    return this.sealed;
  }

  getAllSetups(): Setup[] {
    return Array.from(this.setupsMap.values());
  }

  getSetupsByStatus(status: SetupStatus): Setup[] {
    return this.getAllSetups().filter(s => s.status === status);
  }

  getSetupById(setupId: string): Setup | undefined {
    const setup = this.setupsMap.get(setupId);
    return setup ? setup : undefined;
  }

  getQualifiedSetups(): Setup[] {
    return this.getSetupsByStatus(SetupStatus.QUALIFIED);
  }

  getFormingSetups(): Setup[] {
    return this.getSetupsByStatus(SetupStatus.FORMING);
  }

  getInvalidatedSetups(): Setup[] {
    return this.getSetupsByStatus(SetupStatus.INVALIDATED);
  }

  toString(): string {
    return `SetupSnapshot(${this.symbol} @ ${this.asOfTimeUTC.toISOString()}) [${this.setupsMap.size} setups]`;
  }
}
