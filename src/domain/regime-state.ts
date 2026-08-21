export enum RegimeType {
  TREND_BULLISH = 'TREND_BULLISH',
  TREND_BEARISH = 'TREND_BEARISH',
  RANGE = 'RANGE',
  TRANSITION = 'TRANSITION',
  INSUFFICIENT_DATA = 'INSUFFICIENT_DATA',
}

export interface RegimeClassification {
  regime: RegimeType;
  reason: string;
}

export interface TimeframeRegimeState {
  regime: RegimeType;
  hasStructure: boolean;
  hasBOS: boolean;
  hasCHOCH: boolean;
  direction?: 'bullish' | 'bearish';
}
