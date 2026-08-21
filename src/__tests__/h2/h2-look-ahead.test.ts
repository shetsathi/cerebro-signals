/**
 * H2 LOOK-AHEAD TESTS
 *
 * Prove causality through EXECUTABLE mutation tests.
 * These are behavioral proofs, not structural inspections.
 *
 * Every test manipulates real domain objects and asserts that
 * decisions made at time T are unaffected by changes at T+1…T+N.
 */

import { CausalityViolationError } from '../../h2/h2-contracts';
import { CausalContextBuilder, guardCausality, checkCausality, guardNoCandlesBeyond } from '../../h2/h2-causal-context';
import {
  buildCandleSequence,
  makeClosed5mCandle,
  mutateCandleAt,
  causalSubset,
  hashCandleSequence,
} from './h2-test-helpers';

// ── shared fixtures ──────────────────────────────────────────────────────────

const T0 = new Date('2026-08-21T03:45:00Z'); // 09:15 IST — session open

// Build 20 consecutive 5m candles (T+1 … T+20)
const BASE_CANDLES = buildCandleSequence(T0, 20);
// candle[0].closeTimeUTC = T0 + 5min (09:20 IST)
// candle[9].closeTimeUTC = T0 + 50min (10:05 IST)

// ── helpers ──────────────────────────────────────────────────────────────────

function buildContext(asOfTime: Date) {
  return new CausalContextBuilder()
    .setAsOfTime(asOfTime)
    .setDatasetIdentity('NIFTY-5m-TEST', 'checksum-abc')
    .setSymbolAndTimeframe('NIFTY 50', '5m')
    .build();
}

// Simulate what H2 passes to Parts 1-6: all candles up to and including asOfTime
function subsetUpTo(asOfTime: Date) {
  return causalSubset(BASE_CANDLES, asOfTime);
}

// ── TEST 1: causal guard — allows current and past ──────────────────────────

describe('TEST 1: CausalContext guard — access rules', () => {
  it('allows access to the current candle (T == asOfTime)', () => {
    const current = BASE_CANDLES[4]; // candle 5
    const ctx = buildContext(current.closeTimeUTC);
    expect(() =>
      guardCausality(ctx, current.closeTimeUTC, 'current candle'),
    ).not.toThrow();
  });

  it('allows access to past candles (T-k)', () => {
    const current = BASE_CANDLES[9]; // candle 10
    const past    = BASE_CANDLES[3]; // candle 4
    const ctx = buildContext(current.closeTimeUTC);
    expect(() =>
      guardCausality(ctx, past.closeTimeUTC, 'past candle'),
    ).not.toThrow();
  });

  it('throws CausalityViolationError when accessing T+1 candle', () => {
    const current = BASE_CANDLES[4];
    const next    = BASE_CANDLES[5]; // T+1
    const ctx = buildContext(current.closeTimeUTC);
    expect(() =>
      guardCausality(ctx, next.closeTimeUTC, 'T+1 candle'),
    ).toThrow(CausalityViolationError);
  });

  it('throws CausalityViolationError when accessing T+5 candle', () => {
    const current = BASE_CANDLES[4];
    const future  = BASE_CANDLES[9]; // T+5
    const ctx = buildContext(current.closeTimeUTC);
    expect(() =>
      guardCausality(ctx, future.closeTimeUTC, 'T+5 candle'),
    ).toThrow(CausalityViolationError);
  });

  it('throws on 1 ms in the future', () => {
    const current = BASE_CANDLES[4];
    const ctx = buildContext(current.closeTimeUTC);
    const oneMsLater = new Date(current.closeTimeUTC.getTime() + 1);
    expect(() =>
      guardCausality(ctx, oneMsLater, '+1ms'),
    ).toThrow(CausalityViolationError);
  });

  it('allows access at exact asOfTime (boundary inclusive)', () => {
    const current = BASE_CANDLES[4];
    const ctx = buildContext(current.closeTimeUTC);
    expect(() =>
      guardCausality(ctx, current.closeTimeUTC, 'exact boundary'),
    ).not.toThrow();
  });
});

// ── TEST 2: batch causality check ────────────────────────────────────────────

describe('TEST 2: Batch causality verification', () => {
  it('reports no violations for all-past inputs', () => {
    const ctx = buildContext(BASE_CANDLES[9].closeTimeUTC); // T=candle[9]
    const pastTimestamps = BASE_CANDLES.slice(0, 10).map(c => c.closeTimeUTC);
    const result = checkCausality(ctx, pastTimestamps);
    expect(result.valid).toBe(true);
    expect(result.violations).toHaveLength(0);
  });

  it('detects future timestamps in a batch', () => {
    const ctx = buildContext(BASE_CANDLES[4].closeTimeUTC); // T=candle[4]
    const mixed = [
      BASE_CANDLES[2].closeTimeUTC, // past — ok
      BASE_CANDLES[5].closeTimeUTC, // T+1 — violation
      BASE_CANDLES[7].closeTimeUTC, // T+3 — violation
    ];
    const result = checkCausality(ctx, mixed);
    expect(result.valid).toBe(false);
    expect(result.violations).toHaveLength(2);
  });
});

// ── TEST 3: guardNoCandlesBeyond ─────────────────────────────────────────────

describe('TEST 3: guardNoCandlesBeyond — rejects loaded future candles', () => {
  it('passes when all candles are at or before asOfTime', () => {
    const idx = 9;
    const ctx = buildContext(BASE_CANDLES[idx].closeTimeUTC);
    const safeSlice = BASE_CANDLES.slice(0, idx + 1);
    expect(() => guardNoCandlesBeyond(ctx, safeSlice)).not.toThrow();
  });

  it('throws when array contains a candle beyond asOfTime', () => {
    const ctx = buildContext(BASE_CANDLES[4].closeTimeUTC);
    const contaminated = BASE_CANDLES.slice(0, 7); // includes T+1, T+2
    expect(() => guardNoCandlesBeyond(ctx, contaminated)).toThrow(CausalityViolationError);
  });
});

// ── TEST 4: T+1 mutation — decision at T must not change ─────────────────────

describe('TEST 4: T+1 mutation — causal subset equality', () => {
  it('causal subset at T is identical before and after T+1 mutation', () => {
    const evalIdx = 9; // evaluate at candle[9]
    const asOfTime = BASE_CANDLES[evalIdx].closeTimeUTC;

    // Baseline: candles up to T
    const baseline = causalSubset(BASE_CANDLES, asOfTime);
    const baselineHash = hashCandleSequence(baseline);

    // Mutate T+1 candle (index 10) with dramatically different OHLC
    const mutated = mutateCandleAt(BASE_CANDLES, evalIdx + 1, {
      open: 99999,
      high: 999999,
      low:  1,
      close: 50000,
    });

    // Re-compute causal subset at same T — must be identical
    const afterMutation = causalSubset(mutated, asOfTime);
    const afterHash = hashCandleSequence(afterMutation);

    expect(afterHash).toBe(baselineHash);
    expect(afterMutation.length).toBe(baseline.length);
  });
});

// ── TEST 5: T+2…T+5 bulk mutation ────────────────────────────────────────────

describe('TEST 5: Future bulk mutation — all decisions before T unchanged', () => {
  it('causal subsets at every T are unchanged after T+2…T+5 mutations', () => {
    // Mutate candles at indices 12, 13, 14, 15
    let mutated = BASE_CANDLES;
    for (const idx of [12, 13, 14, 15]) {
      mutated = mutateCandleAt(mutated, idx, { open: 1, high: 2, low: 0.5, close: 1.5 });
    }

    // For every evaluation point at or before candle[11], baseline === mutated subset
    for (let evalIdx = 0; evalIdx <= 11; evalIdx++) {
      const asOfTime = BASE_CANDLES[evalIdx].closeTimeUTC;
      const baselineHash = hashCandleSequence(causalSubset(BASE_CANDLES, asOfTime));
      const mutatedHash  = hashCandleSequence(causalSubset(mutated, asOfTime));
      expect(mutatedHash).toBe(baselineHash);
    }
  });
});

// ── TEST 6: future high/low contamination ────────────────────────────────────

describe('TEST 6: Future high/low contamination test', () => {
  it('extreme future high does not appear in causal subset at T', () => {
    const evalIdx = 5;
    const asOfTime = BASE_CANDLES[evalIdx].closeTimeUTC;

    // Give candle T+3 an absurd high
    const mutated = mutateCandleAt(BASE_CANDLES, evalIdx + 3, { high: 1_000_000 });

    const baselineSubset = causalSubset(BASE_CANDLES, asOfTime);
    const mutatedSubset  = causalSubset(mutated, asOfTime);

    // Neither subset should contain candle T+3
    const maxHighBaseline = Math.max(...baselineSubset.map(c => c.ohlc.high));
    const maxHighMutated  = Math.max(...mutatedSubset.map(c => c.ohlc.high));

    expect(maxHighBaseline).toBeLessThan(1_000_000);
    expect(maxHighMutated).toBeLessThan(1_000_000);
    expect(maxHighMutated).toBe(maxHighBaseline);
  });

  it('extreme future low does not appear in causal subset at T', () => {
    const evalIdx = 5;
    const asOfTime = BASE_CANDLES[evalIdx].closeTimeUTC;

    const mutated = mutateCandleAt(BASE_CANDLES, evalIdx + 2, { low: -1_000_000 });

    const baselineSubset = causalSubset(BASE_CANDLES, asOfTime);
    const mutatedSubset  = causalSubset(mutated, asOfTime);

    const minLowBaseline = Math.min(...baselineSubset.map(c => c.ohlc.low));
    const minLowMutated  = Math.min(...mutatedSubset.map(c => c.ohlc.low));

    expect(minLowBaseline).toBeGreaterThan(-1_000_000);
    expect(minLowMutated).toBeGreaterThan(-1_000_000);
    expect(minLowMutated).toBe(minLowBaseline);
  });
});

// ── TEST 7: causality violation error details ─────────────────────────────────

describe('TEST 7: CausalityViolationError is informative', () => {
  it('includes evaluationTime, violatingTimestamp, and data description', () => {
    const evalTime      = new Date('2026-08-21T04:35:00Z');
    const violatingTime = new Date('2026-08-21T04:40:00Z');

    const err = new CausalityViolationError(evalTime, violatingTime, 'future close price');

    expect(err.name).toBe('CausalityViolationError');
    expect(err.message).toContain('CAUSALITY VIOLATION');
    expect(err.message).toContain(evalTime.toISOString());
    expect(err.message).toContain(violatingTime.toISOString());
    expect(err.message).toContain('future close price');
    expect(err.evaluationTime).toEqual(evalTime);
    expect(err.violatingTimestamp).toEqual(violatingTime);
  });
});

// ── TEST 8: context immutability ──────────────────────────────────────────────

describe('TEST 8: CausalContext is frozen after build()', () => {
  it('throws TypeError when attempting to mutate asOfTimeUTC', () => {
    const ctx = buildContext(BASE_CANDLES[5].closeTimeUTC);
    expect(() => {
      (ctx as any).asOfTimeUTC = new Date('2020-01-01T00:00:00Z');
    }).toThrow();
  });

  it('two contexts built at different times are independent', () => {
    const ctx1 = buildContext(BASE_CANDLES[3].closeTimeUTC);
    const ctx2 = buildContext(BASE_CANDLES[7].closeTimeUTC);
    expect(ctx1.asOfTimeUTC.getTime()).not.toBe(ctx2.asOfTimeUTC.getTime());
  });

  it('missing required field throws before build()', () => {
    const builder = new CausalContextBuilder()
      .setAsOfTime(new Date())
      // deliberately skip setDatasetIdentity
      .setSymbolAndTimeframe('NIFTY 50', '5m');
    expect(() => builder.build()).toThrow();
  });
});

// ── TEST 9: snapshot causality certificate ────────────────────────────────────

describe('TEST 9: Snapshot causality certificate', () => {
  it('causal subset timestamps are all <= asOfTime', () => {
    const evalIdx = 9;
    const asOfTime = BASE_CANDLES[evalIdx].closeTimeUTC;
    const subset = causalSubset(BASE_CANDLES, asOfTime);

    for (const c of subset) {
      expect(c.closeTimeUTC.getTime()).toBeLessThanOrEqual(asOfTime.getTime());
    }
  });

  it('future candles are excluded from subset', () => {
    const evalIdx = 5;
    const asOfTime = BASE_CANDLES[evalIdx].closeTimeUTC;
    const subset = causalSubset(BASE_CANDLES, asOfTime);

    // No subset candle should be beyond asOfTime
    const futureInSubset = subset.filter(c => c.closeTimeUTC > asOfTime);
    expect(futureInSubset).toHaveLength(0);
  });
});
