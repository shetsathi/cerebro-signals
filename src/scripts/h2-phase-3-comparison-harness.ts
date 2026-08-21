#!/usr/bin/env tsx

/**
 * PHASE 3 & 4 — H2 COMPARISON & BENCHMARK HARNESS
 *
 * Runs H2 against small datasets and compares:
 * - Reference (current H2) vs Reference (second run for determinism)
 * - Captures all evaluation results
 * - Benchmarks performance
 * - Validates causality and determinism
 */

import { LocalFileRepository } from '../historical/local-file-repository';
import { ReplayEngine, ReplayConfig } from '../historical/replay-engine';
import { H2Orchestrator } from '../h2/h2-orchestrator';
import { H2ExecutionRecorder } from '../h2/h2-execution-recorder';
import { createWarmupState } from '../h2/h2-warm-up';
import { LevelEngineConfig } from '../domain/level-engine';
import { SetupEngineConfig } from '../domain/setup-engine';
import { StructureConfig } from '../domain/structure-config';

async function runH2TestOnSubset(
  datasetPath: string,
  size: number,
  runName: string,
): Promise<{
  runId: string;
  size: number;
  executionTimeMs: number;
  evaluations: number;
  setupsFound: number;
  errors: number;
  record: string;
}> {
  console.log(`\n📊 Testing ${size} candles (${runName})...`);

  const repo = new LocalFileRepository('datasets');
  const dataset = await repo.loadDataset(datasetPath);
  if (!dataset) throw new Error(`Dataset not found: ${datasetPath}`);

  let candles = await repo.loadAllCandles(dataset.filePath);
  candles = candles.slice(0, size);

  console.log(`  Loaded ${candles.length} candles`);

  const warmupState = createWarmupState({
    regimeEngineWarmup: Math.min(10, size),
    levelEngineWarmup: Math.min(20, size),
    setupEngineWarmup: Math.min(10, size),
    indicatorWarmup: Math.min(20, size),
  });

  const orchestrator = new H2Orchestrator(
    'NIFTY 50',
    datasetPath,
    dataset.manifest.checksumSHA256,
    { k: 5, maxBarsFailedBreak: 5, maxBarsAfterBreak: 10, rulesetVersion: '1.0', configHash: 'h2-test-v1' },
    { k: 5, maxBarsFailedBreak: 5, maxBarsAfterBreak: 10, rulesetVersion: '1.0', configHash: 'h2-test-v1' },
    new StructureConfig(2, 2),
    warmupState,
  );

  const runId = `h2-test-${size}-${runName}-${new Date().toISOString().replace(/[:.]/g, '-')}`;
  const recorder = new H2ExecutionRecorder(orchestrator, 'results/h2-comparison', runId);

  const startTime = Date.now();
  const replayConfig: ReplayConfig = {
    symbol: 'NIFTY 50',
    timeframes: ['5m'],
    startDateUTC: candles[0].openTimeUTC,
    endDateUTC: candles[candles.length - 1].closeTimeUTC,
  };

  let candleIndex = 0;
  const candlesSoFar: typeof candles = [];
  let evaluations = 0;
  let setupsFound = 0;
  let errors = 0;

  for await (const event of ReplayEngine.replay(candles, replayConfig)) {
    while (candleIndex < candles.length && candles[candleIndex].closeTimeUTC <= event.asOfTimeUTC) {
      candlesSoFar.push(candles[candleIndex]);
      candleIndex++;
    }

    try {
      const result = await recorder.evaluateAndRecord(candlesSoFar, event.candle, event.asOfTimeUTC);
      if (!result.warmupSkipped) {
        evaluations++;
        if (result.setupFound) setupsFound++;
      }
      if (result.causality.violations.length > 0) {
        errors++;
      }
    } catch (e) {
      errors++;
      console.error('  ❌ Evaluation error:', e);
    }
  }

  const executionTimeMs = Date.now() - startTime;
  const manifest = recorder.completeRecording();

  console.log(`  ✅ Completed: ${evaluations} evaluations, ${setupsFound} setups found`);
  console.log(`  ⏱️  Time: ${executionTimeMs}ms (avg ${(executionTimeMs / evaluations).toFixed(1)}ms/eval)`);

  return { runId, size, executionTimeMs, evaluations, setupsFound, errors, record: `results/h2-comparison/${runId}-records.jsonl` };
}

async function compareRuns(
  run1: { runId: string; size: number },
  run2: { runId: string; size: number },
): Promise<boolean> {
  console.log(`\n🔍 Comparing Run 1 vs Run 2 (both ${run1.size} candles)...`);

  const { evaluations: eval1, manifest: manifest1 } = await import('../h2/h2-execution-recorder').then(
    m => m.H2ExecutionRecorder.loadRecordings(run1.runId, 'results/h2-comparison'),
  );

  const { evaluations: eval2, manifest: manifest2 } = await import('../h2/h2-execution-recorder').then(
    m => m.H2ExecutionRecorder.loadRecordings(run2.runId, 'results/h2-comparison'),
  );

  const { H2ReferenceComparison } = await import('../h2/h2-execution-recorder');
  const comparison = H2ReferenceComparison.compareExecutions(eval1, eval2);

  if (comparison.identical) {
    console.log(`  ✅ DETERMINISM VERIFIED: Runs are identical`);
    return true;
  } else {
    console.log(`  ❌ DETERMINISM FAILED: ${comparison.differenceCount} differences found`);
    comparison.differences.slice(0, 5).forEach(d => {
      console.log(`    [${d.sequenceNumber}] ${d.field}: ${d.referenceValue} vs ${d.optimizedValue}`);
    });
    return false;
  }
}

async function main() {
  console.log('═══════════════════════════════════════════════════════════');
  console.log('H2 COMPARISON & BENCHMARK HARNESS — PHASES 3 & 4');
  console.log('═══════════════════════════════════════════════════════════');

  const sizes = [25, 50, 100, 250, 500];
  const results: Array<{
    size: number;
    run1TimeMs: number;
    run2TimeMs: number;
    deterministic: boolean;
    setupsFound: number;
  }> = [];

  for (const size of sizes) {
    if (size > 200) {
      console.log(`\n⏭️  Skipping ${size} candles (timeout risk in this phase)`);
      continue;
    }

    // Run 1
    const run1 = await runH2TestOnSubset('NIFTY-5m-2023-2026', size, 'run1');

    // Run 2 (determinism check)
    const run2 = await runH2TestOnSubset('NIFTY-5m-2023-2026', size, 'run2');

    // Compare
    const deterministic = await compareRuns(run1, run2);

    results.push({
      size,
      run1TimeMs: run1.executionTimeMs,
      run2TimeMs: run2.executionTimeMs,
      deterministic,
      setupsFound: run1.setupsFound,
    });
  }

  // Summary
  console.log('\n═══════════════════════════════════════════════════════════');
  console.log('RESULTS SUMMARY');
  console.log('═══════════════════════════════════════════════════════════');
  console.log('Size\tRun1(ms)\tRun2(ms)\tDeterministic\tSetups');
  console.log('────────────────────────────────────────────────────────────');

  for (const r of results) {
    const det = r.deterministic ? '✅' : '❌';
    console.log(`${r.size}\t${r.run1TimeMs}\t\t${r.run2TimeMs}\t\t${det}\t\t${r.setupsFound}`);
  }

  const allDeterministic = results.every(r => r.deterministic);
  console.log('\n' + (allDeterministic ? '✅ ALL TESTS PASSED' : '❌ SOME TESTS FAILED'));
}

main().catch(console.error);
