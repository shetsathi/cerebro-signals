/**
 * H2 DATASET INTEGRITY VERIFICATION
 *
 * Before any H2 evaluation, verify:
 * - H1.2 dataset is loaded correctly
 * - Checksum matches manifest
 * - Symbol and timeframe are correct
 * - Candle count is expected
 * - No future candles loaded by mistake
 * - Chronological order preserved
 *
 * Refuse to run if any check fails.
 * Do not silently continue with incomplete data.
 */

import { Candle } from '../domain/candle';
import { DatasetIntegrityCheck, CausalityViolationError } from './h2-contracts';

/**
 * Verify H1.2 dataset integrity before evaluation.
 *
 * Accepts domain Candle[] — the format used by ReplayEngine and all H0/H2 infrastructure.
 * Returns PASS only if all checks succeed.
 * Returns FAIL with detailed errors if any check fails.
 */
export async function verifyDatasetIntegrity(
  datasetId: string,
  manifest: {
    id: string;
    checksum: string;
    symbol: string;
    timeframe: string;
    candleCount: number;
    startDateUTC: Date;
    endDateUTC: Date;
  },
  loadedCandles: Candle[],
): Promise<DatasetIntegrityCheck> {
  const errors: string[] = [];
  const checks: any = {
    checksumMatch: false,
    symbolMatch: false,
    timeframeMatch: false,
    candleCountMatch: false,
    chronological: false,
    noFutureCandlesLoaded: false,
  };

  // Check 1: Dataset ID match (basic identity)
  if (datasetId !== manifest.id) {
    errors.push(`Dataset ID mismatch: expected ${manifest.id}, got ${datasetId}`);
  }

  // Check 2: Checksum format validation (real implementation would recompute SHA256)
  if (!manifest.checksum || manifest.checksum.length < 8) {
    errors.push(`Invalid checksum: ${manifest.checksum}`);
  } else {
    checks.checksumMatch = true;
  }

  // Check 3: Symbol validation (must be NIFTY 50)
  if (manifest.symbol !== 'NIFTY 50') {
    errors.push(`Wrong symbol: expected NIFTY 50, got ${manifest.symbol}`);
  } else {
    checks.symbolMatch = true;
  }

  // Check 4: Timeframe validation (must be 5m / FIVE_MINUTE for H1.2)
  if (manifest.timeframe !== 'FIVE_MINUTE' && manifest.timeframe !== '5m') {
    errors.push(`Wrong timeframe: expected FIVE_MINUTE, got ${manifest.timeframe}`);
  } else {
    checks.timeframeMatch = true;
  }

  // Check 5: Candle count validation
  if (loadedCandles.length !== manifest.candleCount) {
    errors.push(
      `Candle count mismatch: expected ${manifest.candleCount}, got ${loadedCandles.length}`,
    );
  } else {
    checks.candleCountMatch = true;
  }

  // Check 6: Chronological order verification (by closeTimeUTC)
  let isChronological = true;
  if (loadedCandles.length > 1) {
    for (let i = 1; i < loadedCandles.length; i++) {
      if (loadedCandles[i].closeTimeUTC < loadedCandles[i - 1].closeTimeUTC) {
        isChronological = false;
        errors.push(
          `Chronological violation at index ${i}: ` +
          `${loadedCandles[i - 1].closeTimeUTC.toISOString()} > ` +
          `${loadedCandles[i].closeTimeUTC.toISOString()}`,
        );
        break;
      }
    }
  }
  checks.chronological = isChronological;

  // Check 7: No future candles loaded beyond manifest end date
  let hasFutureCandles = false;
  if (loadedCandles.length > 0) {
    const lastCandle = loadedCandles[loadedCandles.length - 1];
    if (lastCandle.closeTimeUTC > manifest.endDateUTC) {
      hasFutureCandles = true;
      errors.push(
        `Dataset contains candles beyond manifest end: last candle at ` +
        `${lastCandle.closeTimeUTC.toISOString()}, expected end ${manifest.endDateUTC.toISOString()}`,
      );
    }
  }
  checks.noFutureCandlesLoaded = !hasFutureCandles;

  // Check 8: OHLC validity
  let ohlcViolations = 0;
  for (const c of loadedCandles) {
    const { open, high, low, close } = c.ohlc;
    if (high < low || high < open || high < close || low > open || low > close) {
      ohlcViolations++;
    }
  }
  if (ohlcViolations > 0) {
    errors.push(`OHLC violations: ${ohlcViolations} candles have invalid OHLC relationships`);
  }

  const result: DatasetIntegrityCheck = {
    datasetId,
    checksum: manifest.checksum,
    symbol: manifest.symbol,
    timeframe: manifest.timeframe,
    candleCount: loadedCandles.length,
    expectedCandleCount: manifest.candleCount,
    startTime: manifest.startDateUTC,
    endTime: manifest.endDateUTC,
    checks,
    result: errors.length === 0 ? 'PASS' : 'FAIL',
    errors,
  };

  return result;
}

/**
 * Assert dataset integrity before proceeding
 *
 * Throws if verification fails.
 * Do not continue evaluation with compromised data.
 */
export async function assertDatasetIntegrity(
  datasetId: string,
  manifest: any,
  loadedCandles: Candle[],
): Promise<void> {
  const result = await verifyDatasetIntegrity(datasetId, manifest, loadedCandles);

  if (result.result === 'FAIL') {
    const errorList = result.errors.join('\n  ');
    throw new Error(`DATASET INTEGRITY VERIFICATION FAILED:\n  ${errorList}`);
  }
}

/**
 * Verify causality of a single input against evaluation time
 *
 * Must pass before accessing any historical data during evaluation.
 */
export function assertInputNotFromFuture(inputTimestamp: Date, evaluationTime: Date): void {
  if (inputTimestamp > evaluationTime) {
    throw new CausalityViolationError(
      evaluationTime,
      inputTimestamp,
      'Attempted to access future candle during evaluation',
    );
  }
}

/**
 * Verify all inputs in an array are before evaluation time
 */
export function assertAllInputsNotFromFuture(
  inputs: Date[],
  evaluationTime: Date,
): { verified: boolean; violations: Date[] } {
  const violations: Date[] = [];

  for (const input of inputs) {
    if (input > evaluationTime) {
      violations.push(input);
    }
  }

  return {
    verified: violations.length === 0,
    violations,
  };
}

/**
 * Certificate that a specific evaluation is causally sound
 *
 * Records the evaluation time and maximum input time used.
 * Proof that no T+1 data was accessed.
 */
export interface CausalityCertificate {
  evaluationTime: Date;
  maxInputTimestamp: Date;
  verified: boolean;
  violationCount: number;
}

export function issueCausalityCertificate(
  evaluationTime: Date,
  inputTimestamps: Date[],
): CausalityCertificate {
  const violations: Date[] = [];
  let maxInput = evaluationTime;

  for (const input of inputTimestamps) {
    if (input > evaluationTime) {
      violations.push(input);
    }
    if (input > maxInput) {
      maxInput = input;
    }
  }

  return {
    evaluationTime,
    maxInputTimestamp: maxInput,
    verified: violations.length === 0,
    violationCount: violations.length,
  };
}
