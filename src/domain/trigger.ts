import { SetupType } from './setup';

/**
 * Trigger Type Enumeration for Part 7 — Trigger Engine
 *
 * IMPLEMENTED:
 * - BULLISH_RECLAIM: Price closes above flipped SUPPORT (PULLBACK_LONG)
 * - BEARISH_RECLAIM: Price closes below flipped RESISTANCE (PULLBACK_SHORT)
 * - BULLISH_BREAKOUT: Price closes above original RESISTANCE after retest (BREAKOUT_RETEST_LONG)
 * - BEARISH_BREAKDOWN: Price closes below original SUPPORT after retest (BREAKOUT_RETEST_SHORT)
 *
 * DEFINED IN V1 SPECIFICATION BUT NOT YET EXECUTABLE:
 * - BULLISH_REVERSAL: Reserved for future Part 7 enhancement when reversal execution
 *   semantics are formally specified. Do NOT invent reversal logic without explicit
 *   V1 design decision.
 * - BEARISH_REVERSAL: Reserved for future Part 7 enhancement when reversal execution
 *   semantics are formally specified. Do NOT invent reversal logic without explicit
 *   V1 design decision.
 */
export enum TriggerType {
  BULLISH_RECLAIM = 'BULLISH_RECLAIM',
  BEARISH_RECLAIM = 'BEARISH_RECLAIM',
  BULLISH_BREAKOUT = 'BULLISH_BREAKOUT',
  BEARISH_BREAKDOWN = 'BEARISH_BREAKDOWN',
  BULLISH_REVERSAL = 'BULLISH_REVERSAL',
  BEARISH_REVERSAL = 'BEARISH_REVERSAL',
}

export class Trigger {
  readonly triggerId: string;
  readonly symbol: string;
  readonly setupId: string;
  readonly setupType: SetupType;
  readonly direction: 'LONG' | 'SHORT';
  readonly triggerType: TriggerType;
  readonly referenceLevelId: string;
  readonly referenceLevelPrice: number;
  readonly confirmationCloseUTC: Date;
  readonly confirmationClose: number;
  readonly knowledgeTimeUTC: Date;
  readonly asOfTimeUTC: Date;
  readonly rulesetVersion: string;
  readonly configHash: string;

  constructor(
    triggerId: string,
    symbol: string,
    setupId: string,
    setupType: SetupType,
    direction: 'LONG' | 'SHORT',
    triggerType: TriggerType,
    referenceLevelId: string,
    referenceLevelPrice: number,
    confirmationCloseUTC: Date,
    confirmationClose: number,
    knowledgeTimeUTC: Date,
    asOfTimeUTC: Date,
    rulesetVersion: string,
    configHash: string,
  ) {
    this.triggerId = triggerId;
    this.symbol = symbol;
    this.setupId = setupId;
    this.setupType = setupType;
    this.direction = direction;
    this.triggerType = triggerType;
    this.referenceLevelId = referenceLevelId;
    this.referenceLevelPrice = referenceLevelPrice;
    this.confirmationCloseUTC = new Date(confirmationCloseUTC.getTime());
    this.confirmationClose = confirmationClose;
    this.knowledgeTimeUTC = new Date(knowledgeTimeUTC.getTime());
    this.asOfTimeUTC = new Date(asOfTimeUTC.getTime());
    this.rulesetVersion = rulesetVersion;
    this.configHash = configHash;
    Object.freeze(this);
  }

  toString(): string {
    return `Trigger(${this.triggerId} ${this.symbol} ${this.triggerType} ${this.direction} @ ${this.confirmationCloseUTC.toISOString()})`;
  }
}
