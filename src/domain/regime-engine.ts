import { Candle } from './candle';
import { StructureEngine } from './structure-engine';
import { StructureSnapshot } from './structure-snapshot';
import { StructureConfig } from './structure-config';
import { Timeframe, TimeframeValue } from './timeframe';
import { RegimeType } from './regime-state';
import { RegimeSnapshot, RegimeEvidence } from './regime-snapshot';
import { RegimeEvaluator } from './regime-evaluator';
import { RegimeStateMachine } from './regime-state-machine';

export class RegimeEngine {
  static getRegimeSnapshot(
    candles: Candle[],
    asOfTimeUTC: Date,
    symbol: string,
    structureConfig: StructureConfig = new StructureConfig(),
    previousRegimeSnapshot: RegimeSnapshot | null = null,
  ): RegimeSnapshot {
    // Get structure snapshots for each timeframe
    const snapshot1D = StructureEngine.getStructureSnapshot(
      candles,
      asOfTimeUTC,
      symbol,
      Timeframe.from(TimeframeValue.DAILY),
      structureConfig,
    );

    const snapshot60m = StructureEngine.getStructureSnapshot(
      candles,
      asOfTimeUTC,
      symbol,
      Timeframe.from(TimeframeValue.SIXTY_MIN),
      structureConfig,
    );

    const snapshot15m = StructureEngine.getStructureSnapshot(
      candles,
      asOfTimeUTC,
      symbol,
      Timeframe.from(TimeframeValue.FIFTEEN_MIN),
      structureConfig,
    );

    const snapshot5m = StructureEngine.getStructureSnapshot(
      candles,
      asOfTimeUTC,
      symbol,
      Timeframe.from(TimeframeValue.FIVE_MIN),
      structureConfig,
    );

    // Evaluate each timeframe independently
    const regime1D = this.evaluateTimeframeRegime(snapshot1D, asOfTimeUTC);
    const regime60m = this.evaluateTimeframeRegime(snapshot60m, asOfTimeUTC);
    const regime15m = this.evaluateTimeframeRegime(snapshot15m, asOfTimeUTC);
    const regime5m = this.evaluateTimeframeRegime(snapshot5m, asOfTimeUTC);

    // Determine current (dominant) regime from hierarchy: 1D > 60m > 15m > 5m
    const currentRegime = this.determineDominantRegime(regime1D, regime60m, regime15m, regime5m);

    // Get previous regime for state machine
    const previousRegime = previousRegimeSnapshot?.currentRegime || null;

    // Apply state machine if we have a previous regime
    let nextRegime = currentRegime;
    let transitionDetails: { from: RegimeType; chochDirection: 'bullish' | 'bearish' } | null = null;

    if (previousRegime && RegimeStateMachine.isValidTransition(previousRegime, currentRegime)) {
      nextRegime = currentRegime;
    } else if (previousRegime && !RegimeStateMachine.isValidTransition(previousRegime, currentRegime)) {
      // Check for state machine transitions (CHOCH -> TRANSITION -> BOS)
      if (previousRegime === RegimeType.TREND_BULLISH) {
        const hasBearishCHOCH = RegimeEvaluator.hasConfirmedCHOCH(snapshot60m, 'bearish');
        if (hasBearishCHOCH) {
          nextRegime = RegimeType.TRANSITION;
          transitionDetails = { from: previousRegime, chochDirection: 'bearish' };
        }
      }

      if (previousRegime === RegimeType.TREND_BEARISH) {
        const hasBullishCHOCH = RegimeEvaluator.hasConfirmedCHOCH(snapshot60m, 'bullish');
        if (hasBullishCHOCH) {
          nextRegime = RegimeType.TRANSITION;
          transitionDetails = { from: previousRegime, chochDirection: 'bullish' };
        }
      }

      if (previousRegime === RegimeType.TRANSITION) {
        const hasBullishBOS = RegimeEvaluator.hasBullishBOS(snapshot60m);
        const hasBearishBOS = RegimeEvaluator.hasBearishBOS(snapshot60m);

        if (hasBullishBOS) {
          nextRegime = RegimeType.TREND_BULLISH;
        } else if (hasBearishBOS) {
          nextRegime = RegimeType.TREND_BEARISH;
        }
      }
    }

    // Build evidence collections
    const evidence1D = this.buildEvidence(snapshot1D);
    const evidence60m = this.buildEvidence(snapshot60m);
    const evidence15m = this.buildEvidence(snapshot15m);
    const evidence5m = this.buildEvidence(snapshot5m);

    // Latest knowledge time is the most recent snapshot's knowledge
    const knowledgeTimeUTC = this.getLatestKnowledgeTime(
      snapshot1D,
      snapshot60m,
      snapshot15m,
      snapshot5m,
    );

    // Evaluate structural direction for each timeframe
    const struct1D = RegimeEvaluator.evaluateStructuralDirection(snapshot1D);
    const struct60m = RegimeEvaluator.evaluateStructuralDirection(snapshot60m);
    const struct15m = RegimeEvaluator.evaluateStructuralDirection(snapshot15m);
    const struct5m = RegimeEvaluator.evaluateStructuralDirection(snapshot5m);

    // Create immutable snapshot
    const snapshot = new RegimeSnapshot(
      symbol,
      asOfTimeUTC,
      knowledgeTimeUTC,
      regime1D,
      regime60m,
      regime15m,
      regime5m,
      nextRegime,
      struct1D,
      struct60m,
      struct15m,
      struct5m,
      transitionDetails,
      evidence1D,
      evidence60m,
      evidence15m,
      evidence5m,
      previousRegime,
      true, // isValidTransition
    );

    snapshot.seal();
    return snapshot;
  }

  private static evaluateTimeframeRegime(
    snapshot: StructureSnapshot,
    asOfTime: Date,
  ): RegimeType {
    const evaluation = RegimeEvaluator.evaluateStructureRegime(snapshot, asOfTime);
    return evaluation.regime;
  }

  private static determineDominantRegime(
    regime1D: RegimeType,
    regime60m: RegimeType,
    regime15m: RegimeType,
    regime5m: RegimeType,
  ): RegimeType {
    // Multi-timeframe hierarchy: do NOT use voting
    // 1D context overrides everything if it's a defined trend
    if (regime1D === RegimeType.TREND_BULLISH || regime1D === RegimeType.TREND_BEARISH) {
      return regime1D;
    }

    // 60m primary regime
    if (regime60m === RegimeType.TREND_BULLISH || regime60m === RegimeType.TREND_BEARISH) {
      return regime60m;
    }

    // 15m intermediate
    if (regime15m === RegimeType.TREND_BULLISH || regime15m === RegimeType.TREND_BEARISH) {
      return regime15m;
    }

    // 5m execution
    if (regime5m === RegimeType.TREND_BULLISH || regime5m === RegimeType.TREND_BEARISH) {
      return regime5m;
    }

    // Check for TRANSITION states (hierarchy also applied)
    if (regime1D === RegimeType.TRANSITION || regime60m === RegimeType.TRANSITION) {
      return RegimeType.TRANSITION;
    }

    if (regime15m === RegimeType.TRANSITION || regime5m === RegimeType.TRANSITION) {
      return RegimeType.TRANSITION;
    }

    // Check for RANGE
    if (
      regime1D === RegimeType.RANGE ||
      regime60m === RegimeType.RANGE ||
      regime15m === RegimeType.RANGE ||
      regime5m === RegimeType.RANGE
    ) {
      return RegimeType.RANGE;
    }

    // Default to INSUFFICIENT_DATA
    return RegimeType.INSUFFICIENT_DATA;
  }

  private static buildEvidence(snapshot: StructureSnapshot): RegimeEvidence {
    const swings = snapshot.getConfirmedSwings();
    const bosEvents = snapshot.getBOSEvents();
    const chochEvents = snapshot.getCHOCHEvents();

    return {
      structurePresent: snapshot.getStructureType() !== 'UNKNOWN',
      bosCount: bosEvents.length,
      chochCount: chochEvents.length,
      swingCount: swings.length,
    };
  }

  private static getLatestKnowledgeTime(
    ...snapshots: StructureSnapshot[]
  ): Date {
    let latest = new Date(0);

    for (const snapshot of snapshots) {
      const swings = snapshot.getConfirmedSwings();
      for (const swing of swings) {
        if (swing.knowledgeTimeUTC.getTime() > latest.getTime()) {
          latest = swing.knowledgeTimeUTC;
        }
      }
    }

    return latest.getTime() > 0 ? latest : new Date();
  }
}
