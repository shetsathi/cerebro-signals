/**
 * Signal Filter Service
 *
 * Filters signals based on conviction score and other quality criteria.
 * Determines which signals should:
 * - Trigger Telegram alerts (high conviction only)
 * - Appear on dashboard (all)
 * - Be stored in database (all)
 *
 * Phase 3: Quality filtering and prioritization
 */

import { ConvictionCalculator, ConvictionLevel } from '../domain/conviction-calculator';

export interface FilteredSignal {
  shouldAlert: boolean;           // Should this trigger Telegram alert?
  alertReason: string;            // Why or why not?
  displayMarker: string;          // 🟢 / 🟡 / 🔴
  description: string;            // Human-readable summary
}

export class SignalFilterService {
  /**
   * Apply filtering rules to determine if signal should trigger alert
   */
  static filterSignal(
    conviction_score: number | undefined,
    conviction_level: string | undefined,
    risk_reward_ratio: number | null,
    setup_type: string | undefined,
  ): FilteredSignal {
    // Default to no alert unless conviction passes threshold
    const score = conviction_score ?? 0;
    const level = (conviction_level as ConvictionLevel) ?? ConvictionLevel.LOW;

    const shouldAlert = ConvictionCalculator.shouldAlert(level);

    // Build human-readable description
    const description = this.buildDescription(score, level, setup_type, risk_reward_ratio);

    return {
      shouldAlert,
      alertReason: this.getAlertReason(score, level, shouldAlert),
      displayMarker: this.getMarker(level),
      description,
    };
  }

  /**
   * Determine Telegram alert reason
   */
  private static getAlertReason(
    score: number,
    level: ConvictionLevel,
    shouldAlert: boolean,
  ): string {
    if (shouldAlert) {
      if (score >= 85) {
        return 'Extremely high conviction - Alert sent';
      } else if (score >= 70) {
        return 'High conviction - Alert sent';
      }
    }

    if (level === ConvictionLevel.MEDIUM) {
      return `Medium conviction (${score}/100) - No alert (informational only)`;
    } else {
      return `Low conviction (${score}/100) - No alert (monitoring only)`;
    }
  }

  /**
   * Get emoji marker for conviction level
   */
  private static getMarker(level: ConvictionLevel): string {
    switch (level) {
      case ConvictionLevel.HIGH:
        return '🟢';
      case ConvictionLevel.MEDIUM:
        return '🟡';
      case ConvictionLevel.LOW:
        return '🔴';
    }
  }

  /**
   * Build human-readable signal description
   */
  private static buildDescription(
    score: number,
    level: ConvictionLevel,
    setup_type: string | undefined,
    risk_reward_ratio: number | null,
  ): string {
    const parts: string[] = [];

    parts.push(`Conviction: ${score}/100 (${level})`);

    if (setup_type) {
      parts.push(`Setup: ${setup_type}`);
    }

    if (risk_reward_ratio !== null && risk_reward_ratio > 0) {
      parts.push(`R:R: ${risk_reward_ratio.toFixed(2)}:1`);
    }

    return parts.join(' • ');
  }

  /**
   * Get alert severity (for future use with different alert types)
   */
  static getAlertSeverity(level: ConvictionLevel): 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW' | 'NONE' {
    switch (level) {
      case ConvictionLevel.HIGH:
        return 'HIGH';
      case ConvictionLevel.MEDIUM:
        return 'MEDIUM';
      case ConvictionLevel.LOW:
        return 'NONE';
    }
  }

  /**
   * Should this signal appear in dashboard important section?
   * Only HIGH conviction in important section
   */
  static isImportant(level: ConvictionLevel): boolean {
    return level === ConvictionLevel.HIGH;
  }

  /**
   * Filter array of signals by conviction
   */
  static filterSignals(
    signals: Array<{
      conviction_score?: number;
      conviction_level?: string;
      risk_reward_ratio?: number | null;
      setup_type?: string;
    }>,
    minLevel: ConvictionLevel = ConvictionLevel.MEDIUM,
  ): Array<{ signal: any; filter: FilteredSignal }> {
    return signals
      .map(signal => ({
        signal,
        filter: this.filterSignal(
          signal.conviction_score,
          signal.conviction_level,
          signal.risk_reward_ratio ?? null,
          signal.setup_type,
        ),
      }))
      .filter(item => {
        const level = (item.signal.conviction_level as ConvictionLevel) ?? ConvictionLevel.LOW;
        const levelIndex =
          level === ConvictionLevel.HIGH ? 2 : level === ConvictionLevel.MEDIUM ? 1 : 0;
        const minIndex =
          minLevel === ConvictionLevel.HIGH ? 2 : minLevel === ConvictionLevel.MEDIUM ? 1 : 0;
        return levelIndex >= minIndex;
      });
  }

  /**
   * Get summary of signal distribution by conviction level
   */
  static getSummary(
    signals: Array<{ conviction_level?: string }>,
  ): { high: number; medium: number; low: number } {
    const counts = { high: 0, medium: 0, low: 0 };

    for (const signal of signals) {
      const level = (signal.conviction_level as ConvictionLevel) ?? ConvictionLevel.LOW;
      if (level === ConvictionLevel.HIGH) counts.high++;
      else if (level === ConvictionLevel.MEDIUM) counts.medium++;
      else counts.low++;
    }

    return counts;
  }
}
