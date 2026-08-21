import { StructureSnapshot } from './structure-snapshot';
import { StructureType } from './structure-state';
import { RegimeType, RegimeClassification } from './regime-state';
import { TimeframeValue } from './timeframe';
import { StructuralDirectionState } from './regime-snapshot';

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

      // HH + HL without BOS: structure exists but trend not confirmed
      // This is NOT automatically RANGE - it's directional structure awaiting confirmation
      return {
        regime: RegimeType.INSUFFICIENT_DATA,
        reason: 'HH + HL structure exists, but bullish trend not yet confirmed (awaiting BOS)',
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

      // LH + LL without BOS: structure exists but trend not confirmed
      // This is NOT automatically RANGE - it's directional structure awaiting confirmation
      return {
        regime: RegimeType.INSUFFICIENT_DATA,
        reason: 'LH + LL structure exists, but bearish trend not yet confirmed (awaiting BOS)',
      };
    }

    // NEUTRAL structure: mixed directional signals = RANGE
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

  static evaluateStructuralDirection(snapshot: StructureSnapshot): StructuralDirectionState {
    const structureType = snapshot.getStructureType();
    const bosEvents = snapshot.getBOSEvents();
    const bullishBOS = bosEvents.filter((b) => b.direction === 'bullish');
    const bearishBOS = bosEvents.filter((b) => b.direction === 'bearish');

    if (structureType === StructureType.BULLISH) {
      return {
        direction: 'bullish',
        trendConfirmed: bullishBOS.length > 0,
        bosCount: bullishBOS.length,
      };
    }

    if (structureType === StructureType.BEARISH) {
      return {
        direction: 'bearish',
        trendConfirmed: bearishBOS.length > 0,
        bosCount: bearishBOS.length,
      };
    }

    return {
      direction: 'neutral',
      trendConfirmed: false,
      bosCount: 0,
    };
  }
}
