/**
 * Conviction Calculator — Signal Quality Scoring
 *
 * Phase 3: Conviction Score (0-100) based on 5 factors:
 * 1. Regime Conviction (20 points) — How confident is the market regime?
 * 2. Setup Quality (20 points) — Pullback stronger than breakout?
 * 3. Trigger Confirmation (20 points) — How well confirmed is the trigger?
 * 4. Risk/Reward Ratio (20 points) — How favorable is the R:R?
 * 5. Risk Validity (20 points) — How valid is the risk setup?
 *
 * Score: 0-100
 * Level: LOW (<40), MEDIUM (40-69), HIGH (70+)
 */

export type ConvictionLevel = 'LOW' | 'MEDIUM' | 'HIGH';

export interface ConvictionFactors {
  regimeConviction: number;       // 0-20
  setupQuality: number;            // 0-20
  triggerConfirmation: number;     // 0-20
  riskRewardRatio: number;         // 0-20
  riskValidity: number;            // 0-20
}

export interface ConvictionResult {
  score: number;
  level: ConvictionLevel;
  factors: ConvictionFactors;
}

export class ConvictionCalculator {
  /**
   * Calculate conviction score from factors
   */
  static calculateScore(factors: ConvictionFactors): number {
    const total =
      factors.regimeConviction +
      factors.setupQuality +
      factors.triggerConfirmation +
      factors.riskRewardRatio +
      factors.riskValidity;

    return Math.min(100, Math.max(0, total));
  }

  /**
   * Determine conviction level from score
   */
  static getLevel(score: number): ConvictionLevel {
    if (score >= 70) return 'HIGH';
    if (score >= 40) return 'MEDIUM';
    return 'LOW';
  }

  /**
   * Calculate full conviction result from signal components
   */
  static calculateConviction(
    regime1D: string | null,
    setupType: string | null,
    triggerType: string | null,
    riskRewardRatio: number | undefined | null,
    riskStatus: string
  ): ConvictionResult {
    const factors: ConvictionFactors = {
      regimeConviction: regime1D ? this.calculateRegimeConviction(regime1D, '') : 6,
      setupQuality: setupType ? this.calculateSetupQuality(setupType) : 6,
      triggerConfirmation: triggerType ? this.calculateTriggerConfirmation(triggerType) : 6,
      riskRewardRatio: this.calculateRiskRewardConviction(riskRewardRatio),
      riskValidity: riskStatus === 'VALID' ? 16 : 4,
    };

    const score = this.calculateScore(factors);
    const level = this.getLevel(score);

    return { score, level, factors };
  }

  /**
   * Format conviction score for display
   */
  static formatScore(score: number, level: ConvictionLevel): string {
    const icon = level === 'HIGH' ? '🟢' : level === 'MEDIUM' ? '🟡' : '🔴';
    return `${icon} ${score.toFixed(0)}/100 (${level})`;
  }

  /**
   * Format conviction factors for display
   */
  static formatFactors(factors: ConvictionFactors): string {
    return `R${factors.regimeConviction}|S${factors.setupQuality}|T${factors.triggerConfirmation}|RR${factors.riskRewardRatio}|V${factors.riskValidity}`;
  }

  /**
   * Calculate regime conviction (0-20)
   * HIGH conviction: 1D + 60m both UPTREND/DOWNTREND (15-20 pts)
   * MEDIUM conviction: Mixed timeframes (8-14 pts)
   * LOW conviction: RANGE or INITIAL (0-7 pts)
   */
  static calculateRegimeConviction(regime1D: string, regime60m: string): number {
    // Both timeframes aligned
    if (
      (regime1D === 'UPTREND' && regime60m === 'UPTREND') ||
      (regime1D === 'DOWNTREND' && regime60m === 'DOWNTREND')
    ) {
      return 18;
    }

    // One aligned, one neutral
    if (
      (regime1D === 'UPTREND' || regime1D === 'DOWNTREND') &&
      regime60m === 'RANGE'
    ) {
      return 12;
    }

    // Range at 1D
    if (regime1D === 'RANGE') {
      return 6;
    }

    // Initial
    return 2;
  }

  /**
   * Calculate setup quality (0-20)
   * PULLBACK: 15-20 (lower risk, higher probability)
   * BREAKOUT_RETEST: 10-14 (moderate quality)
   * Other: 5-9
   */
  static calculateSetupQuality(setupType: string | undefined): number {
    if (setupType?.includes('PULLBACK')) {
      return 18;
    }
    if (setupType?.includes('BREAKOUT_RETEST')) {
      return 12;
    }
    return 6;
  }

  /**
   * Calculate trigger confirmation (0-20)
   * Well-confirmed triggers (close beyond level by 0.5%+): 16-20
   * Moderate confirmation: 10-15
   * Weak confirmation: 5-9
   */
  static calculateTriggerConfirmation(
    triggerType: string | undefined,
    confirmationStrength: number = 0.5
  ): number {
    if (!triggerType) {
      return 6;
    }

    // BULLISH/BEARISH_BREAKOUT stronger confirmation
    if (
      triggerType.includes('BULLISH_BREAKOUT') ||
      triggerType.includes('BEARISH_BREAKDOWN')
    ) {
      return confirmationStrength >= 0.5 ? 18 : 12;
    }

    // RECLAIM triggers
    if (
      triggerType.includes('BULLISH_RECLAIM') ||
      triggerType.includes('BEARISH_RECLAIM')
    ) {
      return confirmationStrength >= 0.3 ? 16 : 10;
    }

    return 8;
  }

  /**
   * Calculate R:R conviction (0-20)
   * R:R >= 3.0: 18-20 (excellent)
   * R:R 2.0-2.99: 14-17 (good)
   * R:R 1.5-1.99: 10-13 (acceptable)
   * R:R < 1.5: 0-9 (poor, risky)
   */
  static calculateRiskRewardConviction(riskRewardRatio: number | undefined | null): number {
    if (!riskRewardRatio || riskRewardRatio <= 0) {
      return 4;
    }

    if (riskRewardRatio >= 3.0) {
      return 19;
    }
    if (riskRewardRatio >= 2.0) {
      return 15;
    }
    if (riskRewardRatio >= 1.5) {
      return 11;
    }
    if (riskRewardRatio >= 1.0) {
      return 7;
    }

    return 3;
  }

  /**
   * Calculate risk validity (0-20)
   * Valid risk (stop < entry for LONG, stop > entry for SHORT): 16-20
   * Borderline (stop within 0.2% of entry): 8-15
   * Invalid (stop on wrong side): 0-7
   */
  static calculateRiskValidity(
    direction: 'LONG' | 'SHORT',
    entryPrice: number,
    stopPrice: number,
    targetPrice?: number
  ): number {
    if (direction === 'LONG') {
      // Stop should be below entry
      if (stopPrice < entryPrice) {
        const riskPercent = ((entryPrice - stopPrice) / entryPrice) * 100;
        if (riskPercent >= 1.0) return 19; // Good risk
        if (riskPercent >= 0.5) return 15; // Acceptable
        return 10; // Tight stop
      }
      return 2; // Invalid
    } else {
      // SHORT: stop should be above entry
      if (stopPrice > entryPrice) {
        const riskPercent = ((stopPrice - entryPrice) / entryPrice) * 100;
        if (riskPercent >= 1.0) return 19;
        if (riskPercent >= 0.5) return 15;
        return 10;
      }
      return 2; // Invalid
    }
  }

  /**
   * Build factors from signal components
   */
  static buildFactors(
    regime1D: string,
    regime60m: string,
    setupType: string | undefined,
    triggerType: string | undefined,
    riskRewardRatio: number | undefined,
    direction: 'LONG' | 'SHORT',
    entryPrice: number,
    stopPrice: number,
    targetPrice?: number
  ): ConvictionFactors {
    return {
      regimeConviction: this.calculateRegimeConviction(regime1D, regime60m),
      setupQuality: this.calculateSetupQuality(setupType),
      triggerConfirmation: this.calculateTriggerConfirmation(triggerType),
      riskRewardRatio: this.calculateRiskRewardConviction(riskRewardRatio),
      riskValidity: this.calculateRiskValidity(
        direction,
        entryPrice,
        stopPrice,
        targetPrice
      ),
    };
  }
}
