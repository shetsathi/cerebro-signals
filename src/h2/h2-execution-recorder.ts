/**
 * H2 EXECUTION RECORDER
 *
 * Wraps H2Orchestrator to capture and persist evaluation results.
 * Enables:
 * - Result-level caching across runs
 * - Determinism verification
 * - Reference comparison
 * - Causality validation
 *
 * Does NOT modify frozen H2Orchestrator.
 */

import * as fs from 'fs';
import * as path from 'path';
import { H2Orchestrator } from './h2-orchestrator';
import { EvaluationResult } from './h2-contracts';
import { Candle } from '../domain/candle';

export interface RecordedEvaluation {
  sequenceNumber: number;
  asOfTimeUTC: string;
  candle: {
    timestamp: string;
    ohlcv: [number, number, number, number, number];
  };
  warmupSkipped: boolean;
  setupFound: boolean;
  regimeId: string | null;
  levelId: string | null;
  setupId: string | null;
  causality: {
    verified: boolean;
    violations: string[];
  };
  executionTimeMs: number;
}

export interface ExecutionRecordManifest {
  runId: string;
  startTimeUTC: string;
  endTimeUTC: string | null;
  datasetId: string;
  datasetChecksum: string;
  symbol: string;
  totalCandlesEvaluated: number;
  totalEvaluations: number;
  warmupSkipped: number;
  setupsFound: number;
  evaluationsWithErrors: number;
  averageEvaluationTimeMs: number;
  totalExecutionTimeMs: number | null;
  recordedAt: string;
  executionVersion: string;
}

/**
 * Recorder wraps H2Orchestrator and captures results
 */
export class H2ExecutionRecorder {
  private orchestrator: H2Orchestrator;
  private recordsDir: string;
  private runId: string;
  private evaluations: RecordedEvaluation[] = [];
  private sequenceNumber = 0;
  private startTime: Date;
  private totalExecutionTimeMs: number | null = null;

  constructor(
    orchestrator: H2Orchestrator,
    recordsDir: string = 'results/h2-execution',
    runId: string = `h2-run-${new Date().toISOString().replace(/[:.]/g, '-')}`,
  ) {
    this.orchestrator = orchestrator;
    this.recordsDir = recordsDir;
    this.runId = runId;
    this.startTime = new Date();

    // Ensure directory exists
    if (!fs.existsSync(recordsDir)) {
      fs.mkdirSync(recordsDir, { recursive: true });
    }
  }

  /**
   * Evaluate and record a single timestamp
   */
  async evaluateAndRecord(
    allCandlesUpTo: Candle[],
    currentCandle: Candle,
    asOfTimeUTC: Date,
  ): Promise<RecordedEvaluation> {
    const evalStartTime = Date.now();

    // Call frozen orchestrator
    const result = await this.orchestrator.evaluateAtPointInTime(
      allCandlesUpTo,
      currentCandle,
      asOfTimeUTC,
    );

    const executionTimeMs = Date.now() - evalStartTime;

    // Record the result
    const recorded: RecordedEvaluation = {
      sequenceNumber: this.sequenceNumber++,
      asOfTimeUTC: asOfTimeUTC.toISOString(),
      candle: {
        timestamp: currentCandle.closeTimeUTC.toISOString(),
        ohlcv: [
          currentCandle.ohlc.open,
          currentCandle.ohlc.high,
          currentCandle.ohlc.low,
          currentCandle.ohlc.close,
          currentCandle.ohlc.volume,
        ],
      },
      warmupSkipped: result.warmupSkipped,
      setupFound: result.outcome?.qualifyingSetupFound || false,
      regimeId: result.regimeSnapshot?.id || null,
      levelId: result.levelSnapshot?.symbol || null,
      setupId: result.setupSnapshot?.symbol || null,
      causality: {
        verified: result.causality.verified,
        violations: result.causality.violations,
      },
      executionTimeMs,
    };

    this.evaluations.push(recorded);

    // Persist incrementally
    this.persistSingle(recorded);

    return recorded;
  }

  /**
   * Persist a single evaluation to disk (append mode)
   */
  private persistSingle(evaluation: RecordedEvaluation): void {
    const recordPath = path.join(this.recordsDir, `${this.runId}-records.jsonl`);
    const line = JSON.stringify(evaluation) + '\n';
    fs.appendFileSync(recordPath, line);
  }

  /**
   * Complete recording and write manifest
   */
  completeRecording(): ExecutionRecordManifest {
    const endTime = new Date();
    this.totalExecutionTimeMs = endTime.getTime() - this.startTime.getTime();

    const warmupSkipped = this.evaluations.filter(e => e.warmupSkipped).length;
    const setupsFound = this.evaluations.filter(e => e.setupFound && !e.warmupSkipped).length;
    const errorsCount = this.evaluations.filter(e => e.causality.violations.length > 0).length;
    const avgTimeMs = this.evaluations.length > 0
      ? this.evaluations.reduce((sum, e) => sum + e.executionTimeMs, 0) / this.evaluations.length
      : 0;

    const manifest: ExecutionRecordManifest = {
      runId: this.runId,
      startTimeUTC: this.startTime.toISOString(),
      endTimeUTC: endTime.toISOString(),
      datasetId: this.orchestrator.datasetId,
      datasetChecksum: this.orchestrator.datasetChecksum,
      symbol: this.orchestrator.symbol,
      totalCandlesEvaluated: this.evaluations.length,
      totalEvaluations: this.evaluations.length - warmupSkipped,
      warmupSkipped,
      setupsFound,
      evaluationsWithErrors: errorsCount,
      averageEvaluationTimeMs: avgTimeMs,
      totalExecutionTimeMs: this.totalExecutionTimeMs,
      recordedAt: new Date().toISOString(),
      executionVersion: '1.0.0',
    };

    // Persist manifest
    const manifestPath = path.join(this.recordsDir, `${this.runId}-manifest.json`);
    fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));

    return manifest;
  }

  /**
   * Get all recorded evaluations
   */
  getRecordedEvaluations(): readonly RecordedEvaluation[] {
    return Object.freeze([...this.evaluations]);
  }

  /**
   * Load prior recordings from disk
   */
  static loadRecordings(runId: string, recordsDir: string = 'results/h2-execution'): {
    evaluations: RecordedEvaluation[];
    manifest: ExecutionRecordManifest;
  } {
    const recordPath = path.join(recordsDir, `${runId}-records.jsonl`);
    const manifestPath = path.join(recordsDir, `${runId}-manifest.json`);

    if (!fs.existsSync(recordPath) || !fs.existsSync(manifestPath)) {
      throw new Error(`Recordings not found for run ${runId}`);
    }

    const evaluations: RecordedEvaluation[] = [];
    const lines = fs.readFileSync(recordPath, 'utf8').split('\n').filter(l => l.trim());
    for (const line of lines) {
      evaluations.push(JSON.parse(line));
    }

    const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8')) as ExecutionRecordManifest;

    return { evaluations, manifest };
  }
}

/**
 * Comparison harness for validating optimization correctness
 */
export class H2ReferenceComparison {
  /**
   * Compare two execution recordings
   */
  static compareExecutions(
    reference: RecordedEvaluation[],
    optimized: RecordedEvaluation[],
  ): {
    identical: boolean;
    differenceCount: number;
    differences: Array<{
      sequenceNumber: number;
      field: string;
      referenceValue: unknown;
      optimizedValue: unknown;
    }>;
  } {
    const differences = [];

    if (reference.length !== optimized.length) {
      return {
        identical: false,
        differenceCount: 1,
        differences: [
          {
            sequenceNumber: -1,
            field: 'length',
            referenceValue: reference.length,
            optimizedValue: optimized.length,
          },
        ],
      };
    }

    for (let i = 0; i < reference.length; i++) {
      const ref = reference[i];
      const opt = optimized[i];

      // Compare critical fields
      if (ref.asOfTimeUTC !== opt.asOfTimeUTC) {
        differences.push({
          sequenceNumber: i,
          field: 'asOfTimeUTC',
          referenceValue: ref.asOfTimeUTC,
          optimizedValue: opt.asOfTimeUTC,
        });
      }

      if (ref.warmupSkipped !== opt.warmupSkipped) {
        differences.push({
          sequenceNumber: i,
          field: 'warmupSkipped',
          referenceValue: ref.warmupSkipped,
          optimizedValue: opt.warmupSkipped,
        });
      }

      if (ref.setupFound !== opt.setupFound) {
        differences.push({
          sequenceNumber: i,
          field: 'setupFound',
          referenceValue: ref.setupFound,
          optimizedValue: opt.setupFound,
        });
      }

      if (ref.regimeId !== opt.regimeId) {
        differences.push({
          sequenceNumber: i,
          field: 'regimeId',
          referenceValue: ref.regimeId,
          optimizedValue: opt.regimeId,
        });
      }

      if (ref.causality.verified !== opt.causality.verified) {
        differences.push({
          sequenceNumber: i,
          field: 'causality.verified',
          referenceValue: ref.causality.verified,
          optimizedValue: opt.causality.verified,
        });
      }
    }

    return {
      identical: differences.length === 0,
      differenceCount: differences.length,
      differences,
    };
  }
}
