/**
 * HISTORICAL DATA CONTRACTS
 *
 * Defines input/output formats for historical data import pipeline.
 * Not part of frozen domain—can be extended without changing Parts 1–6.
 */

import { Candle, CandleStatus, CandleOHLC } from '../domain/candle';
import { Timeframe } from '../domain/timeframe';

/**
 * External historical data format (e.g., CSV export, broker API response)
 * Source-agnostic raw candle representation
 */
export interface RawHistoricalCandle {
  symbol: string;
  timeframe: string;
  openTime: string | Date; // ISO string or Date, must include timezone info or be interpreted using config.timezone
  closeTime: string | Date; // ISO string or Date, must include timezone info or be interpreted using config.timezone
  open: number;
  high: number;
  low: number;
  close: number;
  volume?: number;
  knowledgeTime?: string | Date; // optional: when this candle became known (if config.assumeKnowledgeTime='explicitField')
  timezone?: string; // source timezone for naive timestamps (should match config.timezone)
}

/**
 * Validation result with detailed error tracking
 */
export interface DataValidationError {
  rowNumber?: number;
  candle?: RawHistoricalCandle | any; // can be Candle or RawHistoricalCandle
  errorType: 'OHLC_INVALID' | 'OHLC_BACKWARDS' | 'PRICE_INVALID' | 'TIMESTAMP_INVALID' | 'TIMEZONE_UNKNOWN' | 'DUPLICATE' | 'OUT_OF_ORDER' | 'MISSING_INTERVAL' | 'SESSION_BOUNDARY' | 'CROSS_SYMBOL' | 'CROSS_TIMEFRAME' | 'OTHER';
  message: string;
  severity: 'WARNING' | 'ERROR'; // WARN = can continue, ERROR = reject batch
}

/**
 * Result of validating a candle
 */
export interface CandleValidationResult {
  valid: boolean;
  errors: DataValidationError[];
  warnings: DataValidationError[];
}

/**
 * Metadata about a historical dataset
 */
export interface DatasetManifest {
  datasetId: string; // e.g., "NIFTY_5M_2024_2026"
  source: string; // e.g., "angel-one", "csv-export", "user-provided"
  sourceVersion?: string;
  instrument: string; // e.g., "NIFTY"
  timeframe: string; // e.g., "5m"
  dateRange: {
    fromDateUTC: Date;
    toDateUTC: Date;
  };
  candleCount: number;
  timezone: string; // e.g., "UTC", "Asia/Kolkata"
  schema: {
    version: string;
    fields: string[];
  };
  validation: {
    status: 'PASSED' | 'WARNINGS' | 'FAILED';
    errorCount: number;
    warningCount: number;
    errors: DataValidationError[];
  };
  checksumSHA256: string; // of raw source data
  importedAtUTC: Date;
  normalizationVersion: string;
}

/**
 * Historical dataset ready for replay
 */
export interface NormalizedDataset {
  manifest: DatasetManifest;
  candles: Candle[];
}

/**
 * Replay event: recording setup observations during chronological iteration
 */
export interface ReplayEvent {
  asOfTimeUTC: Date;
  symbol: string;
  timeframe: string;
  candle: Candle;
  eventType: 'CANDLE_CLOSED';
}

/**
 * Configuration for historical data import
 *
 * Semantics:
 * - timezone: Timezone for interpreting timezone-naive source timestamps.
 *   IST naive: "2024-01-15 09:15:00" with timezone="Asia/Kolkata"
 *   becomes: 2024-01-15T03:45:00Z (UTC)
 *
 * - assumeKnowledgeTime: How to determine Candle.knowledgeTimeUTC
 *   closeTime: use close time of the candle (default)
 *   openTime: use open time of the candle (for high-frequency data)
 *   explicitField: use knowledgeTime field from source (must be present)
 */
export interface HistoricalImportConfig {
  source: string; // "csv" | "json" | "angel-one"
  timezone: string; // timezone for naive timestamps: "UTC" | "Asia/Kolkata" | etc.
  assumeKnowledgeTime: 'closeTime' | 'openTime' | 'explicitField'; // how to assign knowledgeTimeUTC
  strictValidation: boolean; // fail on any error, or warn and continue
  allowGaps: boolean; // whether to allow missing intervals
  exchangeCalendarPath?: string; // path to exchange holiday calendar (optional)
}

/**
 * Convert RawHistoricalCandle to Candle (domain model)
 *
 * Handles timezone-aware parsing and knowledge-time configuration.
 */
export function rawToCandleModel(
  raw: RawHistoricalCandle,
  config: HistoricalImportConfig,
): { candle: Candle | null; errors: DataValidationError[] } {
  const errors: DataValidationError[] = [];

  // Import timezone parser (avoid circular dependency)
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const { parseTimestampUTC } = require('./timestamp-parser');

  // Parse timestamps with timezone awareness
  const openResult = parseTimestampUTC(raw.openTime, config.timezone);
  if (openResult.error) {
    errors.push({
      ...openResult.error,
      message: `openTime: ${openResult.error.message}`,
    });
  }

  const closeResult = parseTimestampUTC(raw.closeTime, config.timezone);
  if (closeResult.error) {
    errors.push({
      ...closeResult.error,
      message: `closeTime: ${closeResult.error.message}`,
    });
  }

  if (errors.length > 0) {
    return { candle: null, errors };
  }

  const openTimeUTC = openResult.date!;
  const closeTimeUTC = closeResult.date!;

  // Validate OHLC
  const ohlc: CandleOHLC = {
    open: raw.open,
    high: raw.high,
    low: raw.low,
    close: raw.close,
    volume: raw.volume ?? 0,
  };

  if (ohlc.open <= 0 || ohlc.high <= 0 || ohlc.low <= 0 || ohlc.close <= 0) {
    errors.push({
      errorType: 'PRICE_INVALID',
      message: `Non-positive price: O:${ohlc.open} H:${ohlc.high} L:${ohlc.low} C:${ohlc.close}`,
      severity: 'ERROR',
    });
  }

  if (ohlc.high < ohlc.open || ohlc.high < ohlc.close || ohlc.high < ohlc.low) {
    errors.push({
      errorType: 'OHLC_BACKWARDS',
      message: `High is not the maximum: H:${ohlc.high} vs O:${ohlc.open} L:${ohlc.low} C:${ohlc.close}`,
      severity: 'ERROR',
    });
  }

  if (ohlc.low > ohlc.open || ohlc.low > ohlc.close) {
    errors.push({
      errorType: 'OHLC_BACKWARDS',
      message: `Low is not the minimum: L:${ohlc.low} vs O:${ohlc.open} C:${ohlc.close}`,
      severity: 'ERROR',
    });
  }

  if (errors.length > 0) {
    return { candle: null, errors };
  }

  // Parse timeframe
  let timeframe: Timeframe;
  try {
    timeframe = Timeframe.from(raw.timeframe);
  } catch (e) {
    errors.push({
      errorType: 'OTHER',
      message: `Invalid timeframe: ${raw.timeframe}`,
      severity: 'ERROR',
    });
    return { candle: null, errors };
  }

  // Assign knowledge time based on config (ACTUALLY USE THE CONFIG!)
  let knowledgeTimeUTC: Date;

  if (config.assumeKnowledgeTime === 'openTime') {
    knowledgeTimeUTC = openTimeUTC;
  } else if (config.assumeKnowledgeTime === 'explicitField') {
    if (!raw.knowledgeTime) {
      errors.push({
        errorType: 'OTHER',
        message: 'Config requires explicitField but raw candle has no knowledgeTime',
        severity: 'ERROR',
      });
      return { candle: null, errors };
    }

    const knowledgeResult = parseTimestampUTC(raw.knowledgeTime, config.timezone);
    if (knowledgeResult.error) {
      errors.push({
        ...knowledgeResult.error,
        message: `knowledgeTime: ${knowledgeResult.error.message}`,
      });
      return { candle: null, errors };
    }
    knowledgeTimeUTC = knowledgeResult.date!;
  } else {
    // Default: closeTime
    knowledgeTimeUTC = closeTimeUTC;
  }

  // Verify: knowledge-time must be >= close-time (cannot know before candle closes)
  // Exception: openTime mode explicitly sets knowledge to open, which precedes close
  if (config.assumeKnowledgeTime !== 'openTime' && knowledgeTimeUTC < closeTimeUTC) {
    errors.push({
      errorType: 'TIMESTAMP_INVALID',
      message: `knowledgeTimeUTC (${knowledgeTimeUTC.toISOString()}) cannot be before closeTimeUTC (${closeTimeUTC.toISOString()})`,
      severity: 'ERROR',
    });
    return { candle: null, errors };
  }

  // Create candle
  const candle = new Candle(
    raw.symbol,
    timeframe,
    openTimeUTC,
    closeTimeUTC,
    ohlc,
    CandleStatus.CLOSED,
    knowledgeTimeUTC,
  );

  return { candle, errors };
}
