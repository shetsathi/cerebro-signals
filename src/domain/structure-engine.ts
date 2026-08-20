import { Candle } from './candle';
import { Timeframe, TimeframeValue } from './timeframe';
import { SwingDetector } from './swing-detector';
import { SwingPoint, SwingType } from './swing-point';
import { StructureCalculator, SwingClassification } from './structure-calculator';
import { StructureSnapshot, BOSEvent, CHOCHEvent } from './structure-snapshot';
import { StructureState, StructureType } from './structure-state';
import { StructureConfig } from './structure-config';

export class StructureEngine {
  static getStructureSnapshot(
    candles: Candle[],
    asOfTimeUTC: Date,
    symbol: string,
    timeframe: Timeframe,
    config: StructureConfig = new StructureConfig(),
  ): StructureSnapshot {
    // Filter candles for this symbol and timeframe
    const relevantCandles = candles.filter(
      (c) => c.symbol === symbol && c.timeframe.equals(timeframe),
    );

    if (relevantCandles.length === 0) {
      return new StructureSnapshot(asOfTimeUTC);
    }

    // Sort by time
    const sortedCandles = [...relevantCandles].sort(
      (a, b) => a.openTimeUTC.getTime() - b.openTimeUTC.getTime(),
    );

    // Find all candidate swings
    const allCandidateSwings = SwingDetector.detectCandidateSwings([...sortedCandles], config);

    // Filter to only CONFIRMED swings (all rightBars must exist and pass conditions)
    const confirmedSwings = this.getConfirmedSwings(sortedCandles, allCandidateSwings, config, asOfTimeUTC);

    // Build structure state
    const structureState = this.buildStructureState(confirmedSwings);

    // Detect BOS events
    const bosEvents = this.detectBOSEvents(sortedCandles, structureState, asOfTimeUTC);

    // Detect CHOCH events
    const chochEvents = this.detectCHOCHEvents(sortedCandles, structureState, asOfTimeUTC);

    const snapshot = new StructureSnapshot(asOfTimeUTC, confirmedSwings, structureState, bosEvents, chochEvents);
    snapshot.seal();

    return snapshot;
  }

  private static getConfirmedSwings(
    candles: Candle[],
    candidateSwings: SwingPoint[],
    config: StructureConfig,
    asOfTime: Date,
  ): SwingPoint[] {
    const confirmed: SwingPoint[] = [];

    for (const swing of candidateSwings) {
      // Find the candidate candle in the sequence
      const candleIndex = candles.findIndex(
        (c) => c.closeTimeUTC.getTime() === swing.eventTimeUTC.getTime(),
      );

      if (candleIndex < 0) {
        continue;
      }

      // Check if we have enough right bars
      const rightBarsAvailable = candles.length - candleIndex - 1;
      if (rightBarsAvailable < config.rightBars) {
        continue; // Not confirmed yet
      }

      // Get the confirmation candle (the last right bar)
      const confirmationCandle = candles[candleIndex + config.rightBars];

      // The swing's knowledge time is when the confirmation candle closes
      const confirmedSwing = new SwingPoint(
        swing.symbol,
        swing.timeframe,
        swing.type,
        swing.price,
        swing.eventTimeUTC,
        confirmationCandle.closeTimeUTC, // Updated knowledge time
        swing.sourceCandleTimeUTC,
      );

      // Only include if knowledge time <= asOfTime (look-ahead safe)
      if (confirmedSwing.knowledgeTimeUTC <= asOfTime) {
        confirmed.push(confirmedSwing);
      }
    }

    return confirmed.sort((a, b) => a.eventTimeUTC.getTime() - b.eventTimeUTC.getTime());
  }

  private static buildStructureState(confirmedSwings: SwingPoint[]): StructureState {
    const highs = confirmedSwings.filter((s) => s.isHigh());
    const lows = confirmedSwings.filter((s) => s.isLow());

    if (highs.length === 0 || lows.length === 0) {
      return new StructureState(StructureType.UNKNOWN);
    }

    const latestHigh = highs[highs.length - 1];
    const latestLow = lows[lows.length - 1];
    const previousHigh = highs.length >= 2 ? highs[highs.length - 2] : null;
    const previousLow = lows.length >= 2 ? lows[lows.length - 2] : null;

    return StructureCalculator.getStructureState(latestHigh, latestLow, previousHigh, previousLow);
  }

  private static detectBOSEvents(
    candles: Candle[],
    structureState: StructureState,
    asOfTime: Date,
  ): BOSEvent[] {
    const events: BOSEvent[] = [];

    if (structureState.structureType === StructureType.UNKNOWN) {
      return events;
    }

    const bosLevel =
      structureState.structureType === StructureType.BULLISH
        ? structureState.previousSwingHigh?.price
        : structureState.previousSwingLow?.price;

    if (!bosLevel) {
      return events;
    }

    for (const candle of candles) {
      if (candle.closeTimeUTC > asOfTime || !candle.isClosed()) {
        continue;
      }

      const isBOS =
        structureState.structureType === StructureType.BULLISH
          ? candle.ohlc.close > bosLevel && !events.some((e) => e.candleCloseTimeUTC.getTime() === candle.closeTimeUTC.getTime())
          : candle.ohlc.close < bosLevel && !events.some((e) => e.candleCloseTimeUTC.getTime() === candle.closeTimeUTC.getTime());

      if (isBOS) {
        events.push({
          candleCloseTimeUTC: candle.closeTimeUTC,
          levelPrice: bosLevel,
          direction: structureState.structureType === StructureType.BULLISH ? 'bullish' : 'bearish',
        });
      }
    }

    return events;
  }

  private static detectCHOCHEvents(
    candles: Candle[],
    structureState: StructureState,
    asOfTime: Date,
  ): CHOCHEvent[] {
    const events: CHOCHEvent[] = [];

    if (structureState.structureType === StructureType.UNKNOWN) {
      return events;
    }

    const chochLevel =
      structureState.structureType === StructureType.BULLISH
        ? structureState.latestSwingLow?.price
        : structureState.latestSwingHigh?.price;

    if (!chochLevel) {
      return events;
    }

    for (const candle of candles) {
      if (candle.closeTimeUTC > asOfTime || !candle.isClosed()) {
        continue;
      }

      const isCHOCH =
        structureState.structureType === StructureType.BULLISH
          ? candle.ohlc.close < chochLevel && !events.some((e) => e.candleCloseTimeUTC.getTime() === candle.closeTimeUTC.getTime())
          : candle.ohlc.close > chochLevel && !events.some((e) => e.candleCloseTimeUTC.getTime() === candle.closeTimeUTC.getTime());

      if (isCHOCH) {
        events.push({
          candleCloseTimeUTC: candle.closeTimeUTC,
          levelPrice: chochLevel,
          direction: structureState.structureType === StructureType.BULLISH ? 'bearish' : 'bullish',
        });
      }
    }

    return events;
  }
}
