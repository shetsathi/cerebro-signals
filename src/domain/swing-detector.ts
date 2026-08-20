import { Candle } from './candle';
import { SwingPoint, SwingType } from './swing-point';
import { StructureConfig } from './structure-config';

export class SwingDetector {
  static detectCandidateSwings(
    candles: Candle[],
    config: StructureConfig,
  ): SwingPoint[] {
    if (candles.length < config.totalBars) {
      return [];
    }

    const candidates: SwingPoint[] = [];

    // Sort by time to ensure consistent processing
    const sortedCandles = [...candles].sort(
      (a, b) => a.openTimeUTC.getTime() - b.openTimeUTC.getTime(),
    );

    // Group by symbol and timeframe
    const grouped = new Map<string, Candle[]>();
    for (const candle of sortedCandles) {
      const key = `${candle.symbol}-${candle.timeframe.value}`;
      if (!grouped.has(key)) {
        grouped.set(key, []);
      }
      grouped.get(key)!.push(candle);
    }

    // For each symbol/timeframe, find candidate pivots
    for (const candleSeq of grouped.values()) {
      for (let i = config.leftBars; i < candleSeq.length - config.rightBars; i++) {
        const candidate = this.checkSwingHigh(candleSeq, i, config);
        if (candidate) {
          candidates.push(candidate);
        }

        const candidate2 = this.checkSwingLow(candleSeq, i, config);
        if (candidate2) {
          candidates.push(candidate2);
        }
      }
    }

    return candidates;
  }

  private static checkSwingHigh(
    candles: Candle[],
    candleIndex: number,
    config: StructureConfig,
  ): SwingPoint | null {
    const candidate = candles[candleIndex];

    // Check left bars
    for (let i = 1; i <= config.leftBars; i++) {
      if (candidate.ohlc.high <= candles[candleIndex - i].ohlc.high) {
        return null;
      }
    }

    // Check right bars (if available)
    for (let i = 1; i <= config.rightBars; i++) {
      if (candleIndex + i < candles.length) {
        if (candidate.ohlc.high <= candles[candleIndex + i].ohlc.high) {
          return null;
        }
      }
    }

    // This is a candidate swing high
    return new SwingPoint(
      candidate.symbol,
      candidate.timeframe,
      SwingType.HIGH,
      candidate.ohlc.high,
      candidate.closeTimeUTC, // event time is when candle closes
      candidate.closeTimeUTC, // candidate knowledge time (will be updated when confirmed)
      candidate.openTimeUTC,
    );
  }

  private static checkSwingLow(
    candles: Candle[],
    candleIndex: number,
    config: StructureConfig,
  ): SwingPoint | null {
    const candidate = candles[candleIndex];

    // Check left bars
    for (let i = 1; i <= config.leftBars; i++) {
      if (candidate.ohlc.low >= candles[candleIndex - i].ohlc.low) {
        return null;
      }
    }

    // Check right bars (if available)
    for (let i = 1; i <= config.rightBars; i++) {
      if (candleIndex + i < candles.length) {
        if (candidate.ohlc.low >= candles[candleIndex + i].ohlc.low) {
          return null;
        }
      }
    }

    // This is a candidate swing low
    return new SwingPoint(
      candidate.symbol,
      candidate.timeframe,
      SwingType.LOW,
      candidate.ohlc.low,
      candidate.closeTimeUTC, // event time is when candle closes
      candidate.closeTimeUTC, // candidate knowledge time (will be updated when confirmed)
      candidate.openTimeUTC,
    );
  }
}
