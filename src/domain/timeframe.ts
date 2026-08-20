export enum TimeframeValue {
  FIVE_MIN = '5m',
  FIFTEEN_MIN = '15m',
  SIXTY_MIN = '60m',
  DAILY = '1D',
}

export class Timeframe {
  constructor(readonly value: TimeframeValue) {}

  get minutes(): number {
    switch (this.value) {
      case TimeframeValue.FIVE_MIN:
        return 5;
      case TimeframeValue.FIFTEEN_MIN:
        return 15;
      case TimeframeValue.SIXTY_MIN:
        return 60;
      case TimeframeValue.DAILY:
        return 1440; // 24 hours
      default:
        throw new Error(`Unknown timeframe: ${this.value}`);
    }
  }

  static from(value: string): Timeframe {
    if (!Object.values(TimeframeValue).includes(value as TimeframeValue)) {
      throw new Error(`Invalid timeframe: ${value}`);
    }
    return new Timeframe(value as TimeframeValue);
  }

  equals(other: Timeframe): boolean {
    return this.value === other.value;
  }

  toString(): string {
    return this.value;
  }
}
