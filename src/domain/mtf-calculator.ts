import { Candle, CandleStatus } from './candle';
import { Timeframe, TimeframeValue } from './timeframe';
import { MTFSnapshot, TimeframeAvailability, TimeframeState } from './mtf-snapshot';

export class MTFCalculator {
  static getMTFSnapshot(
    allCandles: Candle[],
    asOfTimeUTC: Date,
    symbol: string,
  ): MTFSnapshot {
    const snapshot = new MTFSnapshot(asOfTimeUTC);

    // Build snapshot for each timeframe
    for (const tfValue of Object.values(TimeframeValue)) {
      const state = this.buildTimeframeState(
        allCandles,
        symbol,
        Timeframe.from(tfValue),
        asOfTimeUTC,
      );
      snapshot.addTimeframeState(state);
    }

    return snapshot;
  }

  private static buildTimeframeState(
    allCandles: Candle[],
    symbol: string,
    timeframe: Timeframe,
    asOfTimeUTC: Date,
  ): TimeframeState {
    // Find latest confirmed candle for this timeframe
    const latestConfirmedCandle = this.getLatestConfirmedCandle(
      allCandles,
      symbol,
      timeframe,
      asOfTimeUTC,
    );

    return {
      timeframe,
      latestConfirmedCandle,
      knowledgeTime: latestConfirmedCandle?.knowledgeTimeUTC || null,
      availability: latestConfirmedCandle
        ? TimeframeAvailability.AVAILABLE
        : TimeframeAvailability.UNAVAILABLE,
    };
  }

  static getLatestConfirmedCandle(
    allCandles: Candle[],
    symbol: string,
    timeframe: Timeframe,
    asOfTimeUTC: Date,
  ): Candle | null {
    // Filter candles:
    // 1. Must match symbol and timeframe
    // 2. Must be CLOSED
    // 3. Must have knowledgeTime <= asOfTime
    // 4. Must be sorted by openTime descending to get latest first

    const candidateCandles = allCandles
      .filter((c) => c.symbol === symbol && c.timeframe.equals(timeframe))
      .filter((c) => c.isClosed())
      .filter((c) => c.knowledgeTimeUTC <= asOfTimeUTC)
      .sort((a, b) => b.openTimeUTC.getTime() - a.openTimeUTC.getTime());

    return candidateCandles.length > 0 ? candidateCandles[0] : null;
  }

  static getLatestConfirmedCandleForTimeframes(
    allCandles: Candle[],
    symbol: string,
    asOfTimeUTC: Date,
  ): Map<string, Candle | null> {
    const result = new Map<string, Candle | null>();

    for (const tfValue of Object.values(TimeframeValue)) {
      const timeframe = Timeframe.from(tfValue);
      const candle = this.getLatestConfirmedCandle(allCandles, symbol, timeframe, asOfTimeUTC);
      result.set(tfValue, candle);
    }

    return result;
  }

  static hasConfirmedCandleAtTime(
    allCandles: Candle[],
    symbol: string,
    timeframe: Timeframe,
    asOfTimeUTC: Date,
  ): boolean {
    return this.getLatestConfirmedCandle(allCandles, symbol, timeframe, asOfTimeUTC) !== null;
  }
}
