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

  // K nearest active levels above and below per timeframe (values are frozen)
  private readonly nearestLevelsAbove: Map<string, ReadonlyArray<Level>>;
  private readonly nearestLevelsBelow: Map<string, ReadonlyArray<Level>>;

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
    // Freeze the arrays inside maps
    const frozenAbove = new Map<string, ReadonlyArray<Level>>();
    for (const [key, arr] of nearestLevelsAbove) {
      frozenAbove.set(key, Object.freeze([...arr]));
    }
    this.nearestLevelsAbove = frozenAbove;
    const frozenBelow = new Map<string, ReadonlyArray<Level>>();
    for (const [key, arr] of nearestLevelsBelow) {
      frozenBelow.set(key, Object.freeze([...arr]));
    }
    this.nearestLevelsBelow = frozenBelow;
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
    const levels = this.nearestLevelsAbove.get(timeframeValue);
    return levels ? [...levels] : [];
  }

  getNearestLevelsBelow(timeframeValue: TimeframeValue): Level[] {
    const levels = this.nearestLevelsBelow.get(timeframeValue);
    return levels ? [...levels] : [];
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
