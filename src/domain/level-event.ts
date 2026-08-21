import { Timeframe } from './timeframe';

export enum LevelEventType {
  INTERACTION = 'INTERACTION',
  BREAK = 'BREAK',
  WICK_REJECTION = 'WICK_REJECTION',
  FAILED_BREAK = 'FAILED_BREAK',
  RETEST_INTERACTION = 'RETEST_INTERACTION',
}

export enum BreakMechanism {
  TRADED = 'TRADED',
  GAPPED = 'GAPPED',
}

export class LevelEvent {
  readonly eventId: string;
  readonly levelId: string;
  readonly eventType: LevelEventType;
  readonly direction?: 'bullish' | 'bearish';
  readonly breakMechanism?: BreakMechanism;
  readonly candleTimeframe: Timeframe;
  readonly eventTimeUTC: Date;
  readonly knowledgeTimeUTC: Date;

  constructor(
    eventId: string,
    levelId: string,
    eventType: LevelEventType,
    candleTimeframe: Timeframe,
    eventTimeUTC: Date,
    knowledgeTimeUTC: Date,
    direction?: 'bullish' | 'bearish',
    breakMechanism?: BreakMechanism,
  ) {
    this.eventId = eventId;
    this.levelId = levelId;
    this.eventType = eventType;
    this.direction = direction;
    this.breakMechanism = breakMechanism;
    this.candleTimeframe = candleTimeframe;
    this.eventTimeUTC = new Date(eventTimeUTC.getTime());
    this.knowledgeTimeUTC = new Date(knowledgeTimeUTC.getTime());
  }

  toString(): string {
    const dirStr = this.direction ? ` ${this.direction}` : '';
    const mechStr = this.breakMechanism ? ` (${this.breakMechanism})` : '';
    return `LevelEvent(${this.eventType}${dirStr}${mechStr} @ ${this.eventTimeUTC.toISOString()})`;
  }
}

export class LevelEventComparator {
  static byKnowledgeTime(a: LevelEvent, b: LevelEvent): number {
    return a.knowledgeTimeUTC.getTime() - b.knowledgeTimeUTC.getTime();
  }

  static deterministic(a: LevelEvent, b: LevelEvent): number {
    if (a.knowledgeTimeUTC.getTime() !== b.knowledgeTimeUTC.getTime()) {
      return a.knowledgeTimeUTC.getTime() - b.knowledgeTimeUTC.getTime();
    }
    return a.eventId.localeCompare(b.eventId);
  }
}
