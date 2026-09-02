// Domain exports
export { Timeframe, TimeframeValue } from './domain/timeframe';
export { SessionTime, CandleSession } from './domain/session';
export { Candle, CandleStatus, CandleOHLC, CandleCalculator } from './domain/candle';
export { CandleValidator, BulkCandleValidator, ValidationError } from './domain/candle-validator';

// MTF Synchronization exports (Part 2)
export { MTFSnapshot, TimeframeAvailability, TimeframeState } from './domain/mtf-snapshot';
export { MTFCalculator } from './domain/mtf-calculator';
export { NoLookAheadValidator, LookAheadViolation } from './domain/no-look-ahead-validator';

// Structure Engine exports (Part 3)
export { StructureConfig } from './domain/structure-config';
export { SwingPoint, SwingType, SwingPointComparator } from './domain/swing-point';
export { StructureState, StructureType } from './domain/structure-state';
export { SwingDetector } from './domain/swing-detector';
export { StructureCalculator, SwingClassification } from './domain/structure-calculator';
export { StructureSnapshot, BOSEvent, CHOCHEvent } from './domain/structure-snapshot';
export { StructureEngine } from './domain/structure-engine';

// Regime Engine exports (Part 4)
export { RegimeType, RegimeClassification, TimeframeRegimeState } from './domain/regime-state';
export { RegimeSnapshot, RegimeEvidence, StructuralDirectionState } from './domain/regime-snapshot';
export { RegimeEvaluator } from './domain/regime-evaluator';
export { RegimeStateMachine, RegimeTransition } from './domain/regime-state-machine';
export { RegimeEngine } from './domain/regime-engine';

// Trigger Engine exports (Part 7)
export { TriggerType, Trigger } from './domain/trigger';
export { TriggerSnapshot } from './domain/trigger-snapshot';
export { TriggerEngine, TriggerEngineConfig } from './domain/trigger-engine';

// Risk Engine exports (Part 8)
export { RiskStatus, Risk } from './domain/risk';
export { RiskSnapshot } from './domain/risk-snapshot';
export { RiskEngine, RiskEngineConfig } from './domain/risk-engine';

// Decision Engine exports (Part 9)
export { DecisionAction, Decision } from './domain/decision';
export { DecisionSnapshot } from './domain/decision-snapshot';
export { DecisionEngine, DecisionEngineConfig } from './domain/decision-engine';

// Persistence exports
export { CandleRepository } from './persistence/candle-repository.interface';
export { SupabaseCandleRepository } from './persistence/supabase-candle-repository';

// Adapter exports
export { BrokerAdapter, BrokerCandle } from './adapters/broker-adapter.interface';
export { AngelOneAdapter } from './adapters/angel-one-adapter';

// Live pipeline exports
export { AngelOneLiveClient, Tick } from './live/angel-one-live-client';
export { TickAggregator } from './live/tick-aggregator';
export { LiveOrchestrator, LiveOrchestratorConfig, SignalOutput } from './live/live-orchestrator';
export { SignalPersistenceService } from './live/signal-persistence-service';
export { TelegramService } from './live/telegram-service';
export { PersistentServer } from './live/persistent-server';

// Signal repository exports
export { SignalRepository, SignalRecord, SavedSignal } from './persistence/signal-repository.interface';
export { SupabaseSignalRepository } from './persistence/supabase-signal-repository';

// Phase 2: Trade Execution exports
export { TradeExecution, TradeStatus, ExitType } from './domain/trade-execution';
export {
  TradeExecutionRepository,
  TradeExecutionRecord,
  SavedTradeExecution,
} from './persistence/trade-execution-repository.interface';
export { SupabaseTradeExecutionRepository } from './persistence/supabase-trade-execution-repository';

// Phase 2: Performance Metrics exports
export { PerformanceMetrics } from './domain/performance-metrics';
export {
  PerformanceMetricsRepository,
  PerformanceMetricsRecord,
  SavedPerformanceMetrics,
} from './persistence/performance-metrics-repository.interface';
export { SupabasePerformanceMetricsRepository } from './persistence/supabase-performance-metrics-repository';

// Phase 2: Trade Detection & Performance Calculation
export { TradeDetectionService } from './live/trade-detection-service';
export { PerformanceCalculator } from './live/performance-calculator';
