/**
 * Signal Filter Service — Phase 3 Conviction-Based Filtering
 *
 * Filters signals before alerting:
 * - HIGH conviction (70+): Always alert
 * - MEDIUM conviction (40-69): Alert only if R:R >= 2.0
 * - LOW conviction (<40): No alert
 *
 * Provides transparency: why/why-not to alert
 */

export class SignalFilterService {
  /**
   * Filter signal for alerting
   */
  static filterSignal(
    convictionScore?: number | null,
    convictionLevel?: string | null,
    riskRewardRatio?: number | null,
    setupType?: string
  ): {
    shouldAlert: boolean;
    alertReason: string;
    displayMarker: string;
  } {
    // Default to LOW conviction if not provided
    const score = convictionScore || 0;
    const level = convictionLevel || 'LOW';
    const rr = riskRewardRatio || 0;

    // HIGH conviction: Always alert
    if (level === 'HIGH' || score >= 70) {
      return {
        shouldAlert: true,
        alertReason: `HIGH conviction (${score.toFixed(0)}/100) - Always alert`,
        displayMarker: '🟢🔔',
      };
    }

    // MEDIUM conviction: Alert only if R:R >= 2.0
    if (level === 'MEDIUM' || (score >= 40 && score < 70)) {
      if (rr >= 2.0) {
        return {
          shouldAlert: true,
          alertReason: `MEDIUM conviction (${score.toFixed(0)}/100) + R:R ${rr.toFixed(2)} >= 2.0`,
          displayMarker: '🟡🔔',
        };
      } else {
        return {
          shouldAlert: false,
          alertReason: `MEDIUM conviction (${score.toFixed(0)}/100) but R:R ${rr.toFixed(2)} < 2.0`,
          displayMarker: '🟡',
        };
      }
    }

    // LOW conviction: No alert
    return {
      shouldAlert: false,
      alertReason: `LOW conviction (${score.toFixed(0)}/100) - Quality too low`,
      displayMarker: '🔴',
    };
  }
}
