import { Candle, CandleStatus } from './candle';
import { StructureSnapshot } from './structure-snapshot';
import { Timeframe, TimeframeValue } from './timeframe';
import { SessionTime } from './session';
import { Level, LevelOrigin, LevelPolarity, LevelComparator } from './level';
import { LevelEvent, LevelEventType, BreakMechanism, LevelEventComparator } from './level-event';
import {
  LocationSnapshot,
  LocationGeometry,
  DataSufficiency,
  PolarityState,
} from './location-snapshot';
import { SwingType } from './swing-point';

export interface LevelEngineConfig {
  k: number; // K nearest levels to expose per timeframe
  maxBarsFailedBreak: number; // Bars after break for failed break to be detected
  maxBarsAfterBreak: number; // Bars after break for retest interaction to be valid
  rulesetVersion: string;
  configHash: string;
}

export class LevelEngine {
  static getLocationSnapshot(
    candles: Candle[],
    structureSnapshot: StructureSnapshot,
    asOfTimeUTC: Date,
    symbol: string,
    config: LevelEngineConfig,
  ): LocationSnapshot {
    if (candles.length === 0) {
      return new LocationSnapshot(
        symbol,
        asOfTimeUTC,
        asOfTimeUTC,
        DataSufficiency.INSUFFICIENT_DATA,
        false,
        config.rulesetVersion,
        config.configHash,
        [],
        [],
        new Map(),
        new Map(),
        new Map(),
      );
    }

    // Filter candles for this symbol and ensure they're closed/developing appropriately
    const relevantCandles = candles.filter((c) => c.symbol === symbol);

    if (relevantCandles.length === 0) {
      return new LocationSnapshot(
        symbol,
        asOfTimeUTC,
        asOfTimeUTC,
        DataSufficiency.INSUFFICIENT_DATA,
        false,
        config.rulesetVersion,
        config.configHash,
        [],
        [],
        new Map(),
        new Map(),
        new Map(),
      );
    }

    // Create levels from all sources
    const levels = this.createLevels(relevantCandles, structureSnapshot, asOfTimeUTC, symbol, config);

    // Filter levels by knowledge time
    const validLevels = levels.filter((level) => level.knowledgeTimeUTC <= asOfTimeUTC);

    // Detect events
    const events = this.detectEvents(relevantCandles, validLevels, asOfTimeUTC, config);

    // Filter events by knowledge time
    const validEvents = events.filter((event) => event.knowledgeTimeUTC <= asOfTimeUTC);

    // Calculate polarity states
    const polarityStates = this.calculatePolarityStates(validLevels, validEvents, asOfTimeUTC);

    // Determine data sufficiency
    const dataSufficiency = this.determineSufficiency(relevantCandles, validLevels);

    // Determine if session opening candle
    const isSessionOpening = this.isSessionOpeningCandle(relevantCandles);

    // Get nearest K levels above/below per timeframe
    const nearestAbove = this.getNearestLevelsAbove(validLevels, config.k);
    const nearestBelow = this.getNearestLevelsBelow(validLevels, config.k);

    // Get latest knowledge time from levels and events
    let knowledgeTimeUTC = asOfTimeUTC;
    for (const level of validLevels) {
      if (level.knowledgeTimeUTC > knowledgeTimeUTC) {
        knowledgeTimeUTC = level.knowledgeTimeUTC;
      }
    }
    for (const event of validEvents) {
      if (event.knowledgeTimeUTC > knowledgeTimeUTC) {
        knowledgeTimeUTC = event.knowledgeTimeUTC;
      }
    }

    const snapshot = new LocationSnapshot(
      symbol,
      asOfTimeUTC,
      knowledgeTimeUTC,
      dataSufficiency,
      isSessionOpening,
      config.rulesetVersion,
      config.configHash,
      validLevels,
      validEvents,
      nearestAbove,
      nearestBelow,
      polarityStates,
    );

    snapshot.seal();
    return snapshot;
  }

  private static createLevels(
    candles: Candle[],
    structureSnapshot: StructureSnapshot,
    asOfTime: Date,
    symbol: string,
    config: LevelEngineConfig,
  ): Level[] {
    const levels: Level[] = [];

    // 1. Create levels from confirmed swings
    const swings = structureSnapshot.getConfirmedSwings();
    for (const swing of swings) {
      if (swing.knowledgeTimeUTC > asOfTime) continue;

      const levelId = `swing_${swing.id}`;
      const polarity = swing.isHigh() ? LevelPolarity.RESISTANCE : LevelPolarity.SUPPORT;

      const level = new Level(
        levelId,
        symbol,
        swing.timeframe,
        LevelOrigin.CONFIRMED_SWING,
        polarity,
        swing.price,
        swing.eventTimeUTC,
        swing.knowledgeTimeUTC,
        config.rulesetVersion,
        config.configHash,
        swing.id,
      );

      levels.push(level);
    }

    // 2. Create prior-period levels (day, week back, month back from daily candles)
    const candlesByTimeframe = this.groupByTimeframe(candles);

    // Prior Day levels
    const dailyCandles = candlesByTimeframe.get(TimeframeValue.DAILY) || [];
    if (dailyCandles.length >= 2) {
      const priorDaily = dailyCandles[dailyCandles.length - 2];
      if (priorDaily.isClosed() && priorDaily.knowledgeTimeUTC <= asOfTime) {
        levels.push(...this.createPriorPeriodLevels(priorDaily, LevelOrigin.PRIOR_DAY, symbol, config));
      }
    }

    // Prior Week levels: find a candle ~5 trading days back
    if (dailyCandles.length >= 6) {
      const priorWeek = dailyCandles[dailyCandles.length - 6];
      if (priorWeek.isClosed() && priorWeek.knowledgeTimeUTC <= asOfTime) {
        levels.push(...this.createPriorPeriodLevels(priorWeek, LevelOrigin.PRIOR_WEEK, symbol, config));
      }
    }

    // Prior Month levels: find a candle ~21 trading days back
    if (dailyCandles.length >= 21) {
      const priorMonth = dailyCandles[dailyCandles.length - 21];
      if (priorMonth.isClosed() && priorMonth.knowledgeTimeUTC <= asOfTime) {
        levels.push(...this.createPriorPeriodLevels(priorMonth, LevelOrigin.PRIOR_MONTH, symbol, config));
      }
    }

    // 3. Create gap-edge levels
    if (candles.length >= 2) {
      const gapLevels = this.createGapLevels(candles, symbol, config, asOfTime);
      levels.push(...gapLevels);
    }

    return levels;
  }

  private static createPriorPeriodLevels(
    candle: Candle,
    origin: LevelOrigin,
    symbol: string,
    config: LevelEngineConfig,
  ): Level[] {
    const levels: Level[] = [];

    // High
    levels.push(
      new Level(
        `${origin.toLowerCase()}_high_${candle.closeTimeUTC.getTime()}`,
        symbol,
        candle.timeframe,
        origin,
        LevelPolarity.RESISTANCE,
        candle.ohlc.high,
        candle.closeTimeUTC,
        candle.knowledgeTimeUTC,
        config.rulesetVersion,
        config.configHash,
      ),
    );

    // Low
    levels.push(
      new Level(
        `${origin.toLowerCase()}_low_${candle.closeTimeUTC.getTime()}`,
        symbol,
        candle.timeframe,
        origin,
        LevelPolarity.SUPPORT,
        candle.ohlc.low,
        candle.closeTimeUTC,
        candle.knowledgeTimeUTC,
        config.rulesetVersion,
        config.configHash,
      ),
    );

    // Close
    levels.push(
      new Level(
        `${origin.toLowerCase()}_close_${candle.closeTimeUTC.getTime()}`,
        symbol,
        candle.timeframe,
        origin,
        candle.ohlc.close > candle.ohlc.open ? LevelPolarity.RESISTANCE : LevelPolarity.SUPPORT,
        candle.ohlc.close,
        candle.closeTimeUTC,
        candle.knowledgeTimeUTC,
        config.rulesetVersion,
        config.configHash,
      ),
    );

    return levels;
  }

  private static createGapLevels(
    candles: Candle[],
    symbol: string,
    config: LevelEngineConfig,
    asOfTime: Date,
  ): Level[] {
    const levels: Level[] = [];

    // Detect gaps between consecutive candles
    for (let i = 1; i < candles.length; i++) {
      const prevCandle = candles[i - 1];
      const currCandle = candles[i];

      if (!prevCandle.isClosed() || !currCandle.isClosed()) continue;
      if (currCandle.knowledgeTimeUTC > asOfTime) continue;

      const prevClose = prevCandle.ohlc.close;
      const currOpen = currCandle.ohlc.open;

      // Gap up
      if (currOpen > prevClose) {
        levels.push(
          new Level(
            `gap_up_${currCandle.openTimeUTC.getTime()}`,
            symbol,
            currCandle.timeframe,
            LevelOrigin.GAP_EDGE,
            LevelPolarity.SUPPORT,
            prevClose,
            currCandle.openTimeUTC,
            currCandle.knowledgeTimeUTC,
            config.rulesetVersion,
            config.configHash,
          ),
        );
      }
      // Gap down
      else if (currOpen < prevClose) {
        levels.push(
          new Level(
            `gap_down_${currCandle.openTimeUTC.getTime()}`,
            symbol,
            currCandle.timeframe,
            LevelOrigin.GAP_EDGE,
            LevelPolarity.RESISTANCE,
            prevClose,
            currCandle.openTimeUTC,
            currCandle.knowledgeTimeUTC,
            config.rulesetVersion,
            config.configHash,
          ),
        );
      }
    }

    return levels;
  }

  private static detectEvents(
    candles: Candle[],
    levels: Level[],
    asOfTime: Date,
    config: LevelEngineConfig,
  ): LevelEvent[] {
    const events: LevelEvent[] = [];

    for (const level of levels) {
      for (const candle of candles) {
        if (candle.symbol !== level.symbol) continue;
        if (!candle.timeframe.equals(level.timeframe)) continue;
        if (candle.knowledgeTimeUTC > asOfTime) continue;

        // Detect interaction
        if (candle.ohlc.low <= level.price && candle.ohlc.high >= level.price) {
          events.push(
            new LevelEvent(
              `interaction_${level.levelId}_${candle.id}`,
              level.levelId,
              LevelEventType.INTERACTION,
              candle.timeframe,
              candle.closeTimeUTC,
              candle.knowledgeTimeUTC,
            ),
          );
        }

        // Detect break (close-based, strict)
        if (level.polarity === LevelPolarity.RESISTANCE && candle.ohlc.close > level.price) {
          const breakMechanism = this.detectBreakMechanism(
            candles.indexOf(candle),
            level.price,
            candles,
            'bearish',
          );

          events.push(
            new LevelEvent(
              `break_${level.levelId}_${candle.id}`,
              level.levelId,
              LevelEventType.BREAK,
              candle.timeframe,
              candle.closeTimeUTC,
              candle.knowledgeTimeUTC,
              'bearish',
              breakMechanism,
            ),
          );
        } else if (level.polarity === LevelPolarity.SUPPORT && candle.ohlc.close < level.price) {
          const breakMechanism = this.detectBreakMechanism(
            candles.indexOf(candle),
            level.price,
            candles,
            'bullish',
          );

          events.push(
            new LevelEvent(
              `break_${level.levelId}_${candle.id}`,
              level.levelId,
              LevelEventType.BREAK,
              candle.timeframe,
              candle.closeTimeUTC,
              candle.knowledgeTimeUTC,
              'bullish',
              breakMechanism,
            ),
          );
        }

        // Detect wick rejection
        if (level.polarity === LevelPolarity.SUPPORT && candle.ohlc.low < level.price && candle.ohlc.close > level.price) {
          events.push(
            new LevelEvent(
              `wick_rej_${level.levelId}_${candle.id}`,
              level.levelId,
              LevelEventType.WICK_REJECTION,
              candle.timeframe,
              candle.closeTimeUTC,
              candle.knowledgeTimeUTC,
              'bullish',
            ),
          );
        } else if (level.polarity === LevelPolarity.RESISTANCE && candle.ohlc.high > level.price && candle.ohlc.close < level.price) {
          events.push(
            new LevelEvent(
              `wick_rej_${level.levelId}_${candle.id}`,
              level.levelId,
              LevelEventType.WICK_REJECTION,
              candle.timeframe,
              candle.closeTimeUTC,
              candle.knowledgeTimeUTC,
              'bearish',
            ),
          );
        }
      }
    }

    return events;
  }

  private static detectBreakMechanism(
    candleIndex: number,
    levelPrice: number,
    candles: Candle[],
    direction: 'bullish' | 'bearish',
  ): BreakMechanism {
    if (candleIndex === 0) {
      return BreakMechanism.TRADED;
    }

    const prevCandle = candles[candleIndex - 1];
    const currCandle = candles[candleIndex];

    if (direction === 'bullish') {
      // Gap up break: previous close < level AND current open > level
      if (prevCandle.ohlc.close < levelPrice && currCandle.ohlc.open > levelPrice) {
        return BreakMechanism.GAPPED;
      }
    } else {
      // Gap down break: previous close > level AND current open < level
      if (prevCandle.ohlc.close > levelPrice && currCandle.ohlc.open < levelPrice) {
        return BreakMechanism.GAPPED;
      }
    }

    return BreakMechanism.TRADED;
  }

  private static calculatePolarityStates(
    levels: Level[],
    events: LevelEvent[],
    asOfTime: Date,
  ): Map<string, PolarityState> {
    const states = new Map<string, PolarityState>();

    for (const level of levels) {
      let currentPolarity = level.polarity;
      let brokeAt: Date | null = null;
      let breakMechanism: 'TRADED' | 'GAPPED' | undefined;

      // Find first break event
      const breakEvents = events.filter(
        (e) => e.levelId === level.levelId && e.eventType === LevelEventType.BREAK,
      );

      if (breakEvents.length > 0) {
        const firstBreak = breakEvents[0];
        brokeAt = firstBreak.eventTimeUTC;
        breakMechanism = firstBreak.breakMechanism as 'TRADED' | 'GAPPED' | undefined;

        // Flip polarity
        currentPolarity =
          currentPolarity === LevelPolarity.RESISTANCE
            ? LevelPolarity.SUPPORT
            : LevelPolarity.RESISTANCE;
      }

      states.set(level.levelId, {
        currentPolarity,
        brokeAt,
        breakMechanism,
      });
    }

    return states;
  }

  private static determineSufficiency(candles: Candle[], levels: Level[]): DataSufficiency {
    if (levels.length === 0) {
      return DataSufficiency.INSUFFICIENT_DATA;
    }
    // Simple heuristic: if we have levels, we have sufficient data
    return DataSufficiency.SUFFICIENT;
  }

  private static isSessionOpeningCandle(candles: Candle[]): boolean {
    if (candles.length === 0) return false;

    const lastCandle = candles[candles.length - 1];
    const sessionTime = new SessionTime(lastCandle.openTimeUTC);

    return sessionTime.hours === 9 && sessionTime.minutes === 15;
  }

  private static getNearestLevelsAbove(levels: Level[], k: number): Map<string, Level[]> {
    const result = new Map<string, Level[]>();
    const byTimeframe = this.groupByTimeframe(levels);

    for (const [timeframeValue, timeframeLevels] of byTimeframe) {
      const sorted = [...timeframeLevels].sort(LevelComparator.byPriceAscending);
      result.set(timeframeValue, sorted.slice(0, k));
    }

    return result;
  }

  private static getNearestLevelsBelow(levels: Level[], k: number): Map<string, Level[]> {
    const result = new Map<string, Level[]>();
    const byTimeframe = this.groupByTimeframe(levels);

    for (const [timeframeValue, timeframeLevels] of byTimeframe) {
      const sorted = [...timeframeLevels].sort(LevelComparator.byPriceDescending);
      result.set(timeframeValue, sorted.slice(0, k));
    }

    return result;
  }

  private static groupByTimeframe(items: { timeframe: Timeframe }[]): Map<string, any[]> {
    const map = new Map<string, any[]>();
    for (const item of items) {
      const key = item.timeframe.value;
      if (!map.has(key)) {
        map.set(key, []);
      }
      map.get(key)!.push(item);
    }
    return map;
  }
}
