/**
 * H2 CONTRACTS — Immutable structures for historical validation/replay application layer
 *
 * H2 is NOT a trading engine.
 * H2 orchestrates frozen Parts 1–6 only.
 * H2 must never contain business logic (indicators, strategy, risk, evidence, setup, trade-plan).
 * H2 must guarantee causality: no T+1 data accessed at time T.
 * H2 must use immutable contexts tied to specific evaluation timestamps.
 */

/**
 * CAUSAL CONTEXT
 *
 * Immutable snapshot of information available at a specific point in time.
 * Every H2 evaluation uses exactly one CausalContext.
 * All inputs must have timestamp <= asOfTimeUTC.
 *
 * Violating causality (accessing T+1 at time T) must fail loudly.
 */
export interface CausalContext {
  // Evaluation timestamp (ISO 8601 UTC)
  asOfTimeUTC: Date;

  // Dataset identity (verify before evaluation)
  datasetId: string;
  datasetChecksum: string;

  // Symbol and timeframe (must match H1.2)
  symbol: string;
  timeframe: string; // "5m", "15m", "60m", "1D"

  // Dataset manifest reference (immutable)
  datasetManifestPath: string;
}

/**
 * CAUSALITY VIOLATION
 *
 * Explicit error when T+1 data accessed at time T.
 * Must fail loudly, never silently discard.
 */
export class CausalityViolationError extends Error {
  constructor(
    public evaluationTime: Date,
    public violatingTimestamp: Date,
    public violatingData: string,
  ) {
    super(
      `CAUSALITY VIOLATION: Attempted access to data at ${violatingTimestamp.toISOString()} while evaluating at ${evaluationTime.toISOString()}. Data: ${violatingData}`,
    );
    this.name = 'CausalityViolationError';
  }
}

/**
 * EVALUATION RESULT
 *
 * Immutable result from evaluating Parts 1–6 at a specific point in time.
 * References frozen snapshots, does not duplicate business logic.
 */
export interface EvaluationResult {
  // Context that was evaluated
  context: CausalContext;

  // Candle that triggered evaluation
  candle: {
    timestamp: string; // RFC 3339 with timezone
    open: number;
    high: number;
    low: number;
    close: number;
    volume: number;
  };

  // References to frozen Parts 1–6 results (immutable snapshots only)
  regimeSnapshot?: any; // frozen RegimeSnapshot
  levelSnapshot?: any; // frozen LevelSnapshot
  setupSnapshot?: any; // frozen SetupState
  evidenceSnapshot?: any; // frozen Evidence
  riskAssessment?: any; // frozen RiskAssessment
  tradePlan?: any; // frozen TradePlan

  // H2-specific tracking
  warmupSkipped: boolean; // if true, this evaluation's indicator values insufficient
  causality: {
    verified: boolean; // all inputs <= asOfTimeUTC
    violations: string[]; // if any exist, evaluation should have failed
  };

  // Outcome (not modified by H2, only recorded)
  outcome?: {
    qualifyingSetupFound: boolean;
    riskRejected: boolean;
    tradePlanCreated: boolean;
  };
}

/**
 * DATASET INTEGRITY VERIFICATION
 *
 * Must pass before any H2 evaluation.
 * Refuse to run if integrity checks fail.
 */
export interface DatasetIntegrityCheck {
  datasetId: string;
  checksum: string;
  symbol: string;
  timeframe: string;
  candleCount: number;
  expectedCandleCount: number;
  startTime: Date;
  endTime: Date;
  checks: {
    checksumMatch: boolean; // H1.2 manifest checksum == loaded dataset checksum
    symbolMatch: boolean; // must be "NIFTY 50"
    timeframeMatch: boolean; // must be "5m"
    candleCountMatch: boolean; // must match expected
    chronological: boolean; // candles in order
    noFutureCandlesLoaded: boolean; // dataset doesn't contain T+N erroneously
  };
  result: 'PASS' | 'FAIL';
  errors: string[];
}

/**
 * H2 RUN MANIFEST
 *
 * Immutable record of a complete H2 evaluation run.
 * Tracks causality, determinism, completeness.
 */
export interface H2RunManifest {
  // Run identity
  runId: string;
  runStartTime: Date;
  runEndTime: Date;

  // Dataset identity
  datasetId: string;
  datasetChecksum: string;
  symbol: string;
  timeframe: string;

  // Evaluation scope
  evaluationStartTime: Date;
  evaluationEndTime: Date;

  // Causality verification
  causalityVerified: boolean;
  causalityViolations: {
    timestamp: Date;
    violatingData: string;
    evaluationTime: Date;
  }[];

  // Processing metrics
  totalCandles: number;
  warmupSkippedCount: number;
  firstValidEvaluationTime?: Date;
  evaluationsCount: number;

  // Parts 1–6 results (no modifications, only recording)
  qualifiedSetups: number;
  rejectedSetups: number;
  tradePlans: number;
  riskRejections: number;

  // Distribution
  setupsByStrategy: Record<string, number>;
  rejectionReasons: Record<string, number>;

  // Determinism
  deterministicReplayResult?: {
    run1Hash: string;
    run2Hash: string;
    identical: boolean;
  };

  // Pipeline errors
  pipelineErrors: string[];
  missingData: {
    timestamp: Date;
    reason: string;
  }[];

  // H2 version
  h2Version: string;
  h2Configuration: {
    requireCausalityVerification: boolean;
    requireDeterministicReplay: boolean;
    requireWarmupSkipping: boolean;
  };

  // Explicit limitations
  limitations: {
    noIndicatorOptimization: boolean;
    noStrategyModification: boolean;
    noRiskModification: boolean;
    noProfitabilityOptimization: boolean;
    noMachineLearning: boolean;
    noSyntheticData: boolean;
    parts1_6Frozen: boolean;
    h0Frozen: boolean;
  };

  // Determinism assertions
  assertions: {
    parts1_6Untouched: boolean; // verified no code changes
    h0Untouched: boolean; // verified no architectural changes
    existingContractsReused: boolean; // H2 uses frozen snapshots only
    noBusinessLogicDuplicated: boolean; // no indicators/strategy/risk in H2
  };

  // Final status
  status: 'COMPLETE' | 'FAILED';
  readyForProduction: boolean; // H2 correctness only (not strategy correctness)
  readyForStrategyValidation: boolean; // pass to next layer
}

/**
 * LOOK-AHEAD TEST RESULTS
 *
 * Prove causality through mutation tests.
 */
export interface LookAheadTestResult {
  testName: string;
  description: string;
  passed: boolean;
  details: string;

  // Mutation details
  mutation?: {
    type: 'FUTURE_CANDLE' | 'FUTURE_VALUE' | 'CACHE_POLLUTION' | 'STATE_LEAK';
    appliedAt: Date;
    mutatedTimestamps: Date[];
  };

  // Comparison
  comparison?: {
    run1ResultHash?: string;
    run2ResultHash?: string;
    identical?: boolean;
  };

  // Assertion failure
  assertionViolation?: {
    message: string;
    expectedCausalityCheck: 'SHOULD_FAIL';
    actualResult: 'FAILED' | 'PASSED_INCORRECTLY';
  };
}

/**
 * H2 SNAPSHOT RECORD
 *
 * Immutable capture of evaluation at a point in time.
 * References frozen engine snapshots, does not duplicate data.
 */
export interface H2SnapshotRecord {
  recordId: string;
  asOfTimeUTC: Date;
  symbol: string;
  timeframe: string;

  // Input
  candle: {
    timestamp: string;
    ohlcv: [number, number, number, number, number];
  };

  // Frozen references (immutable snapshots from Parts 1–6)
  frozenSnapshots: {
    regimeId?: string;
    levelId?: string;
    setupId?: string;
    evidenceId?: string;
    riskId?: string;
    tradePlanId?: string;
  };

  // Outcome
  outcome: {
    qualifyingSetupFound: boolean;
    reasonForRejection?: string;
    tradePlanGenerated: boolean;
  };

  // Causality certificate
  causalityCertificate: {
    asOfTime: Date;
    allInputsBeforeOrAt: boolean;
    maxInputTimestamp: Date;
  };
}

/**
 * RESULTS AGGREGATION
 *
 * Summary statistics without profitability claims.
 */
export interface H2ResultsAggregation {
  runManifestId: string;
  symbol: string;
  timeframe: string;
  period: {
    start: Date;
    end: Date;
  };

  // Factual metrics only
  metrics: {
    totalCandlesProcessed: number;
    totalEvaluations: number;
    warmupCandlesSkipped: number;

    setups: {
      qualifiedCount: number;
      rejectedCount: number;
      byStrategy: Record<string, number>;
      rejectionReasons: Record<string, number>;
    };

    decisions: {
      tradePlans: number;
      riskRejections: number;
      errors: number;
    };

    causality: {
      violations: number;
      verified: boolean;
    };

    determinism: {
      run1Id?: string;
      run2Id?: string;
      identical: boolean;
      differenceCount?: number;
    };

    dataQuality: {
      missingData: number;
      missingTimestamps: Date[];
      sessionViolations: number;
      timestampOrderViolations: number;
    };
  };

  // NOT included: profitability, PnL, win rate, Sharpe ratio, etc.
  // Those are properties of strategy/execution, not H2 validation

  // Explicit: this is H2 infrastructure correctness, not strategy correctness
  readinessLevel: 'H2_INFRASTRUCTURE_VERIFIED' | 'REQUIRES_FIXES';
}
