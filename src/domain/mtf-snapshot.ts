import { Candle } from './candle';
import { Timeframe, TimeframeValue } from './timeframe';

export enum TimeframeAvailability {
  AVAILABLE = 'AVAILABLE',
  UNAVAILABLE = 'UNAVAILABLE',
  STALE = 'STALE',
}

export interface TimeframeState {
  timeframe: Timeframe;
  latestConfirmedCandle: Candle | null;
  knowledgeTime: Date | null;
  availability: TimeframeAvailability;
}

export class MTFSnapshot {
  readonly asOfTimeUTC: Date;
  private states: Map<string, TimeframeState> = new Map();

  constructor(asOfTimeUTC: Date) {
    this.asOfTimeUTC = asOfTimeUTC;
  }

  addTimeframeState(state: TimeframeState): void {
    const key = state.timeframe.value;
    this.states.set(key, state);
  }

  getTimeframeState(timeframeValue: TimeframeValue): TimeframeState | undefined {
    return this.states.get(timeframeValue);
  }

  getLatestConfirmedCandle(timeframeValue: TimeframeValue): Candle | null {
    const state = this.states.get(timeframeValue);
    return state?.latestConfirmedCandle || null;
  }

  getAvailability(timeframeValue: TimeframeValue): TimeframeAvailability {
    const state = this.states.get(timeframeValue);
    return state?.availability || TimeframeAvailability.UNAVAILABLE;
  }

  getAllTimeframeStates(): TimeframeState[] {
    return Array.from(this.states.values());
  }

  hasCandle(timeframeValue: TimeframeValue): boolean {
    const state = this.states.get(timeframeValue);
    return state?.latestConfirmedCandle !== null && state?.latestConfirmedCandle !== undefined;
  }

  toString(): string {
    const states = this.getAllTimeframeStates()
      .map(
        (s) =>
          `${s.timeframe.value}: ${s.availability} ${s.latestConfirmedCandle ? s.latestConfirmedCandle.toString() : 'none'}`,
      )
      .join(' | ');
    return `MTFSnapshot(${this.asOfTimeUTC.toISOString()}) [${states}]`;
  }
}
