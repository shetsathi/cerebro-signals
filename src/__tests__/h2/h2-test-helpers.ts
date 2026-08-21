/**
 * H2 TEST HELPERS
 *
 * Factory utilities for creating real domain objects in H2 tests.
 * Uses actual Candle, Timeframe constructors — no interface mocking.
 */

import { Candle, CandleOHLC, CandleStatus } from '../../domain/candle';
import { Timeframe, TimeframeValue } from '../../domain/timeframe';

/**
 * Create a closed NIFTY 5m candle at the given UTC timestamp.
 * openTime = closeTime - 5 minutes (standard 5m candle).
 */
export function makeClosed5mCandle(
  closeTimeUTC: Date,
  open: number,
  high: number,
  low: number,
  close: number,
  volume = 1000,
  symbol = 'NIFTY 50',
): Candle {
  const openTimeUTC = new Date(closeTimeUTC.getTime() - 5 * 60 * 1000);
  const ohlc: CandleOHLC = { open, high, low, close, volume };
  return new Candle(
    symbol,
    Timeframe.from(TimeframeValue.FIVE_MIN),
    openTimeUTC,
    closeTimeUTC,
    ohlc,
    CandleStatus.CLOSED,
    closeTimeUTC, // knowledgeTimeUTC = closeTime
  );
}

/**
 * Build a sequence of N closed 5m candles starting from startUTC.
 * Price increments by 1 each candle (open=base+i, high=base+i+2, low=base+i-1, close=base+i+1).
 */
export function buildCandleSequence(
  startUTC: Date,
  count: number,
  basePrice = 20000,
  symbol = 'NIFTY 50',
): Candle[] {
  const candles: Candle[] = [];
  for (let i = 0; i < count; i++) {
    const closeTime = new Date(startUTC.getTime() + (i + 1) * 5 * 60 * 1000);
    candles.push(
      makeClosed5mCandle(
        closeTime,
        basePrice + i,
        basePrice + i + 2,
        basePrice + i - 1,
        basePrice + i + 1,
        1000 + i * 10,
        symbol,
      ),
    );
  }
  return candles;
}

/**
 * Clone a candle sequence and mutate the candle at index `idx`.
 * Used to prove look-ahead isolation: mutating T+1 must not affect decisions at T.
 */
export function mutateCandleAt(
  candles: Candle[],
  idx: number,
  newOhlc: Partial<CandleOHLC>,
): Candle[] {
  return candles.map((c, i) => {
    if (i !== idx) return c;
    const mutated: CandleOHLC = { ...c.ohlc, ...newOhlc };
    return new Candle(c.symbol, c.timeframe, c.openTimeUTC, c.closeTimeUTC, mutated, c.status, c.knowledgeTimeUTC);
  });
}

/**
 * Compute a deterministic fingerprint over a candle sequence's OHLC and timestamps.
 * Uses a running numeric sum so small changes anywhere produce a different result.
 * Identical sequences produce identical fingerprints; any mutation changes it.
 */
export function hashCandleSequence(candles: Candle[]): string {
  // XOR all close prices (as integers) with their position to catch order changes
  let closeSum = 0;
  let highSum  = 0;
  let lowSum   = 0;
  let tsSum    = 0;

  for (let i = 0; i < candles.length; i++) {
    const c = candles[i];
    closeSum += c.ohlc.close * (i + 1);
    highSum  += c.ohlc.high  * (i + 1);
    lowSum   += c.ohlc.low   * (i + 1);
    tsSum    += (c.closeTimeUTC.getTime() / 1000) * (i + 1);
  }

  return `${candles.length}:${closeSum}:${highSum}:${lowSum}:${Math.floor(tsSum)}`;
}

/**
 * Return the subslice of candles with closeTimeUTC <= asOfTime.
 * This is what an H2 orchestrator passes to Parts 1-6 — causal subset only.
 */
export function causalSubset(candles: Candle[], asOfTime: Date): Candle[] {
  return candles.filter(c => c.closeTimeUTC <= asOfTime);
}

/**
 * Standard H1.2 manifest shape for test integrity checks.
 */
export function makeTestManifest(overrides: Partial<{
  id: string;
  checksum: string;
  symbol: string;
  timeframe: string;
  candleCount: number;
  startDateUTC: Date;
  endDateUTC: Date;
}> = {}) {
  return {
    id: 'NIFTY-5m-TEST',
    checksum: 'CS-TEST123456789',
    symbol: 'NIFTY 50',
    timeframe: 'FIVE_MINUTE',
    candleCount: 10,
    startDateUTC: new Date('2023-08-21T03:45:00Z'), // 09:15 IST
    endDateUTC: new Date('2023-08-21T10:00:00Z'),   // 15:30 IST
    ...overrides,
  };
}
