import { Candle } from './candle';
import { SwingPoint, SwingType } from './swing-point';
import { StructureState, StructureType } from './structure-state';
import { Timeframe, TimeframeValue } from './timeframe';

export enum SwingClassification {
  HH = 'HH', // higher high
  LH = 'LH', // lower high
  HL = 'HL', // higher low
  LL = 'LL', // lower low
  UNKNOWN = 'UNKNOWN',
}

export class StructureCalculator {
  static classifySwing(
    swing: SwingPoint,
    previousSwingOfSameType: SwingPoint | null,
  ): SwingClassification {
    if (!previousSwingOfSameType) {
      return SwingClassification.UNKNOWN;
    }

    if (swing.isHigh()) {
      return swing.price > previousSwingOfSameType.price
        ? SwingClassification.HH
        : SwingClassification.LH;
    } else {
      return swing.price > previousSwingOfSameType.price
        ? SwingClassification.HL
        : SwingClassification.LL;
    }
  }

  static determineStructureType(
    latestHighClassification: SwingClassification,
    latestLowClassification: SwingClassification,
  ): StructureType {
    // Insufficient data
    if (
      latestHighClassification === SwingClassification.UNKNOWN ||
      latestLowClassification === SwingClassification.UNKNOWN
    ) {
      return StructureType.UNKNOWN;
    }

    // Bullish: HH + HL
    if (
      latestHighClassification === SwingClassification.HH &&
      latestLowClassification === SwingClassification.HL
    ) {
      return StructureType.BULLISH;
    }

    // Bearish: LH + LL
    if (
      latestHighClassification === SwingClassification.LH &&
      latestLowClassification === SwingClassification.LL
    ) {
      return StructureType.BEARISH;
    }

    // Mixed/neutral
    return StructureType.NEUTRAL;
  }

  static detectBOS(
    candle: Candle,
    structuralLevel: number,
    structureType: StructureType,
  ): boolean {
    if (!candle.isClosed()) {
      return false;
    }

    // Bullish BOS: close above resistance
    if (structureType === StructureType.BULLISH) {
      return candle.ohlc.close > structuralLevel;
    }

    // Bearish BOS: close below support
    if (structureType === StructureType.BEARISH) {
      return candle.ohlc.close < structuralLevel;
    }

    return false;
  }

  static detectCHOCH(
    candle: Candle,
    structuralLevel: number,
    structureType: StructureType,
  ): boolean {
    if (!candle.isClosed()) {
      return false;
    }

    // Bullish structure: CHOCH is close below recent swing low
    if (structureType === StructureType.BULLISH) {
      return candle.ohlc.close < structuralLevel;
    }

    // Bearish structure: CHOCH is close above recent swing high
    if (structureType === StructureType.BEARISH) {
      return candle.ohlc.close > structuralLevel;
    }

    return false;
  }

  static isWickThroughButClosedBeyond(
    candle: Candle,
    level: number,
    direction: 'bullish' | 'bearish',
  ): boolean {
    if (!candle.isClosed()) {
      return false;
    }

    if (direction === 'bullish') {
      // Wick through resistance, close beyond
      return candle.ohlc.high > level && candle.ohlc.close > level;
    } else {
      // Wick through support, close beyond
      return candle.ohlc.low < level && candle.ohlc.close < level;
    }
  }

  static isGapThrough(
    previousCandle: Candle,
    currentCandle: Candle,
    level: number,
    direction: 'bullish' | 'bearish',
  ): boolean {
    if (direction === 'bullish') {
      // Gap above level
      return previousCandle.ohlc.close < level && currentCandle.ohlc.open > level;
    } else {
      // Gap below level
      return previousCandle.ohlc.close > level && currentCandle.ohlc.open < level;
    }
  }

  static getStructureState(
    latestSwingHigh: SwingPoint | null,
    latestSwingLow: SwingPoint | null,
    previousSwingHigh: SwingPoint | null,
    previousSwingLow: SwingPoint | null,
  ): StructureState {
    if (!latestSwingHigh || !latestSwingLow) {
      return new StructureState(StructureType.UNKNOWN, null, null, null, null);
    }

    const highClassification = this.classifySwing(latestSwingHigh, previousSwingHigh);
    const lowClassification = this.classifySwing(latestSwingLow, previousSwingLow);

    const structureType = this.determineStructureType(highClassification, lowClassification);

    return new StructureState(structureType, latestSwingHigh, latestSwingLow, previousSwingHigh, previousSwingLow);
  }
}
