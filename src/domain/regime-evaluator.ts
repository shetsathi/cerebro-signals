import { StructureSnapshot } from './structure-snapshot';
import { StructureType } from './structure-state';
import { RegimeType, RegimeClassification } from './regime-state';
import { TimeframeValue } from './timeframe';

export class RegimeEvaluator {
  static evaluateStructureRegime(
    snapshot: StructureSnapshot,
    asOfTime: Date,
  ): RegimeClassification {
    // Insufficient structure
    if (!snapshot.getStructureType() || snapshot.getStructureType() === StructureType.UNKNOWN) {
      return {
        regime: RegimeType.INSUFFICIENT_DATA,
        reason: 'No defined structure (missing swings or only one swing type)',
      };
    }

    const structureType = snapshot.getStructureType();
    const swings = snapshot.getConfirmedSwings();

    // Need both highs and lows
    const highs = swings.filter((s) => s.isHigh());
    const lows = swings.filter((s) => s.isLow());

    if (highs.length < 2 || lows.length < 2) {
      return {
        regime: RegimeType.INSUFFICIENT_DATA,
        reason: `Insufficient swings: highs=${highs.length}, lows=${lows.length}`,
      };
    }

    // Evaluate bullish: HH + HL + at least one BOS
    if (structureType === StructureType.BULLISH) {
      const bosEvents = snapshot.getBOSEvents().filter((b) => b.direction === 'bullish');

      if (bosEvents.length > 0) {
        return {
          regime: RegimeType.TREND_BULLISH,
          reason: 'HH + HL with confirmed bullish BOS',
        };
      }

      return {
        regime: RegimeType.RANGE,
        reason: 'HH + HL structure without confirmed BOS (consolidating)',
      };
    }

    // Evaluate bearish: LH + LL + at least one BOS
    if (structureType === StructureType.BEARISH) {
      const bosEvents = snapshot.getBOSEvents().filter((b) => b.direction === 'bearish');

      if (bosEvents.length > 0) {
        return {
          regime: RegimeType.TREND_BEARISH,
          reason: 'LH + LL with confirmed bearish BOS',
        };
      }

      return {
        regime: RegimeType.RANGE,
        reason: 'LH + LL structure without confirmed BOS (consolidating)',
      };
    }

    // NEUTRAL structure = RANGE
    return {
      regime: RegimeType.RANGE,
      reason: 'Neutral structure (mixed directional signals)',
    };
  }

  static hasBullishBOS(snapshot: StructureSnapshot): boolean {
    return snapshot.getBOSEvents().some((e) => e.direction === 'bullish');
  }

  static hasBearishBOS(snapshot: StructureSnapshot): boolean {
    return snapshot.getBOSEvents().some((e) => e.direction === 'bearish');
  }

  static hasConfirmedCHOCH(
    snapshot: StructureSnapshot,
    direction: 'bullish' | 'bearish',
  ): boolean {
    return snapshot.getCHOCHEvents().some((e) => e.direction === direction);
  }

  static getStructureDirection(snapshot: StructureSnapshot): 'bullish' | 'bearish' | 'neutral' {
    const structureType = snapshot.getStructureType();

    if (structureType === StructureType.BULLISH) {
      return 'bullish';
    }

    if (structureType === StructureType.BEARISH) {
      return 'bearish';
    }

    return 'neutral';
  }

  static isValidTrendStructure(
    snapshot: StructureSnapshot,
    direction: 'bullish' | 'bearish',
  ): boolean {
    const swings = snapshot.getConfirmedSwings();
    const highs = swings.filter((s) => s.isHigh());
    const lows = swings.filter((s) => s.isLow());

    if (highs.length < 2 || lows.length < 2) {
      return false;
    }

    // For bullish: need HH + HL
    if (direction === 'bullish') {
      return snapshot.getStructureType() === StructureType.BULLISH;
    }

    // For bearish: need LH + LL
    if (direction === 'bearish') {
      return snapshot.getStructureType() === StructureType.BEARISH;
    }

    return false;
  }
}
