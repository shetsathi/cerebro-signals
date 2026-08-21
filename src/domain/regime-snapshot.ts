import { RegimeType, TimeframeRegimeState } from './regime-state';
import { TimeframeValue } from './timeframe';

export interface RegimeEvidence {
  readonly structurePresent: boolean;
  readonly bosCount: number;
  readonly chochCount: number;
  readonly swingCount: number;
}

export class RegimeSnapshot {
  readonly symbol: string;
  private readonly _asOfTimeUTC: Date;
  private readonly _knowledgeTimeUTC: Date;

  // Multi-timeframe regimes
  readonly macro1DRegime: RegimeType;
  readonly primary60mRegime: RegimeType;
  readonly intermediate15mRegime: RegimeType;
  readonly execution5mRegime: RegimeType;

  // Current dominant regime (highest-context regime)
  readonly currentRegime: RegimeType;

  // Transition state tracking
  readonly transitionDetails: { from: RegimeType; chochDirection: 'bullish' | 'bearish' } | null;

  // Evidence
  private readonly evidence1D: RegimeEvidence;
  private readonly evidence60m: RegimeEvidence;
  private readonly evidence15m: RegimeEvidence;
  private readonly evidence5m: RegimeEvidence;

  // State machine metadata
  readonly previousRegime: RegimeType | null;
  readonly isValidTransition: boolean;

  private sealed: boolean = false;

  constructor(
    symbol: string,
    asOfTimeUTC: Date,
    knowledgeTimeUTC: Date,
    macro1DRegime: RegimeType,
    primary60mRegime: RegimeType,
    intermediate15mRegime: RegimeType,
    execution5mRegime: RegimeType,
    currentRegime: RegimeType,
    transitionDetails: { from: RegimeType; chochDirection: 'bullish' | 'bearish' } | null = null,
    evidence1D: RegimeEvidence = { structurePresent: false, bosCount: 0, chochCount: 0, swingCount: 0 },
    evidence60m: RegimeEvidence = { structurePresent: false, bosCount: 0, chochCount: 0, swingCount: 0 },
    evidence15m: RegimeEvidence = { structurePresent: false, bosCount: 0, chochCount: 0, swingCount: 0 },
    evidence5m: RegimeEvidence = { structurePresent: false, bosCount: 0, chochCount: 0, swingCount: 0 },
    previousRegime: RegimeType | null = null,
    isValidTransition: boolean = true,
  ) {
    this.symbol = symbol;
    this._asOfTimeUTC = new Date(asOfTimeUTC.getTime());
    this._knowledgeTimeUTC = new Date(knowledgeTimeUTC.getTime());
    this.macro1DRegime = macro1DRegime;
    this.primary60mRegime = primary60mRegime;
    this.intermediate15mRegime = intermediate15mRegime;
    this.execution5mRegime = execution5mRegime;
    this.currentRegime = currentRegime;
    this.transitionDetails = transitionDetails;
    this.evidence1D = { ...evidence1D };
    this.evidence60m = { ...evidence60m };
    this.evidence15m = { ...evidence15m };
    this.evidence5m = { ...evidence5m };
    this.previousRegime = previousRegime;
    this.isValidTransition = isValidTransition;
  }

  get asOfTimeUTC(): Date {
    return new Date(this._asOfTimeUTC.getTime());
  }

  get knowledgeTimeUTC(): Date {
    return new Date(this._knowledgeTimeUTC.getTime());
  }

  seal(): void {
    this.sealed = true;
  }

  isSealed(): boolean {
    return this.sealed;
  }

  getEvidence(timeframe: TimeframeValue): RegimeEvidence {
    switch (timeframe) {
      case TimeframeValue.DAILY:
        return { ...this.evidence1D };
      case TimeframeValue.SIXTY_MIN:
        return { ...this.evidence60m };
      case TimeframeValue.FIFTEEN_MIN:
        return { ...this.evidence15m };
      case TimeframeValue.FIVE_MIN:
        return { ...this.evidence5m };
      default:
        throw new Error(`Unknown timeframe: ${timeframe}`);
    }
  }

  isDominantlyBullish(): boolean {
    return this.currentRegime === RegimeType.TREND_BULLISH;
  }

  isDominantlyBearish(): boolean {
    return this.currentRegime === RegimeType.TREND_BEARISH;
  }

  isInTransition(): boolean {
    return this.currentRegime === RegimeType.TRANSITION;
  }

  isRange(): boolean {
    return this.currentRegime === RegimeType.RANGE;
  }

  isInsufficientData(): boolean {
    return this.currentRegime === RegimeType.INSUFFICIENT_DATA;
  }

  preservesHTFContext(): boolean {
    return (
      this.macro1DRegime === RegimeType.TREND_BULLISH ||
      this.macro1DRegime === RegimeType.TREND_BEARISH ||
      this.primary60mRegime === RegimeType.TREND_BULLISH ||
      this.primary60mRegime === RegimeType.TREND_BEARISH
    );
  }

  toString(): string {
    const htf = `1D:${this.macro1DRegime} 60m:${this.primary60mRegime}`;
    const ltf = `15m:${this.intermediate15mRegime} 5m:${this.execution5mRegime}`;
    const transition = this.transitionDetails ? ` [TRANSITION: from ${this.transitionDetails.from}]` : '';
    return `RegimeSnapshot(${this.symbol} @ ${this.asOfTimeUTC.toISOString()}) [${this.currentRegime}] HTF:(${htf}) LTF:(${ltf})${transition}`;
  }
}
