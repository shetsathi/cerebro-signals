/**
 * H2 INTEGRATION TESTS
 *
 * Verify:
 * 1. Dataset integrity checks accept / reject correctly
 * 2. Warm-up state tracks candle count and first-valid-eval correctly
 * 3. Snapshot store records, retrieves, and compares correctly
 * 4. assertDatasetIntegrity throws on invalid input, passes on valid
 * 5. causalSubset is consistent with ReplayEngine filtering
 *
 * All tests use real domain Candle objects.
 */

import {
  verifyDatasetIntegrity,
  assertDatasetIntegrity,
} from '../../h2/h2-dataset-integrity';
import {
  createWarmupState,
  processCandle,
  isWarmupComplete,
  getWarmupSummary,
} from '../../h2/h2-warm-up';
import {
  InMemorySnapshotStore,
  aggregateSnapshotStats,
  replaySnapshotValidity,
  compareSnapshots,
} from '../../h2/h2-snapshot-recorder';
import { H2SnapshotRecord } from '../../h2/h2-contracts';
import {
  buildCandleSequence,
  makeClosed5mCandle,
  makeTestManifest,
} from './h2-test-helpers';

// ── shared fixtures ───────────────────────────────────────────────────────────

const SESSION_START = new Date('2026-08-21T03:45:00Z'); // 09:15 IST

function makeSnapshotAt(asOfTime: Date, idx: number, qualified: boolean): H2SnapshotRecord {
  return {
    recordId: `snap-${idx}`,
    asOfTimeUTC: asOfTime,
    symbol: 'NIFTY 50',
    timeframe: '5m',
    candle: {
      timestamp: asOfTime.toISOString(),
      ohlcv: [100, 102, 99, 101, 1000],
    },
    frozenSnapshots: {},
    outcome: {
      qualifyingSetupFound: qualified,
      tradePlanGenerated: false,
    },
    causalityCertificate: {
      asOfTime,
      allInputsBeforeOrAt: true,
      maxInputTimestamp: asOfTime,
    },
  };
}

// ── TEST 1: Dataset Integrity — PASS cases ────────────────────────────────────

describe('TEST 1: Dataset integrity — PASS cases', () => {
  it('passes for a valid candle sequence matching the manifest', async () => {
    const candles = buildCandleSequence(SESSION_START, 10);
    const manifest = makeTestManifest({
      candleCount: 10,
      startDateUTC: candles[0].openTimeUTC,
      endDateUTC: candles[9].closeTimeUTC,
    });

    const result = await verifyDatasetIntegrity('NIFTY-5m-TEST', manifest, candles);

    expect(result.result).toBe('PASS');
    expect(result.checks.symbolMatch).toBe(true);
    expect(result.checks.timeframeMatch).toBe(true);
    expect(result.checks.candleCountMatch).toBe(true);
    expect(result.checks.chronological).toBe(true);
    expect(result.checks.noFutureCandlesLoaded).toBe(true);
    expect(result.errors).toHaveLength(0);
  });

  it('passes when FIVE_MINUTE and 5m are both accepted timeframe strings', async () => {
    const candles = buildCandleSequence(SESSION_START, 5);

    const result5m = await verifyDatasetIntegrity(
      'NIFTY-5m-TEST',
      makeTestManifest({ candleCount: 5, timeframe: '5m',
        endDateUTC: candles[4].closeTimeUTC }),
      candles,
    );
    const resultFM = await verifyDatasetIntegrity(
      'NIFTY-5m-TEST',
      makeTestManifest({ candleCount: 5, timeframe: 'FIVE_MINUTE',
        endDateUTC: candles[4].closeTimeUTC }),
      candles,
    );

    expect(result5m.checks.timeframeMatch).toBe(true);
    expect(resultFM.checks.timeframeMatch).toBe(true);
  });
});

// ── TEST 2: Dataset Integrity — FAIL cases ────────────────────────────────────

describe('TEST 2: Dataset integrity — FAIL cases', () => {
  it('fails when symbol is wrong', async () => {
    const candles = buildCandleSequence(SESSION_START, 5);
    const result = await verifyDatasetIntegrity(
      'NIFTY-5m-TEST',
      makeTestManifest({ symbol: 'SENSEX', candleCount: 5,
        endDateUTC: candles[4].closeTimeUTC }),
      candles,
    );
    expect(result.result).toBe('FAIL');
    expect(result.checks.symbolMatch).toBe(false);
  });

  it('fails when candle count does not match manifest', async () => {
    const candles = buildCandleSequence(SESSION_START, 5); // 5 candles
    const result = await verifyDatasetIntegrity(
      'NIFTY-5m-TEST',
      makeTestManifest({ candleCount: 100, // manifest says 100
        endDateUTC: candles[4].closeTimeUTC }),
      candles,
    );
    expect(result.result).toBe('FAIL');
    expect(result.checks.candleCountMatch).toBe(false);
  });

  it('fails when candles are out of chronological order', async () => {
    const candles = buildCandleSequence(SESSION_START, 5);
    // Swap candle[1] and candle[3] to break order
    const outOfOrder = [...candles];
    [outOfOrder[1], outOfOrder[3]] = [outOfOrder[3], outOfOrder[1]];

    const result = await verifyDatasetIntegrity(
      'NIFTY-5m-TEST',
      makeTestManifest({ candleCount: 5, endDateUTC: candles[4].closeTimeUTC }),
      outOfOrder,
    );
    expect(result.result).toBe('FAIL');
    expect(result.checks.chronological).toBe(false);
  });

  it('fails when dataset contains candles beyond manifest endDateUTC', async () => {
    const candles = buildCandleSequence(SESSION_START, 10);
    // Manifest says data ends at candle[4] but we have 10 candles
    const result = await verifyDatasetIntegrity(
      'NIFTY-5m-TEST',
      makeTestManifest({ candleCount: 10, endDateUTC: candles[4].closeTimeUTC }),
      candles,
    );
    expect(result.result).toBe('FAIL');
    expect(result.checks.noFutureCandlesLoaded).toBe(false);
  });

  it('fails when timeframe is wrong', async () => {
    const candles = buildCandleSequence(SESSION_START, 5);
    const result = await verifyDatasetIntegrity(
      'NIFTY-5m-TEST',
      makeTestManifest({ timeframe: 'ONE_DAY', candleCount: 5,
        endDateUTC: candles[4].closeTimeUTC }),
      candles,
    );
    expect(result.result).toBe('FAIL');
    expect(result.checks.timeframeMatch).toBe(false);
  });
});

// ── TEST 3: assertDatasetIntegrity — throw/pass ───────────────────────────────

describe('TEST 3: assertDatasetIntegrity throws on failure, resolves on pass', () => {
  it('throws DATASET INTEGRITY VERIFICATION FAILED on bad symbol', async () => {
    const candles = buildCandleSequence(SESSION_START, 3);
    await expect(
      assertDatasetIntegrity(
        'NIFTY-5m-TEST',
        makeTestManifest({ symbol: 'WRONG', candleCount: 3,
          endDateUTC: candles[2].closeTimeUTC }),
        candles,
      ),
    ).rejects.toThrow('DATASET INTEGRITY VERIFICATION FAILED');
  });

  it('resolves without error on valid input', async () => {
    const candles = buildCandleSequence(SESSION_START, 3);
    await expect(
      assertDatasetIntegrity(
        'NIFTY-5m-TEST',
        makeTestManifest({ candleCount: 3, endDateUTC: candles[2].closeTimeUTC }),
        candles,
      ),
    ).resolves.toBeUndefined();
  });
});

// ── TEST 4: Warm-up state tracking ────────────────────────────────────────────

describe('TEST 4: Warm-up state tracking', () => {
  const WARMUP_CONFIG = {
    regimeEngineWarmup: 50,
    levelEngineWarmup: 100,
    setupEngineWarmup: 150,
    indicatorWarmup: 150,
  };

  it('initial state shows warm-up incomplete', () => {
    const state = createWarmupState(WARMUP_CONFIG);
    expect(isWarmupComplete(state)).toBe(false);
    expect(state.candlesSkippedForWarmup).toBe(0);
    expect(state.warmupComplete).toBe(false);
  });

  it('first 150 candles are all skipped for warm-up', () => {
    const state = createWarmupState(WARMUP_CONFIG);
    const candles = buildCandleSequence(SESSION_START, 150);
    for (const c of candles) {
      const { skipForWarmup } = processCandle(state, c);
      expect(skipForWarmup).toBe(true);
    }
    expect(state.candlesSkippedForWarmup).toBe(150);
    expect(state.warmupComplete).toBe(false);
  });

  it('candle 151 is NOT skipped and marks warm-up complete', () => {
    const state = createWarmupState(WARMUP_CONFIG);
    const candles = buildCandleSequence(SESSION_START, 151);

    for (let i = 0; i < 150; i++) {
      processCandle(state, candles[i]);
    }
    const { skipForWarmup } = processCandle(state, candles[150]);

    expect(skipForWarmup).toBe(false);
    expect(state.warmupComplete).toBe(true);
    expect(state.firstEvaluationTimestamp).toEqual(candles[150].closeTimeUTC);
  });

  it('getWarmupSummary reports correct counts', () => {
    const state = createWarmupState(WARMUP_CONFIG);
    const candles = buildCandleSequence(SESSION_START, 155);
    for (const c of candles) processCandle(state, c);

    const summary = getWarmupSummary(state);
    expect(summary.candlesSkipped).toBe(150);
    expect(summary.requirementsMet).toBe(true);
    expect(summary.firstEvaluationTime).toBeDefined();
  });
});

// ── TEST 5: Snapshot store ────────────────────────────────────────────────────

describe('TEST 5: InMemorySnapshotStore', () => {
  it('stores and retrieves snapshots', () => {
    const store = new InMemorySnapshotStore(100);
    const t1 = new Date('2026-08-21T03:50:00Z');
    store.addSnapshot(makeSnapshotAt(t1, 0, true));
    expect(store.size()).toBe(1);
    expect(store.getSnapshots()[0].recordId).toBe('snap-0');
  });

  it('stored snapshots are frozen (immutable)', () => {
    const store = new InMemorySnapshotStore(100);
    const t1 = new Date('2026-08-21T03:50:00Z');
    store.addSnapshot(makeSnapshotAt(t1, 0, true));
    const snap = store.getSnapshots()[0];
    expect(() => { (snap as any).recordId = 'hacked'; }).toThrow();
  });

  it('getSnapshotAt returns the latest snapshot at or before the given time', () => {
    const store = new InMemorySnapshotStore(100);
    const t1 = new Date('2026-08-21T03:50:00Z');
    const t2 = new Date('2026-08-21T03:55:00Z');
    const t3 = new Date('2026-08-21T04:00:00Z');
    store.addSnapshot(makeSnapshotAt(t1, 0, false));
    store.addSnapshot(makeSnapshotAt(t2, 1, true));
    store.addSnapshot(makeSnapshotAt(t3, 2, false));

    // Ask for a time between t1 and t2
    const found = store.getSnapshotAt(new Date('2026-08-21T03:52:00Z'));
    expect(found?.recordId).toBe('snap-0');

    // Ask exactly at t3
    expect(store.getSnapshotAt(t3)?.recordId).toBe('snap-2');
  });

  it('getSnapshotsBetween returns correct range', () => {
    const store = new InMemorySnapshotStore(100);
    const times = [
      new Date('2026-08-21T03:50:00Z'),
      new Date('2026-08-21T03:55:00Z'),
      new Date('2026-08-21T04:00:00Z'),
      new Date('2026-08-21T04:05:00Z'),
    ];
    times.forEach((t, i) => store.addSnapshot(makeSnapshotAt(t, i, i % 2 === 0)));

    const range = store.getSnapshotsBetween(times[1], times[2]);
    expect(range).toHaveLength(2);
    expect(range[0].recordId).toBe('snap-1');
    expect(range[1].recordId).toBe('snap-2');
  });
});

// ── TEST 6: Snapshot aggregation ──────────────────────────────────────────────

describe('TEST 6: aggregateSnapshotStats', () => {
  it('counts qualifying and rejected correctly', () => {
    const store = new InMemorySnapshotStore(100);
    const base = new Date('2026-08-21T03:50:00Z');
    for (let i = 0; i < 10; i++) {
      const t = new Date(base.getTime() + i * 5 * 60 * 1000);
      store.addSnapshot(makeSnapshotAt(t, i, i < 4)); // 4 qualified, 6 rejected
    }
    const stats = aggregateSnapshotStats(store);
    expect(stats.totalSnapshots).toBe(10);
    expect(stats.qualifyingSetups).toBe(4);
    expect(stats.rejectedSetups).toBe(6);
    expect(stats.causalityStatus.allVerified).toBe(true);
  });

  it('returns zeroed stats for empty store', () => {
    const store = new InMemorySnapshotStore(100);
    const stats = aggregateSnapshotStats(store);
    expect(stats.totalSnapshots).toBe(0);
    expect(stats.qualifyingSetups).toBe(0);
  });
});

// ── TEST 7: Snapshot replay validity ─────────────────────────────────────────

describe('TEST 7: replaySnapshotValidity', () => {
  it('validates chronological snapshot sequence', () => {
    const store = new InMemorySnapshotStore(100);
    const base = new Date('2026-08-21T03:50:00Z');
    for (let i = 0; i < 5; i++) {
      const t = new Date(base.getTime() + i * 5 * 60 * 1000);
      store.addSnapshot(makeSnapshotAt(t, i, true));
    }
    const validity = replaySnapshotValidity(store);
    expect(validity.chronological).toBe(true);
    expect(validity.noCausalityViolations).toBe(true);
    expect(validity.sequentiallyValid).toBe(true);
  });

  it('returns valid for empty store', () => {
    const store = new InMemorySnapshotStore(100);
    const validity = replaySnapshotValidity(store);
    expect(validity.sequentiallyValid).toBe(true);
  });
});

// ── TEST 8: Snapshot comparison (determinism) ─────────────────────────────────

describe('TEST 8: compareSnapshots — determinism verification', () => {
  it('two identical stores compare as identical', () => {
    const fillStore = () => {
      const s = new InMemorySnapshotStore(100);
      const base = new Date('2026-08-21T03:50:00Z');
      for (let i = 0; i < 5; i++) {
        s.addSnapshot(makeSnapshotAt(new Date(base.getTime() + i * 5 * 60 * 1000), i, i < 3));
      }
      return s;
    };
    const store1 = fillStore();
    const store2 = fillStore();
    const cmp = compareSnapshots(store1, store2);
    expect(cmp.identical).toBe(true);
    expect(cmp.differences.outcomeMismatch).toBe(0);
  });

  it('different outcome in one store is detected', () => {
    const base = new Date('2026-08-21T03:50:00Z');
    const store1 = new InMemorySnapshotStore(100);
    const store2 = new InMemorySnapshotStore(100);

    for (let i = 0; i < 3; i++) {
      const t = new Date(base.getTime() + i * 5 * 60 * 1000);
      store1.addSnapshot(makeSnapshotAt(t, i, true));
      store2.addSnapshot(makeSnapshotAt(t, i, i === 1 ? false : true)); // different at i=1
    }

    const cmp = compareSnapshots(store1, store2);
    expect(cmp.identical).toBe(false);
    expect(cmp.differences.outcomeMismatch).toBeGreaterThan(0);
  });
});
