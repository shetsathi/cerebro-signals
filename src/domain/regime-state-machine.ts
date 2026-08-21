import { RegimeType } from './regime-state';
import { RegimeEvaluator } from './regime-evaluator';
import { StructureSnapshot } from './structure-snapshot';

export interface RegimeTransition {
  fromRegime: RegimeType;
  toRegime: RegimeType;
  trigger: 'choch' | 'bos' | 'structure_change' | 'initial';
  direction?: 'bullish' | 'bearish';
}

export class RegimeStateMachine {
  static transitionFromCHOCH(
    currentRegime: RegimeType,
    direction: 'bullish' | 'bearish',
  ): RegimeType {
    // CHOCH does NOT flip the trend; it creates TRANSITION
    if (currentRegime === RegimeType.TREND_BULLISH && direction === 'bearish') {
      return RegimeType.TRANSITION;
    }

    if (currentRegime === RegimeType.TREND_BEARISH && direction === 'bullish') {
      return RegimeType.TRANSITION;
    }

    return currentRegime;
  }

  static transitionFromBOS(
    currentRegime: RegimeType,
    direction: 'bullish' | 'bearish',
  ): RegimeType {
    // From TRANSITION, BOS confirms new trend direction
    if (currentRegime === RegimeType.TRANSITION) {
      if (direction === 'bullish') {
        return RegimeType.TREND_BULLISH;
      }
      if (direction === 'bearish') {
        return RegimeType.TREND_BEARISH;
      }
    }

    // From a RANGE or INSUFFICIENT_DATA, BOS can establish trend
    if (currentRegime === RegimeType.RANGE || currentRegime === RegimeType.INSUFFICIENT_DATA) {
      if (direction === 'bullish') {
        return RegimeType.TREND_BULLISH;
      }
      if (direction === 'bearish') {
        return RegimeType.TREND_BEARISH;
      }
    }

    return currentRegime;
  }

  static determineRegimeFromSnapshot(
    snapshot: StructureSnapshot,
    previousRegime: RegimeType | null,
  ): RegimeType {
    const evaluation = RegimeEvaluator.evaluateStructureRegime(snapshot, snapshot.asOfTimeUTC);

    let nextRegime = evaluation.regime;

    // Check for state machine transitions if we had a previous regime
    if (previousRegime && previousRegime !== RegimeType.INSUFFICIENT_DATA) {
      // Check for CHOCH that triggers transition
      if (previousRegime === RegimeType.TREND_BULLISH) {
        const hasBearishCHOCH = RegimeEvaluator.hasConfirmedCHOCH(snapshot, 'bearish');
        if (hasBearishCHOCH && nextRegime !== RegimeType.TREND_BEARISH) {
          nextRegime = RegimeType.TRANSITION;
        }
      }

      if (previousRegime === RegimeType.TREND_BEARISH) {
        const hasBullishCHOCH = RegimeEvaluator.hasConfirmedCHOCH(snapshot, 'bullish');
        if (hasBullishCHOCH && nextRegime !== RegimeType.TREND_BULLISH) {
          nextRegime = RegimeType.TRANSITION;
        }
      }

      // From TRANSITION, check for BOS confirmation
      if (previousRegime === RegimeType.TRANSITION) {
        const hasBullishBOS = RegimeEvaluator.hasBullishBOS(snapshot);
        const hasBearishBOS = RegimeEvaluator.hasBearishBOS(snapshot);

        if (hasBullishBOS) {
          nextRegime = RegimeType.TREND_BULLISH;
        } else if (hasBearishBOS) {
          nextRegime = RegimeType.TREND_BEARISH;
        }
      }
    }

    return nextRegime;
  }

  static isValidTransition(from: RegimeType, to: RegimeType): boolean {
    // All explicit transitions from spec
    if (from === to) return true; // Staying in same regime is valid

    // INSUFFICIENT_DATA can transition to anything
    if (from === RegimeType.INSUFFICIENT_DATA) return true;

    // RANGE can transition to trend or insufficient
    if (from === RegimeType.RANGE) return true;

    // From TREND_BULLISH
    if (from === RegimeType.TREND_BULLISH && to === RegimeType.TRANSITION) return true;

    // From TRANSITION
    if (from === RegimeType.TRANSITION && to === RegimeType.TREND_BULLISH) return true;
    if (from === RegimeType.TRANSITION && to === RegimeType.TREND_BEARISH) return true;

    // From TREND_BEARISH
    if (from === RegimeType.TREND_BEARISH && to === RegimeType.TRANSITION) return true;

    return false;
  }
}
