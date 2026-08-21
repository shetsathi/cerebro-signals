#!/usr/bin/env tsx

/**
 * H2 DIAGNOSTIC — SMALL DATASET PERFORMANCE TEST
 *
 * Tests H2 execution against progressively larger REAL data subsets
 * to measure performance and identify scaling issues.
 */

import * as fs from 'fs';
import { LocalFileRepository } from '../historical/local-file-repository';
import { ReplayEngine, ReplayConfig } from '../historical/replay-engine';
import { H2Orchestrator } from '../h2/h2-orchestrator';
import { createWarmupState } from '../h2/h2-warm-up';
import { LevelEngineConfig } from '../domain/level-engine';
import { SetupEngineConfig } from '../domain/setup-engine';
import { StructureConfig } from '../domain/structure-config';

const TEST_SIZES = [1, 5, 10, 25, 50, 100, 250, 500, 1000];

interface TestResult {
  datasetSize: number;
  loadTime: number;
  evaluationStartTime: number;
  evaluationsCompleted: number;
  firstEvaluationTime: number;
  totalTime: number;
  errorMessage?: string;
}

async function runDiagnosticTest(size: number): Promise<TestResult> {
  const result: TestResult = {
    datasetSize: size,
    loadTime: 0,
    evaluationStartTime: 0,
    evaluationsCompleted: 0,
    firstEvaluationTime: 0,
    totalTime: 0,
  };

  const startTime = Date.now();

  try {
    // Load real dataset
    const repo = new LocalFileRepository('datasets');
    const loadStart = Date.now();
    const dataset = await repo.loadDataset('NIFTY-5m-2023-2026');
    if (!dataset) {
      result.errorMessage = 'Dataset not found';
      return result;
    }

    const candles = await repo.loadAllCandles(dataset.filePath);
    result.loadTime = Date.now() - loadStart;

    // Take first N candles
    const testCandles = candles.slice(0, size);
    console.log(`Testing with ${size} real candles (loaded ${result.loadTime}ms)`);

    // Initialize H2
    const warmupState = createWarmupState({
      regimeEngineWarmup: Math.min(10, size),
      levelEngineWarmup: Math.min(20, size),
      setupEngineWarmup: Math.min(10, size),
      indicatorWarmup: Math.min(20, size),
    });

    const orchestrator = new H2Orchestrator(
      'NIFTY 50',
      'NIFTY-5m-2023-2026',
      dataset.manifest.checksumSHA256,
      { k: 5, maxBarsFailedBreak: 5, maxBarsAfterBreak: 10, rulesetVersion: '1.0', configHash: 'diag-v1' },
      { k: 5, maxBarsFailedBreak: 5, maxBarsAfterBreak: 10, rulesetVersion: '1.0', configHash: 'diag-v1' },
      new StructureConfig(2, 2),
      warmupState,
    );

    const evaluationStartTime = Date.now();

    // Run replay with timeout
    const replayConfig: ReplayConfig = {
      symbol: 'NIFTY 50',
      timeframes: ['5m'],
      startDateUTC: testCandles[0].openTimeUTC,
      endDateUTC: testCandles[testCandles.length - 1].closeTimeUTC,
    };

    let candleIndex = 0;
    const candlesSoFar: typeof testCandles = [];
    let firstEvalTime = 0;

    for await (const event of ReplayEngine.replay(testCandles, replayConfig)) {
      const evalStart = Date.now();

      // Add candles up to current event time
      while (candleIndex < testCandles.length && testCandles[candleIndex].closeTimeUTC <= event.asOfTimeUTC) {
        candlesSoFar.push(testCandles[candleIndex]);
        candleIndex++;
      }

      // Evaluate
      await orchestrator.evaluateAtPointInTime(
        candlesSoFar,
        event.candle,
        event.asOfTimeUTC,
      );

      const evalTime = Date.now() - evalStart;
      if (firstEvalTime === 0) {
        firstEvalTime = evalTime;
      }

      result.evaluationsCompleted++;

      // Log progress every 10 evaluations or first
      if (result.evaluationsCompleted === 1 || result.evaluationsCompleted % 10 === 0) {
        console.log(`  Evaluation ${result.evaluationsCompleted}: ${evalTime}ms`);
      }

      // Timeout after 30 seconds per test
      if (Date.now() - evaluationStartTime > 30000) {
        result.errorMessage = 'Timeout after 30 seconds';
        break;
      }
    }

    result.firstEvaluationTime = firstEvalTime;
    result.evaluationStartTime = evaluationStartTime;

    result.totalTime = Date.now() - startTime;
    result.firstEvaluationTime = firstEvalTime;
  } catch (e) {
    result.errorMessage = e instanceof Error ? e.message : String(e);
    result.totalTime = Date.now() - startTime;
  }

  return result;
}

async function main() {
  console.log('H2 Diagnostic Performance Test');
  console.log('==============================\n');

  const results: TestResult[] = [];

  for (const size of TEST_SIZES) {
    console.log(`\nTesting size: ${size} candles`);
    const result = await runDiagnosticTest(size);
    results.push(result);

    console.log(`  Load time: ${result.loadTime}ms`);
    console.log(`  Evaluations completed: ${result.evaluationsCompleted}`);
    console.log(`  First evaluation: ${result.firstEvaluationTime}ms`);
    console.log(`  Total time: ${result.totalTime}ms`);
    if (result.errorMessage) {
      console.log(`  ERROR: ${result.errorMessage}`);
    }

    // Stop if we're seeing exponential growth
    if (result.totalTime > 30000) {
      console.log(`\n⚠️  Performance degradation detected. Stopping tests.`);
      break;
    }
  }

  // Print summary
  console.log('\n\nPerformance Summary');
  console.log('===================');
  console.log('Size\tEvals\tFirst(ms)\tTotal(ms)\tScaling');
  let prevTime = 0;
  for (const r of results) {
    const scaling = prevTime > 0 ? (r.totalTime / prevTime).toFixed(2) : '—';
    console.log(`${r.datasetSize}\t${r.evaluationsCompleted}\t${r.firstEvaluationTime}\t\t${r.totalTime}\t\t${scaling}x`);
    prevTime = r.totalTime;
  }
}

main().catch(console.error);
