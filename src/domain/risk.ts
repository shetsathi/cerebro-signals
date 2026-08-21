import { TriggerType } from './trigger';
import { SetupType } from './setup';

/**
 * Risk Status Enumeration for Part 8 — Risk Engine
 *
 * INVALID: Stop geometry is invalid (wrong side of Entry)
 * UNKNOWN: No reliable opposing structural target exists
 * REJECTED: R:R < minimumRR (risk/reward constraint failed)
 * VALID: All geometric and R:R constraints satisfied
 */
export enum RiskStatus {
  INVALID = 'INVALID',
  UNKNOWN = 'UNKNOWN',
  REJECTED = 'REJECTED',
  VALID = 'VALID',
}

export class Risk {
  readonly riskId: string;
  readonly symbol: string;
  readonly triggerId: string;
  readonly setupId: string;
  readonly setupType: SetupType;
  readonly direction: 'LONG' | 'SHORT';
  readonly triggerType: TriggerType;

  readonly status: RiskStatus;
  readonly statusReason: string;

  readonly entry: number;
  readonly stop: number;
  readonly target: number | null;

  readonly risk: number;
  readonly reward: number | null;
  readonly riskRewardRatio: number | null;

  readonly stopLevelId: string;
  readonly targetLevelId: string | null;
  readonly targetLevelPrice: number | null;

  readonly minimumRR: number;

  readonly knowledgeTimeUTC: Date;
  readonly asOfTimeUTC: Date;

  readonly rulesetVersion: string;
  readonly configHash: string;

  constructor(
    riskId: string,
    symbol: string,
    triggerId: string,
    setupId: string,
    setupType: SetupType,
    direction: 'LONG' | 'SHORT',
    triggerType: TriggerType,
    status: RiskStatus,
    statusReason: string,
    entry: number,
    stop: number,
    target: number | null,
    risk: number,
    reward: number | null,
    riskRewardRatio: number | null,
    stopLevelId: string,
    targetLevelId: string | null,
    targetLevelPrice: number | null,
    minimumRR: number,
    knowledgeTimeUTC: Date,
    asOfTimeUTC: Date,
    rulesetVersion: string,
    configHash: string,
  ) {
    this.riskId = riskId;
    this.symbol = symbol;
    this.triggerId = triggerId;
    this.setupId = setupId;
    this.setupType = setupType;
    this.direction = direction;
    this.triggerType = triggerType;
    this.status = status;
    this.statusReason = statusReason;
    this.entry = entry;
    this.stop = stop;
    this.target = target;
    this.risk = risk;
    this.reward = reward;
    this.riskRewardRatio = riskRewardRatio;
    this.stopLevelId = stopLevelId;
    this.targetLevelId = targetLevelId;
    this.targetLevelPrice = targetLevelPrice;
    this.minimumRR = minimumRR;
    this.knowledgeTimeUTC = new Date(knowledgeTimeUTC.getTime());
    this.asOfTimeUTC = new Date(asOfTimeUTC.getTime());
    this.rulesetVersion = rulesetVersion;
    this.configHash = configHash;
    Object.freeze(this);
  }

  toString(): string {
    const targetStr = this.target !== null ? this.target.toFixed(2) : 'null';
    const rrStr = this.riskRewardRatio !== null ? this.riskRewardRatio.toFixed(2) : 'N/A';
    return `Risk(${this.riskId} ${this.symbol} ${this.setupType} ${this.status} R:R=${rrStr} @ ${this.asOfTimeUTC.toISOString()})`;
  }
}
