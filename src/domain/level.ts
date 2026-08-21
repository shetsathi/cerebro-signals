import { Timeframe, TimeframeValue } from './timeframe';

export enum LevelOrigin {
  CONFIRMED_SWING = 'CONFIRMED_SWING',
  PRIOR_DAY = 'PRIOR_DAY',
  PRIOR_WEEK = 'PRIOR_WEEK',
  PRIOR_MONTH = 'PRIOR_MONTH',
  GAP_EDGE = 'GAP_EDGE',
}

export enum LevelPolarity {
  SUPPORT = 'SUPPORT',
  RESISTANCE = 'RESISTANCE',
}

export class Level {
  readonly levelId: string;
  readonly symbol: string;
  readonly timeframe: Timeframe;
  readonly origin: LevelOrigin;
  readonly polarity: LevelPolarity;
  readonly price: number;
  readonly sourceSwingId: string | null;
  readonly eventTimeUTC: Date;
  readonly knowledgeTimeUTC: Date;
  readonly rulesetVersion: string;
  readonly configHash: string;

  constructor(
    levelId: string,
    symbol: string,
    timeframe: Timeframe,
    origin: LevelOrigin,
    polarity: LevelPolarity,
    price: number,
    eventTimeUTC: Date,
    knowledgeTimeUTC: Date,
    rulesetVersion: string,
    configHash: string,
    sourceSwingId: string | null = null,
  ) {
    this.levelId = levelId;
    this.symbol = symbol;
    this.timeframe = timeframe;
    this.origin = origin;
    this.polarity = polarity;
    this.price = price;
    this.sourceSwingId = sourceSwingId;
    this.eventTimeUTC = new Date(eventTimeUTC.getTime());
    this.knowledgeTimeUTC = new Date(knowledgeTimeUTC.getTime());
    this.rulesetVersion = rulesetVersion;
    this.configHash = configHash;
    Object.freeze(this);
  }

  toString(): string {
    return `Level(${this.levelId} ${this.symbol} ${this.timeframe.value} ${this.polarity} ${this.price.toFixed(2)} ${this.origin})`;
  }
}

export class LevelComparator {
  static byPriceDescending(a: Level, b: Level): number {
    return b.price - a.price;
  }

  static byPriceAscending(a: Level, b: Level): number {
    return a.price - b.price;
  }

  static byKnowledgeTime(a: Level, b: Level): number {
    return a.knowledgeTimeUTC.getTime() - b.knowledgeTimeUTC.getTime();
  }

  static deterministic(a: Level, b: Level): number {
    if (a.price !== b.price) {
      return a.price - b.price;
    }
    if (a.knowledgeTimeUTC.getTime() !== b.knowledgeTimeUTC.getTime()) {
      return a.knowledgeTimeUTC.getTime() - b.knowledgeTimeUTC.getTime();
    }
    if (a.sourceSwingId && b.sourceSwingId && a.sourceSwingId !== b.sourceSwingId) {
      return a.sourceSwingId.localeCompare(b.sourceSwingId);
    }
    return a.levelId.localeCompare(b.levelId);
  }
}
