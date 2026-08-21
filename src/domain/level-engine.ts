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

    // Detect events (including FAILED_BREAK and RETEST_INTERACTION)
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

    // 2. Create prior-period levels (day, week back, month back)
    const candlesByTimeframe = this.groupByTimeframe(candles);
    const dailyCandles = candlesByTimeframe.get(TimeframeValue.DAILY) || [];

    // Prior Day levels: immediately prior closed day
    if (dailyCandles.length >= 2) {
      const priorDaily = dailyCandles[dailyCandles.length - 2];
      if (priorDaily.isClosed() && priorDaily.knowledgeTimeUTC <= asOfTime) {
        levels.push(...this.createPriorPeriodLevels(priorDaily, LevelOrigin.PRIOR_DAY, symbol, config));
      }
    }

    // Prior Week levels: candle from previous week boundary
    const priorWeekCandle = this.getPriorWeekCandle(dailyCandles, asOfTime);
    if (priorWeekCandle && priorWeekCandle.knowledgeTimeUTC <= asOfTime) {
      levels.push(...this.createPriorPeriodLevels(priorWeekCandle, LevelOrigin.PRIOR_WEEK, symbol, config));
    }

    // Prior Month levels: candle from previous month boundary
    const priorMonthCandle = this.getPriorMonthCandle(dailyCandles, asOfTime);
    if (priorMonthCandle && priorMonthCandle.knowledgeTimeUTC <= asOfTime) {
      levels.push(...this.createPriorPeriodLevels(priorMonthCandle, LevelOrigin.PRIOR_MONTH, symbol, config));
    }

    // 3. Create gap-edge levels
    if (candles.length >= 2) {
      const gapLevels = this.createGapLevels(candles, symbol, config, asOfTime);
      levels.push(...gapLevels);
    }

    return levels;
  }

  private static getPriorWeekCandle(dailyCandles: Candle[], asOfTime: Date): Candle | null {
    if (dailyCandles.length === 0) return null;

    const currentDate = new SessionTime(asOfTime);
    const currentWeekStart = this.getWeekStart(currentDate);

    // Find the last candle of the prior week (Friday of prior week)
    for (let i = dailyCandles.length - 1; i >= 0; i--) {
      const candle = dailyCandles[i];
      const candleDate = new SessionTime(candle.closeTimeUTC);
      const candleWeekStart = this.getWeekStart(candleDate);

      // Check if this candle is from a prior week
      if (candleWeekStart.getTime() < currentWeekStart.getTime()) {
        return candle;
      }
    }

    return null;
  }

  private static getPriorMonthCandle(dailyCandles: Candle[], asOfTime: Date): Candle | null {
    if (dailyCandles.length === 0) return null;

    const asOfDate = new SessionTime(asOfTime);
    const currentMonth = asOfDate.ist.getMonth();
    const currentYear = asOfDate.ist.getFullYear();

    // Find the last candle of the prior month
    for (let i = dailyCandles.length - 1; i >= 0; i--) {
      const candle = dailyCandles[i];
      const candleDate = new SessionTime(candle.closeTimeUTC);
      const candleMonth = candleDate.ist.getMonth();
      const candleYear = candleDate.ist.getFullYear();

      // Check if prior month
      if (candleYear < currentYear || (candleYear === currentYear && candleMonth < currentMonth)) {
        return candle;
      }
    }

    return null;
  }

  private static getWeekStart(sessionTime: SessionTime): Date {
    const date = new Date(sessionTime.ist);
    const day = date.getDay();
    // Monday = 1, so (day + 6) % 7 gives us Monday
    const diff = date.getDate() - day + (day === 0 ? -6 : 1);
    const weekStart = new Date(date.setDate(diff));
    weekStart.setHours(0, 0, 0, 0);
    return weekStart;
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
    const breaksByLevelId = new Map<string, number>(); // levelId -> breakCandleIndex

    // Phase 1: Detect primary events (interaction, break, wick rejection)
    for (const level of levels) {
      for (let candleIndex = 0; candleIndex < candles.length; candleIndex++) {
        const candle = candles[candleIndex];

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

        // Detect break (close-based, strict) - only first break per level
        if (!breaksByLevelId.has(level.levelId)) {
          if (level.polarity === LevelPolarity.RESISTANCE && candle.ohlc.close > level.price) {
            const breakMechanism = this.detectBreakMechanism(
              candleIndex,
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
            breaksByLevelId.set(level.levelId, candleIndex);
          } else if (level.polarity === LevelPolarity.SUPPORT && candle.ohlc.close < level.price) {
            const breakMechanism = this.detectBreakMechanism(
              candleIndex,
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
            breaksByLevelId.set(level.levelId, candleIndex);
          }
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

    // Phase 2: Detect compound events (FAILED_BREAK, RETEST_INTERACTION) based on detected breaks
    for (const level of levels) {
      const breakCandleIndex = breaksByLevelId.get(level.levelId);
      if (breakCandleIndex === undefined) continue; // No break detected for this level

      for (let j = breakCandleIndex + 1; j < candles.length; j++) {
        const testCandle = candles[j];
        if (testCandle.symbol !== level.symbol) continue;
        if (!testCandle.timeframe.equals(level.timeframe)) continue;
        if (testCandle.knowledgeTimeUTC > asOfTime) continue;

        // Check if we're still within maxBarsFailedBreak window
        const barsAfterBreak = j - breakCandleIndex;
        if (barsAfterBreak >= config.maxBarsFailedBreak) break;

        // Detect FAILED_BREAK
        const isFailedBreak =
          (level.polarity === LevelPolarity.RESISTANCE && testCandle.ohlc.close <= level.price) ||
          (level.polarity === LevelPolarity.SUPPORT && testCandle.ohlc.close >= level.price);

        if (isFailedBreak) {
          // Failed break direction is opposite of the break direction
          events.push(
            new LevelEvent(
              `failed_break_${level.levelId}_${testCandle.id}`,
              level.levelId,
              LevelEventType.FAILED_BREAK,
              testCandle.timeframe,
              testCandle.closeTimeUTC,
              testCandle.knowledgeTimeUTC,
              level.polarity === LevelPolarity.RESISTANCE ? 'bearish' : 'bullish',
            ),
          );
          break; // Only first failed break
        }
      }

      // Detect RETEST_INTERACTION
      let foundRetest = false;
      for (let j = breakCandleIndex + 1; j < candles.length && !foundRetest; j++) {
        const testCandle = candles[j];
        if (testCandle.symbol !== level.symbol) continue;
        if (!testCandle.timeframe.equals(level.timeframe)) continue;
        if (testCandle.knowledgeTimeUTC > asOfTime) continue;

        const barsAfterBreak = j - breakCandleIndex;
        if (barsAfterBreak >= config.maxBarsAfterBreak) break;

        // Check for opposite break (breaks chain)
        const isOppositeBreak =
          (level.polarity === LevelPolarity.RESISTANCE && testCandle.ohlc.close < level.price) ||
          (level.polarity === LevelPolarity.SUPPORT && testCandle.ohlc.close > level.price);

        if (isOppositeBreak) break; // Chain broken

        // Check for interaction
        if (testCandle.ohlc.low <= level.price && testCandle.ohlc.high >= level.price) {
          events.push(
            new LevelEvent(
              `retest_interaction_${level.levelId}_${testCandle.id}`,
              level.levelId,
              LevelEventType.RETEST_INTERACTION,
              testCandle.timeframe,
              testCandle.closeTimeUTC,
              testCandle.knowledgeTimeUTC,
            ),
          );
          foundRetest = true;
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
      // Bullish break (RESISTANCE broken upward): previous close < level AND current open > level
      if (prevCandle.ohlc.close < levelPrice && currCandle.ohlc.open > levelPrice) {
        return BreakMechanism.GAPPED;
      }
    } else {
      // Bearish break (SUPPORT broken downward): previous close > level AND current open < level
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
      const frozen = Object.freeze([...sorted.slice(0, k)]);
      result.set(timeframeValue, frozen as Level[]);
    }

    return result;
  }

  private static getNearestLevelsBelow(levels: Level[], k: number): Map<string, Level[]> {
    const result = new Map<string, Level[]>();
    const byTimeframe = this.groupByTimeframe(levels);

    for (const [timeframeValue, timeframeLevels] of byTimeframe) {
      const sorted = [...timeframeLevels].sort(LevelComparator.byPriceDescending);
      const frozen = Object.freeze([...sorted.slice(0, k)]);
      result.set(timeframeValue, frozen as Level[]);
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
