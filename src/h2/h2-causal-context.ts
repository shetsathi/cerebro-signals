/**
 * H2 CAUSAL CONTEXT BUILDER
 *
 * Creates immutable causal contexts for each evaluation.
 * Each context is tied to a specific asOfTime.
 * No T+1 data can be accessed with a context created for time T.
 *
 * Every evaluation must have exactly one CausalContext.
 */

import { CausalContext, CausalityViolationError } from './h2-contracts';

/**
 * Builder for creating immutable causal contexts
 *
 * Ensures:
 * - asOfTimeUTC is set and immutable
 * - dataset identity is captured (id + checksum)
 * - symbol and timeframe match dataset
 * - context cannot be modified after creation
 */
export class CausalContextBuilder {
  private context: CausalContext | null = null;
  private frozen = false;

  setAsOfTime(asOfTimeUTC: Date): this {
    if (this.frozen) throw new Error('CausalContext already frozen, cannot modify');
    if (!this.context) this.context = { ...({} as CausalContext) };
    this.context.asOfTimeUTC = new Date(asOfTimeUTC); // defensive copy
    return this;
  }

  setDatasetIdentity(datasetId: string, checksum: string): this {
    if (this.frozen) throw new Error('CausalContext already frozen, cannot modify');
    if (!this.context) this.context = { ...({} as CausalContext) };
    this.context.datasetId = datasetId;
    this.context.datasetChecksum = checksum;
    return this;
  }

  setSymbolAndTimeframe(symbol: string, timeframe: string): this {
    if (this.frozen) throw new Error('CausalContext already frozen, cannot modify');
    if (!this.context) this.context = { ...({} as CausalContext) };
    this.context.symbol = symbol;
    this.context.timeframe = timeframe;
    return this;
  }

  setDatasetManifestPath(path: string): this {
    if (this.frozen) throw new Error('CausalContext already frozen, cannot modify');
    if (!this.context) this.context = { ...({} as CausalContext) };
    this.context.datasetManifestPath = path;
    return this;
  }

  /**
   * Freeze and return immutable context
   *
   * After freeze(), no further modifications allowed.
   * Context is ready for evaluation.
   */
  build(): CausalContext {
    if (!this.context) {
      throw new Error('CausalContext incomplete: missing required fields');
    }

    const required = ['asOfTimeUTC', 'datasetId', 'datasetChecksum', 'symbol', 'timeframe'];
    for (const field of required) {
      if (!this.context[field as keyof CausalContext]) {
        throw new Error(`CausalContext incomplete: missing ${field}`);
      }
    }

    this.frozen = true;
    return Object.freeze(this.context) as CausalContext;
  }
}

/**
 * Guard that verifies an input timestamp is causally valid for a context
 *
 * Throws CausalityViolationError if input is from the future relative to asOfTime.
 */
export function guardCausality(
  context: CausalContext,
  inputTimestamp: Date,
  dataDescription: string,
): void {
  if (inputTimestamp > context.asOfTimeUTC) {
    throw new CausalityViolationError(context.asOfTimeUTC, inputTimestamp, dataDescription);
  }
}

/**
 * Guard that verifies multiple input timestamps are causally valid
 *
 * Returns results of causality check.
 * Does not throw; allows caller to decide how to handle violations.
 */
export function checkCausality(
  context: CausalContext,
  inputTimestamps: Date[],
): { valid: boolean; violations: Date[] } {
  const violations: Date[] = [];

  for (const ts of inputTimestamps) {
    if (ts > context.asOfTimeUTC) {
      violations.push(ts);
    }
  }

  return {
    valid: violations.length === 0,
    violations,
  };
}

/**
 * Guard that verifies a candle set does not contain future data relative to asOfTime.
 *
 * Accepts domain Candle objects (closeTimeUTC) or raw objects with a date string.
 * Ensures no T+1, T+2, etc. candles were accidentally loaded.
 */
export function guardNoCandlesBeyond(
  context: CausalContext,
  candles: Array<{ closeTimeUTC: Date } | { date: string }>,
): void {
  for (const candle of candles) {
    const candleTime =
      'closeTimeUTC' in candle ? candle.closeTimeUTC : new Date((candle as { date: string }).date);
    if (candleTime > context.asOfTimeUTC) {
      const label =
        'closeTimeUTC' in candle
          ? `Candle closeTimeUTC from future: ${(candle as { closeTimeUTC: Date }).closeTimeUTC.toISOString()}`
          : `Candle loaded from future: ${(candle as { date: string }).date}`;
      throw new CausalityViolationError(context.asOfTimeUTC, candleTime, label);
    }
  }
}

/**
 * Context identity verification
 *
 * Verify that a context matches expected dataset identity.
 * Prevents accidental use of wrong context with right timestamp.
 */
export function verifyContextIdentity(
  context: CausalContext,
  expectedDatasetId: string,
  expectedSymbol: string,
  expectedTimeframe: string,
): { valid: boolean; errors: string[] } {
  const errors: string[] = [];

  if (context.datasetId !== expectedDatasetId) {
    errors.push(`Dataset ID mismatch: expected ${expectedDatasetId}, got ${context.datasetId}`);
  }

  if (context.symbol !== expectedSymbol) {
    errors.push(`Symbol mismatch: expected ${expectedSymbol}, got ${context.symbol}`);
  }

  if (context.timeframe !== expectedTimeframe) {
    errors.push(`Timeframe mismatch: expected ${expectedTimeframe}, got ${context.timeframe}`);
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}

/**
 * Immutable context snapshot for recording with evaluation results
 *
 * Captures the exact context used for an evaluation.
 * Useful for debugging and determinism verification.
 */
export function snapshotContext(context: CausalContext): Readonly<CausalContext> {
  return Object.freeze({
    asOfTimeUTC: new Date(context.asOfTimeUTC),
    datasetId: context.datasetId,
    datasetChecksum: context.datasetChecksum,
    symbol: context.symbol,
    timeframe: context.timeframe,
    datasetManifestPath: context.datasetManifestPath,
  });
}
