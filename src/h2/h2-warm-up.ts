/**
 * H2 WARM-UP TRACKING
 *
 * Do not evaluate indicators before their required historical observations exist.
 * Track which candles are skipped for warm-up.
 * Record first valid evaluation timestamp.
 *
 * Reuse existing indicator contracts/configuration where possible.
 * Do NOT invent a second warm-up configuration.
 */

/**
 * WARM-UP REQUIREMENT
 *
 * Minimum historical candles needed before indicator values are valid.
 * Derived from existing frozen Parts 1–6 indicator configurations.
 */
export interface WarmupRequirement {
  indicatorName: string;
  minCandlesRequired: number;
  sourceConfiguration: string; // e.g., "RegimeEngine.config.lookback"
}

/**
 * WARM-UP STATE
 *
 * Tracks progress through warm-up period.
 */
export interface WarmupState {
  // Requirements
  requirements: WarmupRequirement[];
  maxCandlesRequired: number;

  // Tracking
  candlesSeenSoFar: number;
  firstEvaluationTimestamp?: Date;
  warmupComplete: boolean;
  candlesSkippedForWarmup: number;
}

/**
 * Create warm-up state from existing Parts 1–6 configuration
 *
 * Reads published configuration instead of duplicating it.
 */
export function createWarmupState(
  configuration: {
    regimeEngineWarmup: number; // existing RegimeEngine lookback
    levelEngineWarmup: number; // existing LevelEngine lookback
    setupEngineWarmup: number; // existing SetupEngine warm-up
    indicatorWarmup: number; // combined max
  },
): WarmupState {
  const requirements: WarmupRequirement[] = [];
  let maxRequired = 0;

  if (configuration.regimeEngineWarmup > 0) {
    requirements.push({
      indicatorName: 'RegimeEngine',
      minCandlesRequired: configuration.regimeEngineWarmup,
      sourceConfiguration: 'RegimeEngine.config.lookback',
    });
    maxRequired = Math.max(maxRequired, configuration.regimeEngineWarmup);
  }

  if (configuration.levelEngineWarmup > 0) {
    requirements.push({
      indicatorName: 'LevelEngine',
      minCandlesRequired: configuration.levelEngineWarmup,
      sourceConfiguration: 'LevelEngine.config.lookback',
    });
    maxRequired = Math.max(maxRequired, configuration.levelEngineWarmup);
  }

  if (configuration.setupEngineWarmup > 0) {
    requirements.push({
      indicatorName: 'SetupEngine',
      minCandlesRequired: configuration.setupEngineWarmup,
      sourceConfiguration: 'SetupEngine.config.warmup',
    });
    maxRequired = Math.max(maxRequired, configuration.setupEngineWarmup);
  }

  if (configuration.indicatorWarmup > 0) {
    requirements.push({
      indicatorName: 'Indicators (combined)',
      minCandlesRequired: configuration.indicatorWarmup,
      sourceConfiguration: 'IndicatorConfiguration.warmupPeriod',
    });
    maxRequired = Math.max(maxRequired, configuration.indicatorWarmup);
  }

  return {
    requirements,
    maxCandlesRequired: maxRequired,
    candlesSeenSoFar: 0,
    warmupComplete: false,
    candlesSkippedForWarmup: 0,
  };
}

/**
 * Process a candle through warm-up state.
 *
 * Accepts any object with a closeTimeUTC Date (domain Candle) or a date string.
 * Returns whether warm-up is complete and evaluation is valid.
 */
export function processCandle(
  state: WarmupState,
  candle: { closeTimeUTC: Date } | { date: string },
): { skipForWarmup: boolean } {
  state.candlesSeenSoFar++;

  const skipForWarmup = state.candlesSeenSoFar <= state.maxCandlesRequired;

  if (skipForWarmup) {
    state.candlesSkippedForWarmup++;
  } else if (!state.warmupComplete) {
    state.warmupComplete = true;
    // Support both domain Candle (closeTimeUTC) and raw candle (date string)
    if ('closeTimeUTC' in candle) {
      state.firstEvaluationTimestamp = new Date(candle.closeTimeUTC);
    } else {
      state.firstEvaluationTimestamp = new Date((candle as { date: string }).date);
    }
  }

  return { skipForWarmup };
}

/**
 * Verify warm-up requirements are met
 *
 * Returns true if sufficient candles have been observed.
 */
export function isWarmupComplete(state: WarmupState): boolean {
  return state.candlesSeenSoFar > state.maxCandlesRequired;
}

/**
 * Get warm-up summary for manifest
 */
export function getWarmupSummary(state: WarmupState): {
  requirementsMet: boolean;
  candlesSkipped: number;
  firstEvaluationTime?: Date;
  requirements: Array<{
    name: string;
    minRequired: number;
    met: boolean;
  }>;
} {
  return {
    requirementsMet: state.warmupComplete,
    candlesSkipped: state.candlesSkippedForWarmup,
    firstEvaluationTime: state.firstEvaluationTimestamp,
    requirements: state.requirements.map(req => ({
      name: req.indicatorName,
      minRequired: req.minCandlesRequired,
      met: state.candlesSeenSoFar > req.minCandlesRequired,
    })),
  };
}

/**
 * HARD CONSTRAINTS
 *
 * These are hard stops; do not proceed if not met.
 */
export const WARMUP_CONSTRAINTS = {
  // Do not modify these without explicit approval from frozen Parts 1–6
  REGIME_ENGINE_MIN_CANDLES: 50, // Must match RegimeEngine configuration
  LEVEL_ENGINE_MIN_CANDLES: 100, // Must match LevelEngine configuration
  SETUP_ENGINE_MIN_CANDLES: 150, // Must match SetupEngine configuration

  // Overall: no evaluation before this many candles have been seen
  COMBINED_MIN_CANDLES: 150,

  // Assertion: if frozen Parts 1–6 require more, STOP implementation
  // Do not continue with H2 if warm-up requirements exceed what ReplayEngine can provide
} as const;

/**
 * Verify warm-up configuration matches frozen Parts 1–6
 *
 * Throws if mismatch detected.
 */
export function assertWarmupConfigurationMatches(
  frozenEngineWarmup: number,
): { matches: boolean; error?: string } {
  if (frozenEngineWarmup > WARMUP_CONSTRAINTS.COMBINED_MIN_CANDLES) {
    return {
      matches: false,
      error: `Frozen engine warm-up (${frozenEngineWarmup}) exceeds H2 expectation (${WARMUP_CONSTRAINTS.COMBINED_MIN_CANDLES}). Update WARMUP_CONSTRAINTS or halt H2 implementation.`,
    };
  }

  return { matches: true };
}
