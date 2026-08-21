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

// Persistence exports
export { CandleRepository } from './persistence/candle-repository.interface';
export { SupabaseCandleRepository } from './persistence/supabase-candle-repository';

// Adapter exports
export { BrokerAdapter, BrokerCandle } from './adapters/broker-adapter.interface';
export { AngelOneAdapter } from './adapters/angel-one-adapter';
