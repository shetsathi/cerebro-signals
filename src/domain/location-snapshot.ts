import { Level, LevelPolarity } from './level';
import { LevelEvent } from './level-event';
import { Timeframe, TimeframeValue } from './timeframe';

export interface LocationGeometry {
  referencePrice: number;
  signedDistancePoints: number;
  signedDistanceBps: number;
  side: 'ABOVE' | 'BELOW' | 'CONTAINED_IN_CURRENT_BAR';
}

export interface PolarityState {
  currentPolarity: LevelPolarity;
  brokeAt: Date | null;
  breakMechanism?: 'TRADED' | 'GAPPED';
}

export enum DataSufficiency {
  SUFFICIENT = 'SUFFICIENT',
  WARMING_UP = 'WARMING_UP',
  INSUFFICIENT_DATA = 'INSUFFICIENT_DATA',
}

export class LocationSnapshot {
  readonly symbol: string;
  readonly asOfTimeUTC: Date;
  readonly knowledgeTimeUTC: Date;
  readonly dataSufficiency: DataSufficiency;
  readonly isSessionOpeningCandle: boolean;
  readonly rulesetVersion: string;
  readonly configHash: string;

  // K nearest active levels above and below per timeframe
  private readonly nearestLevelsAbove: Map<string, Level[]>;
  private readonly nearestLevelsBelow: Map<string, Level[]>;

  // All events for replay/analysis
  private readonly allLevels: ReadonlyArray<Level>;
  private readonly allEvents: ReadonlyArray<LevelEvent>;

  // Derived polarity states
  private readonly polarityStates: Map<string, PolarityState>;

  private sealed: boolean = false;

  constructor(
    symbol: string,
    asOfTimeUTC: Date,
    knowledgeTimeUTC: Date,
    dataSufficiency: DataSufficiency,
    isSessionOpeningCandle: boolean,
    rulesetVersion: string,
    configHash: string,
    allLevels: Level[],
    allEvents: LevelEvent[],
    nearestLevelsAbove: Map<string, Level[]>,
    nearestLevelsBelow: Map<string, Level[]>,
    polarityStates: Map<string, PolarityState>,
  ) {
    this.symbol = symbol;
    this.asOfTimeUTC = new Date(asOfTimeUTC.getTime());
    this.knowledgeTimeUTC = new Date(knowledgeTimeUTC.getTime());
    this.dataSufficiency = dataSufficiency;
    this.isSessionOpeningCandle = isSessionOpeningCandle;
    this.rulesetVersion = rulesetVersion;
    this.configHash = configHash;
    this.allLevels = Object.freeze([...allLevels]);
    this.allEvents = Object.freeze([...allEvents]);
    this.nearestLevelsAbove = new Map(nearestLevelsAbove);
    this.nearestLevelsBelow = new Map(nearestLevelsBelow);
    this.polarityStates = new Map(polarityStates);
  }

  seal(): void {
    this.sealed = true;
  }

  isSealed(): boolean {
    return this.sealed;
  }

  getAllLevels(): Level[] {
    return [...this.allLevels];
  }

  getAllEvents(): LevelEvent[] {
    return [...this.allEvents];
  }

  getNearestLevelsAbove(timeframeValue: TimeframeValue): Level[] {
    return [...(this.nearestLevelsAbove.get(timeframeValue) || [])];
  }

  getNearestLevelsBelow(timeframeValue: TimeframeValue): Level[] {
    return [...(this.nearestLevelsBelow.get(timeframeValue) || [])];
  }

  getPolarityState(levelId: string): PolarityState | undefined {
    const state = this.polarityStates.get(levelId);
    return state ? { ...state } : undefined;
  }

  getGeometry(level: Level, referencePrice: number): LocationGeometry {
    const signedDistancePoints = referencePrice - level.price;
    const signedDistanceBps = (signedDistancePoints / referencePrice) * 10000;

    let side: 'ABOVE' | 'BELOW' | 'CONTAINED_IN_CURRENT_BAR';
    if (referencePrice > level.price) {
      side = 'ABOVE';
    } else if (referencePrice < level.price) {
      side = 'BELOW';
    } else {
      side = 'CONTAINED_IN_CURRENT_BAR';
    }

    return {
      referencePrice,
      signedDistancePoints,
      signedDistanceBps,
      side,
    };
  }

  toString(): string {
    return `LocationSnapshot(${this.symbol} @ ${this.asOfTimeUTC.toISOString()}) [${this.dataSufficiency} levels=${this.allLevels.length} events=${this.allEvents.length}]`;
  }
}
