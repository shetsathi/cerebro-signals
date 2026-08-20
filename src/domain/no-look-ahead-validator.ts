import { Candle } from './candle';
import { MTFSnapshot } from './mtf-snapshot';

export interface LookAheadViolation {
  candle: Candle;
  asOfTime: Date;
  message: string;
}

export class NoLookAheadValidator {
  static validateSnapshot(snapshot: MTFSnapshot): {
    valid: boolean;
    violations: LookAheadViolation[];
  } {
    const violations: LookAheadViolation[] = [];

    for (const state of snapshot.getAllTimeframeStates()) {
      if (state.latestConfirmedCandle) {
        if (state.latestConfirmedCandle.knowledgeTimeUTC > snapshot.asOfTimeUTC) {
          violations.push({
            candle: state.latestConfirmedCandle,
            asOfTime: snapshot.asOfTimeUTC,
            message: `Candle knowledge time ${state.latestConfirmedCandle.knowledgeTimeUTC.toISOString()} is after snapshot time ${snapshot.asOfTimeUTC.toISOString()}`,
          });
        }
      }
    }

    return {
      valid: violations.length === 0,
      violations,
    };
  }

  static validateCandlesInSnapshot(candles: Candle[], snapshot: MTFSnapshot): {
    valid: boolean;
    violations: LookAheadViolation[];
  } {
    const violations: LookAheadViolation[] = [];

    for (const candle of candles) {
      if (
        snapshot.getLatestConfirmedCandle(candle.timeframe.value as any) === candle &&
        candle.knowledgeTimeUTC > snapshot.asOfTimeUTC
      ) {
        violations.push({
          candle,
          asOfTime: snapshot.asOfTimeUTC,
          message: `Candle in snapshot has future knowledge time: ${candle.knowledgeTimeUTC.toISOString()} > ${snapshot.asOfTimeUTC.toISOString()}`,
        });
      }
    }

    return {
      valid: violations.length === 0,
      violations,
    };
  }

  static strictValidate(snapshot: MTFSnapshot): void {
    const result = this.validateSnapshot(snapshot);
    if (!result.valid) {
      const messages = result.violations.map((v) => v.message).join('\n');
      throw new Error(`Look-ahead violation in snapshot:\n${messages}`);
    }
  }
}
