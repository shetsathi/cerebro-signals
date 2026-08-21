#!/usr/bin/env tsx

/**
 * H2 PERFORMANCE BENCHMARK
 *
 * Measures H2 evaluation performance across dataset sizes
 * to quantify complexity and scaling behavior.
 */

import { LocalFileRepository } from '../historical/local-file-repository';
import { ReplayEngine, ReplayConfig } from '../historical/replay-engine';
import { H2Orchestrator } from '../h2/h2-orchestrator';
import { createWarmupState } from '../h2/h2-warm-up';
import { StructureConfig } from '../domain/structure-config';

interface BenchmarkResult {
  size: number;
  loadTimeMs: number;
  warmupCompleted: number;
  evaluationsCompleted: number;
  firstEvalTimeMs: number;
  lastEvalTimeMs: number;
  totalTimeMs: number;
  avgTimePerEval: number;
  scalingRatio: number;
  memoryUsageEstimate: string;
  error?: string;
}

async function runBenchmark(size: number, prevTime: number): Promise<BenchmarkResult> {
  const result: BenchmarkResult = {
    size,
    loadTimeMs: 0,
    warmupCompleted: 0,
    evaluationsCompleted: 0,
    firstEvalTimeMs: 0,
    lastEvalTimeMs: 0,
    totalTimeMs: 0,
    avgTimePerEval: 0,
    scalingRatio: prevTime > 0 ? 0 : 1,
    memoryUsageEstimate: 'N/A',
  };

  const startTime = Date.now();

  try {
    // Load dataset
    const repo = new LocalFileRepository('datasets');
    const loadStart = Date.now();
    const dataset = await repo.loadDataset('NIFTY-5m-2023-2026');

    if (!dataset) {
      result.error = 'Dataset not found';
      result.totalTimeMs = Date.now() - startTime;
      return result;
    }

    const candles = await repo.loadAllCandles(dataset.filePath);
    result.loadTimeMs = Date.now() - loadStart;

    // Take first N candles
    const testCandles = candles.slice(0, size);

    // Initialize H2
    const warmupSize = Math.min(Math.ceil(size * 0.2), 50);
    const warmupState = createWarmupState({
      regimeEngineWarmup: warmupSize,
      levelEngineWarmup: warmupSize * 2,
      setupEngineWarmup: warmupSize,
      indicatorWarmup: warmupSize * 2,
    });

    const orchestrator = new H2Orchestrator(
      'NIFTY 50',
      'NIFTY-5m-2023-2026',
      dataset.manifest.checksumSHA256,
      { k: 5, maxBarsFailedBreak: 5, maxBarsAfterBreak: 10, rulesetVersion: '1.0', configHash: 'bench-v1' },
      { k: 5, maxBarsFailedBreak: 5, maxBarsAfterBreak: 10, rulesetVersion: '1.0', configHash: 'bench-v1' },
      new StructureConfig(2, 2),
      warmupState,
    );

    // Run evaluation
    const replayConfig: ReplayConfig = {
      symbol: 'NIFTY 50',
      timeframes: ['5m'],
      startDateUTC: testCandles[0].openTimeUTC,
      endDateUTC: testCandles[testCandles.length - 1].closeTimeUTC,
    };

    let candleIndex = 0;
    const candlesSoFar: typeof testCandles = [];
    const evalTimes: number[] = [];
    const evalStartTime = Date.now();
    const maxTimeMs = Math.min(60000, size > 200 ? 30000 : 120000); // 30-60s timeout

    for await (const event of ReplayEngine.replay(testCandles, replayConfig)) {
      const t0 = Date.now();

      // Add candles up to current event time
      while (candleIndex < testCandles.length && testCandles[candleIndex].closeTimeUTC <= event.asOfTimeUTC) {
        candlesSoFar.push(testCandles[candleIndex]);
        candleIndex++;
      }

      // Evaluate
      const evalResult = await orchestrator.evaluateAtPointInTime(
        candlesSoFar,
        event.candle,
        event.asOfTimeUTC,
      );

      const evalTime = Date.now() - t0;
      evalTimes.push(evalTime);

      if (evalResult.warmupSkipped) {
        result.warmupCompleted++;
      } else {
        result.evaluationsCompleted++;
        if (result.evaluationsCompleted === 1) {
          result.firstEvalTimeMs = evalTime;
        }
        if (result.evaluationsCompleted > 0) {
          result.lastEvalTimeMs = evalTime;
        }
      }

      // Check timeout
      if (Date.now() - evalStartTime > maxTimeMs) {
        result.error = `Timeout after ${maxTimeMs}ms`;
        break;
      }
    }

    result.totalTimeMs = Date.now() - startTime;
    result.avgTimePerEval = result.evaluationsCompleted > 0
      ? (result.totalTimeMs - result.loadTimeMs) / result.evaluationsCompleted
      : 0;

    if (prevTime > 0) {
      result.scalingRatio = result.totalTimeMs / prevTime;
    }

    // Rough memory estimate (each Candle ~1KB, history grows)
    const avgHistorySize = size / 2;
    result.memoryUsageEstimate = `~${(avgHistorySize * 1.5 / 1024).toFixed(1)}MB`;

  } catch (e) {
    result.error = e instanceof Error ? e.message : String(e);
    result.totalTimeMs = Date.now() - startTime;
  }

  return result;
}

async function main() {
  console.log('═══════════════════════════════════════════');
  console.log('H2 PERFORMANCE BENCHMARK');
  console.log('═══════════════════════════════════════════\n');

  const SIZES = [25, 50, 100, 150, 200, 250];
  const results: BenchmarkResult[] = [];
  let prevTotalTime = 0;

  for (const size of SIZES) {
    process.stdout.write(`Testing ${size} candles... `);
    const result = await runBenchmark(size, prevTotalTime);
    results.push(result);
    prevTotalTime = result.totalTimeMs;

    if (result.error) {
      console.log(`ERROR: ${result.error}`);
    } else {
      console.log(`OK (${result.totalTimeMs}ms total)`);
    }

    // Stop if timeout
    if (result.error?.includes('Timeout')) {
      console.log('\n⚠️  Timeout reached. Stopping benchmark.\n');
      break;
    }
  }

  // Print detailed results
  console.log('\n═══════════════════════════════════════════');
  console.log('DETAILED RESULTS');
  console.log('═══════════════════════════════════════════\n');
  console.log('Size\tLoad\tWarmup\tEvals\tFirst\tLast\tTotal\tAvg/Eval\tScaling\tMemory');
  console.log('────────────────────────────────────────────────────────────────────');

  for (const r of results) {
    const scaling = r.scalingRatio > 0 ? r.scalingRatio.toFixed(2) : '1.00';
    console.log(`${r.size}\t${r.loadTimeMs}\t${r.warmupCompleted}\t${r.evaluationsCompleted}\t${r.firstEvalTimeMs}\t${r.lastEvalTimeMs}\t${r.totalTimeMs}\t${r.avgTimePerEval.toFixed(1)}\t\t${scaling}x\t${r.memoryUsageEstimate}`);
  }

  // Analysis
  console.log('\n═══════════════════════════════════════════');
  console.log('COMPLEXITY ANALYSIS');
  console.log('═══════════════════════════════════════════\n');

  if (results.length >= 2) {
    const scaling = [];
    for (let i = 1; i < results.length; i++) {
      const ratio = results[i].totalTimeMs / results[i - 1].totalTimeMs;
      const sizeRatio = results[i].size / results[i - 1].size;
      scaling.push({ sizeRatio, timeRatio: ratio });
    }

    console.log('Size Multiplier vs Time Multiplier:');
    for (let i = 0; i < scaling.length; i++) {
      const s = scaling[i];
      const complexity = Math.log(s.timeRatio) / Math.log(s.sizeRatio);
      console.log(`  ${results[i].size}→${results[i+1].size}:\t${s.sizeRatio.toFixed(2)}x size → ${s.timeRatio.toFixed(2)}x time (O(N^${complexity.toFixed(2)}))`);
    }
  }

  console.log('\n═══════════════════════════════════════════');
  console.log('PERFORMANCE PROJECTIONS');
  console.log('═══════════════════════════════════════════\n');

  if (results.length > 0) {
    const lastResult = results[results.length - 1];
    console.log(`Measured: ${lastResult.size} candles → ${lastResult.totalTimeMs}ms\n`);

    // Extrapolate assuming quadratic behavior
    const projections = [500, 1000, 5000, 10000, 55642];
    console.log('Projections (assuming O(N²) behavior):');

    for (const proj of projections) {
      if (proj > lastResult.size) {
        const ratio = proj / lastResult.size;
        const estimatedTimeMs = lastResult.totalTimeMs * (ratio * ratio);
        const seconds = (estimatedTimeMs / 1000).toFixed(1);
        const minutes = (estimatedTimeMs / 60000).toFixed(1);
        const hours = (estimatedTimeMs / 3600000).toFixed(1);

        let timeStr = '';
        if (estimatedTimeMs < 1000) {
          timeStr = `${estimatedTimeMs.toFixed(0)}ms`;
        } else if (estimatedTimeMs < 60000) {
          timeStr = `${seconds}s`;
        } else if (estimatedTimeMs < 3600000) {
          timeStr = `${minutes}m`;
        } else {
          timeStr = `${hours}h`;
        }

        console.log(`  ${proj} candles: ${timeStr} (${estimatedTimeMs.toFixed(0)}ms)`);
      }
    }
  }
}

main().catch(console.error);
