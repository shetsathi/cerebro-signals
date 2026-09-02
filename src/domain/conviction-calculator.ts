/**
 * Signal Conviction Calculator
 *
 * Scores signals 0-100 based on multiple factors:
 * - Regime alignment (20 points)
 * - Setup type reliability (20 points)
 * - Trigger type reliability (20 points)
 * - Risk-Reward ratio (25 points)
 * - Risk status (15 points)
 *
 * Total: 100 points possible
 */

import { RegimeType } from './regime-state';

export enum ConvictionLevel {
  LOW = 'LOW',           // 0-40: Informational only
  MEDIUM = 'MEDIUM',     // 40-70: Consider carefully
  HIGH = 'HIGH',         // 70-100: High confidence
}

export interface ConvictionFactors {
  regime: number;        // 0-20: How bullish is regime?
  setup: number;         // 0-20: How reliable is setup type?
  trigger: number;       // 0-20: How reliable is trigger type?
  ratio: number;         // 0-25: How good is R:R?
  risk: number;          // 0-15: Is risk VALID?
}

export class ConvictionCalculator {
  /**
   * Calculate conviction score for a signal
   */
  static calculateConviction(
    regimeType: string | null,
    setupType: string | null,
    triggerType: string | null,
    riskRewardRatio: number | null,
    riskStatus: string,
  ): { score: number; level: ConvictionLevel; factors: ConvictionFactors } {
    const factors: ConvictionFactors = {
      regime: 0,
      setup: 0,
      trigger: 0,
      ratio: 0,
      risk: 0,
    };

    // Factor 1: Regime Alignment (0-20 points)
    // UPTREND/DOWNTREND highly aligned, RANGE less so
    factors.regime = this.scoreRegime(regimeType);

    // Factor 2: Setup Type Reliability (0-20 points)
    // Some setup types historically more reliable
    factors.setup = this.scoreSetup(setupType);

    // Factor 3: Trigger Type Reliability (0-20 points)
    // Some triggers more reliable than others
    factors.trigger = this.scoreTrigger(triggerType);

    // Factor 4: Risk-Reward Ratio (0-25 points)
    // Higher R:R = more confident
    factors.ratio = this.scoreRatio(riskRewardRatio);

    // Factor 5: Risk Status (0-15 points)
    // Only VALID risks are tradeable
    factors.risk = riskStatus === 'VALID' ? 15 : 0;

    // Total score
    const score = Math.min(
      100,
      factors.regime + factors.setup + factors.trigger + factors.ratio + factors.risk,
    );

    // Determine level
    const level = this.scoreToLevel(score);

    return { score, level, factors };
  }

  /**
   * Regime scoring (0-20 points)
   * UPTREND/DOWNTREND more aligned than RANGE
   */
  private static scoreRegime(regime: string | null): number {
    if (!regime) return 0;

    switch (regime.toUpperCase()) {
      case 'UPTREND':
        return 20; // Perfect alignment for LONG
      case 'DOWNTREND':
        return 20; // Perfect alignment for SHORT
      case 'RANGE':
        return 10; // Moderate (choppy)
      case 'INITIAL':
        return 5; // Insufficient data
      default:
        return 0;
    }
  }

  /**
   * Setup type scoring (0-20 points)
   * Based on historical reliability
   */
  private static scoreSetup(setup: string | null): number {
    if (!setup) return 0;

    // These weights are educated guesses - refine based on actual backtests
    switch (setup.toUpperCase()) {
      case 'PULLBACK_LONG':
        return 18; // Highly reliable
      case 'PULLBACK_SHORT':
        return 18; // Highly reliable
      case 'BREAKOUT_RETEST_LONG':
        return 16; // Reliable with good context
      case 'BREAKOUT_RETEST_SHORT':
        return 16; // Reliable with good context
      default:
        return 0;
    }
  }

  /**
   * Trigger type scoring (0-20 points)
   * Based on how clean the trigger confirmation is
   */
  private static scoreTrigger(trigger: string | null): number {
    if (!trigger) return 0;

    switch (trigger.toUpperCase()) {
      case 'BULLISH_RECLAIM':
        return 19; // Very clean confirmation
      case 'BEARISH_RECLAIM':
        return 19; // Very clean confirmation
      case 'BULLISH_BREAKOUT':
        return 17; // Good but can be faked
      case 'BEARISH_BREAKDOWN':
        return 17; // Good but can be faked
      case 'BULLISH_REVERSAL':
        return 12; // Speculative
      case 'BEARISH_REVERSAL':
        return 12; // Speculative
      default:
        return 0;
    }
  }

  /**
   * Risk-Reward ratio scoring (0-25 points)
   * Better ratio = more confident
   */
  private static scoreRatio(ratio: number | null): number {
    if (!ratio || ratio <= 0) return 0;

    // Scoring curve: diminishing returns at higher ratios
    if (ratio >= 3.0) return 25; // Excellent
    if (ratio >= 2.5) return 22; // Very good
    if (ratio >= 2.0) return 18; // Good (minimum acceptable)
    if (ratio >= 1.5) return 12; // Moderate
    if (ratio >= 1.0) return 6; // Poor
    return 0; // Risk > reward
  }

  /**
   * Convert score to conviction level
   */
  private static scoreToLevel(score: number): ConvictionLevel {
    if (score >= 70) return ConvictionLevel.HIGH;
    if (score >= 40) return ConvictionLevel.MEDIUM;
    return ConvictionLevel.LOW;
  }

  /**
   * Should this signal trigger a Telegram alert?
   * Only HIGH conviction signals by default
   */
  static shouldAlert(convictionLevel: ConvictionLevel): boolean {
    return convictionLevel === ConvictionLevel.HIGH;
  }

  /**
   * Format conviction factors for display
   */
  static formatFactors(factors: ConvictionFactors): string {
    return [
      `regime=${factors.regime}`,
      `setup=${factors.setup}`,
      `trigger=${factors.trigger}`,
      `ratio=${factors.ratio}`,
      `risk=${factors.risk}`,
    ].join(' + ');
  }

  /**
   * Format score for logging
   */
  static formatScore(score: number, level: ConvictionLevel): string {
    const emoji =
      level === ConvictionLevel.HIGH ? '🟢' : level === ConvictionLevel.MEDIUM ? '🟡' : '🔴';
    return `${emoji} ${score}/100 (${level})`;
  }
}
