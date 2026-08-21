import { Timeframe } from './timeframe';

export enum SetupType {
  PULLBACK_LONG = 'PULLBACK_LONG',
  PULLBACK_SHORT = 'PULLBACK_SHORT',
  BREAKOUT_RETEST_LONG = 'BREAKOUT_RETEST_LONG',
  BREAKOUT_RETEST_SHORT = 'BREAKOUT_RETEST_SHORT',
}

export enum SetupStatus {
  NONE = 'NONE',
  FORMING = 'FORMING',
  QUALIFIED = 'QUALIFIED',
  INVALIDATED = 'INVALIDATED',
  // EXPIRED removed (V1): no time-based expiration implemented
}

export interface SetupEvidence {
  sourceLevelId: string;
  sourceLevelPrice: number;
  sourceLevelOrigin: string;
  sourceLevelPolarity: 'SUPPORT' | 'RESISTANCE';

  breakEventId: string | null;
  breakEventTime: Date | null;
  breakDirection: 'bullish' | 'bearish' | null;
  breakMechanism: 'TRADED' | 'GAPPED' | null;

  flippedPolarity: 'SUPPORT' | 'RESISTANCE' | null;
  flippedPolarityTime: Date | null;

  interactionEventId: string | null;
  interactionEventTime: Date | null;
  interactionType: 'INTERACTION' | 'RETEST_INTERACTION' | null;

  invalidatingBreakEventId: string | null;
  invalidatingBreakTime: Date | null;
}

export interface SetupGeometry {
  sourceTimeframe: Timeframe;
  sourceLevelPrice: number;
  flippedLevelPrice: number;
  currentTimeframeValue: string;
}

export class Setup {
  readonly setupId: string;
  readonly symbol: string;
  readonly setupType: SetupType;
  readonly direction: 'LONG' | 'SHORT';
  readonly status: SetupStatus;
  readonly timeframe: Timeframe;

  readonly createdAt: Date;
  readonly formingAt: Date | null;
  readonly qualifiedAt: Date | null;
  readonly invalidatedAt: Date | null;
  readonly invalidationReason: string | null;
  readonly expiredAt: Date | null;

  readonly knowledgeTimeUTC: Date;
  readonly asOfTimeUTC: Date;

  readonly sourceLevelId: string;
  readonly evidence: SetupEvidence;
  readonly geometry: SetupGeometry;

  readonly rulesetVersion: string;
  readonly configHash: string;

  constructor(
    setupId: string,
    symbol: string,
    setupType: SetupType,
    direction: 'LONG' | 'SHORT',
    status: SetupStatus,
    timeframe: Timeframe,
    createdAt: Date,
    formingAt: Date | null,
    qualifiedAt: Date | null,
    invalidatedAt: Date | null,
    invalidationReason: string | null,
    expiredAt: Date | null,
    knowledgeTimeUTC: Date,
    asOfTimeUTC: Date,
    sourceLevelId: string,
    evidence: SetupEvidence,
    geometry: SetupGeometry,
    rulesetVersion: string,
    configHash: string,
  ) {
    this.setupId = setupId;
    this.symbol = symbol;
    this.setupType = setupType;
    this.direction = direction;
    this.status = status;
    this.timeframe = timeframe;
    this.createdAt = new Date(createdAt.getTime());
    this.formingAt = formingAt ? new Date(formingAt.getTime()) : null;
    this.qualifiedAt = qualifiedAt ? new Date(qualifiedAt.getTime()) : null;
    this.invalidatedAt = invalidatedAt ? new Date(invalidatedAt.getTime()) : null;
    this.invalidationReason = invalidationReason;
    this.expiredAt = expiredAt ? new Date(expiredAt.getTime()) : null;
    this.knowledgeTimeUTC = new Date(knowledgeTimeUTC.getTime());
    this.asOfTimeUTC = new Date(asOfTimeUTC.getTime());
    this.sourceLevelId = sourceLevelId;
    this.evidence = { ...evidence };
    this.geometry = { ...geometry };
    this.rulesetVersion = rulesetVersion;
    this.configHash = configHash;
    Object.freeze(this);
  }

  toString(): string {
    return `Setup(${this.setupId} ${this.symbol} ${this.setupType} ${this.status} @ ${this.asOfTimeUTC.toISOString()})`;
  }
}
