import { Candle } from './candle';
import { Timeframe } from './timeframe';
import { utcToZonedTime, format } from 'date-fns-tz';

const IST_TIMEZONE = 'Asia/Kolkata';

export enum SwingType {
  HIGH = 'HIGH',
  LOW = 'LOW',
}

export class SwingPoint {
  constructor(
    readonly symbol: string,
    readonly timeframe: Timeframe,
    readonly type: SwingType,
    readonly price: number,
    readonly eventTimeUTC: Date,
    readonly knowledgeTimeUTC: Date,
    readonly sourceCandleTimeUTC: Date,
  ) {}

  get id(): string {
    return `${this.symbol}-${this.timeframe.value}-${this.type}-${this.eventTimeUTC.getTime()}`;
  }

  isHigh(): boolean {
    return this.type === SwingType.HIGH;
  }

  isLow(): boolean {
    return this.type === SwingType.LOW;
  }

  toString(): string {
    const eventIST = utcToZonedTime(this.eventTimeUTC, IST_TIMEZONE);
    const knowledgeIST = utcToZonedTime(this.knowledgeTimeUTC, IST_TIMEZONE);
    const eventStr = format(eventIST, 'HH:mm', { timeZone: IST_TIMEZONE });
    const knowledgeStr = format(knowledgeIST, 'HH:mm', { timeZone: IST_TIMEZONE });
    return `${this.symbol} ${this.timeframe.value} ${this.type} ${this.price.toFixed(2)} @${eventStr}(confirmed:${knowledgeStr})`;
  }
}

export class SwingPointComparator {
  static byEventTime(a: SwingPoint, b: SwingPoint): number {
    return a.eventTimeUTC.getTime() - b.eventTimeUTC.getTime();
  }

  static byKnowledgeTime(a: SwingPoint, b: SwingPoint): number {
    return a.knowledgeTimeUTC.getTime() - b.knowledgeTimeUTC.getTime();
  }

  static isSamePivot(a: SwingPoint, b: SwingPoint): boolean {
    return (
      a.symbol === b.symbol &&
      a.timeframe.equals(b.timeframe) &&
      a.type === b.type &&
      a.eventTimeUTC.getTime() === b.eventTimeUTC.getTime()
    );
  }
}
