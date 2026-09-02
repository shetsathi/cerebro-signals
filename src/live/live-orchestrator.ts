/**
 * Live Orchestrator — Complete V1 Pipeline (Parts 1–9)
 *
 * Invokes frozen Parts 1–9 on each closed candle.
 * Does NOT duplicate frozen engine logic.
 * Emits 'decision' events when LONG/SHORT signals generated.
 *
 * CRITICAL:
 * - Causality: asOfTimeUTC = candle.closeTimeUTC (no look-ahead)
 * - Immutability: Never modify frozen snapshots
 * - Composition: Call engines in order, no shortcuts
 * - Decision: Only LONG/SHORT create signals (not WAIT)
 */

import { EventEmitter } from 'events';
import { Candle } from '../domain/candle';
import { Timeframe, TimeframeValue } from '../domain/timeframe';
import { RegimeEngine } from '../domain/regime-engine';
import { StructureEngine } from '../domain/structure-engine';
import { LevelEngine, LevelEngineConfig } from '../domain/level-engine';
import { SetupEngine, SetupEngineConfig } from '../domain/setup-engine';
import { TriggerEngine, TriggerEngineConfig } from '../domain/trigger-engine';
import { RiskEngine, RiskEngineConfig } from '../domain/risk-engine';
import { DecisionEngine, DecisionEngineConfig } from '../domain/decision-engine';
import { Decision, DecisionAction } from '../domain/decision';
import { Risk, RiskStatus } from '../domain/risk';
import { StructureConfig } from '../domain/structure-config';
import { ConvictionCalculator } from '../domain/conviction-calculator';

export interface SignalOutput {
  decision: Decision;
  risk: Risk;
  symbol: string;
  action: DecisionAction;
  entryPrice: number;
  stopPrice: number;
  targetPrice: number | null;
  riskRewardRatio: number | null;
  evaluationTimeUTC: Date;
  knowledgeTimeUTC: Date;
  rulesetVersion: string;
  configHash: string;

  // Traceability fields (Phase 1)
  stopLevelId?: string;     // Structural level ID for stop loss
  targetLevelId?: string;   // Structural level ID for target
  setupType?: string;       // Setup type from Part 6
  triggerType?: string;     // Trigger type from Part 7
  regimeType?: string;      // Regime type at signal time

  // Quality/Conviction fields (Phase 3)
  convictionScore?: number;     // 0-100 signal quality score
  convictionLevel?: string;     // LOW, MEDIUM, HIGH
  convictionFactors?: Record<string, number>;  // Breakdown: {regime: X, setup: Y, ...}
}

export interface LiveOrchestratorConfig {
  decisionConfig: DecisionEngineConfig;
  riskConfig: RiskEngineConfig;
  triggerConfig: TriggerEngineConfig;
  setupConfig: SetupEngineConfig;
  levelConfig: LevelEngineConfig;
  structureConfig: StructureConfig;
}

export class LiveOrchestrator extends EventEmitter {
  constructor(
    private symbol: string,
    private config: LiveOrchestratorConfig,
  ) {
    super();
  }

  /**
   * Evaluate V1 Parts 1–9 on a closed candle
   *
   * Input: All historical candles + latest closed candle
   * Output: DecisionSnapshot (may contain LONG/SHORT/WAIT decisions)
   */
  async evaluate(allCandlesUpTo: Candle[], closedCandle: Candle): Promise<void> {
    const asOfTimeUTC = closedCandle.closeTimeUTC;
    const symbol = closedCandle.symbol;

    try {
      console.log(`[${symbol}] Evaluate: ${allCandlesUpTo.length} candles, latest=${closedCandle.closeTimeUTC.toISOString()}`);

      // CRITICAL: All subsequent operations use asOfTimeUTC
      // No data from after this timestamp can be accessed
      // This enforces causality throughout the frozen layers

      // Parts 1-2: Already done by caller (candle persistence)
      // Part 2: MTF synchronization (implicit in multi-candle array)

      // Part 3: Structure Engine
      const structureSnapshot = StructureEngine.getStructureSnapshot(
        allCandlesUpTo,
        asOfTimeUTC,
        symbol,
        Timeframe.from(TimeframeValue.FIVE_MIN),
        this.config.structureConfig,
      );
      console.log(
        `[${symbol}] Part 3: ${structureSnapshot.getConfirmedSwings().length} swings, ` +
        `structure=${structureSnapshot.getStructureType()}`
      );

      // Part 4: Regime Engine
      const regimeSnapshot = RegimeEngine.getRegimeSnapshot(
        allCandlesUpTo,
        asOfTimeUTC,
        symbol,
        this.config.structureConfig,
      );
      console.log(`[${symbol}] Part 4: regime=${regimeSnapshot.currentRegime}`);

      // Part 5: Level & Location Engine
      const locationSnapshot = LevelEngine.getLocationSnapshot(
        allCandlesUpTo,
        structureSnapshot,
        asOfTimeUTC,
        symbol,
        this.config.levelConfig,
      );
      console.log(
        `[${symbol}] Part 5: ${locationSnapshot.getAllLevels().length} total levels, ` +
        `${locationSnapshot.getAllEvents().length} events`
      );

      // Part 6: Setup Qualification Engine
      const setupSnapshot = SetupEngine.getSetupSnapshot(
        locationSnapshot,
        structureSnapshot,
        asOfTimeUTC,
        symbol,
        this.config.setupConfig,
      );
      const qualifiedSetups = setupSnapshot.getQualifiedSetups().length;
      console.log(`[${symbol}] Part 6: ${setupSnapshot.getAllSetups().length} setups (${qualifiedSetups} qualified)`);

      // Part 7: Trigger Engine
      const triggerSnapshot = TriggerEngine.getTriggerSnapshot(
        setupSnapshot,
        locationSnapshot,
        closedCandle,
        asOfTimeUTC,
        this.config.triggerConfig,
      );
      console.log(`[${symbol}] Part 7: ${triggerSnapshot.getAllTriggers().length} triggers`);

      // Part 8: Risk Engine
      const riskSnapshot = RiskEngine.getRiskSnapshot(
        triggerSnapshot,
        locationSnapshot,
        asOfTimeUTC,
        this.config.riskConfig,
      );
      const validRisks = riskSnapshot.getAllRisks().filter(r => r.status === 'VALID').length;
      console.log(`[${symbol}] Part 8: ${riskSnapshot.getAllRisks().length} risks (${validRisks} VALID)`);

      // Part 9: Decision Engine
      const decisionSnapshot = DecisionEngine.getDecisionSnapshot(
        riskSnapshot,
        asOfTimeUTC,
        this.config.decisionConfig,
      );

      // Extract actionable decisions (LONG/SHORT only, not WAIT)
      const longDecisions = decisionSnapshot.getLongDecisions();
      const shortDecisions = decisionSnapshot.getShortDecisions();

      console.log(
        `[${symbol}] Decision snapshot: ${longDecisions.length} LONG, ${shortDecisions.length} SHORT, ` +
        `${riskSnapshot.getAllRisks().length} total risks`
      );

      // Emit each actionable decision as a signal
      for (const decision of [...longDecisions, ...shortDecisions]) {
        // Find corresponding risk to extract prices
        const risks = riskSnapshot.getAllRisks().filter(r => decision.riskIds.includes(r.riskId));

        for (const risk of risks) {
          if (risk.status === RiskStatus.VALID) {
            // Find the corresponding trigger for traceability
            const trigger = triggerSnapshot.getAllTriggers().find(t => t.triggerId === risk.triggerId);

            // Find the corresponding setup for setup_type
            const setup = setupSnapshot.getAllSetups().find(s => s.setupId === risk.setupId);

            // Calculate conviction score (Phase 3)
            const conviction = ConvictionCalculator.calculateConviction(
              regimeSnapshot.currentRegime || null,
              setup?.setupType?.toString() || null,
              trigger?.triggerType?.toString() || null,
              risk.riskRewardRatio,
              risk.status,
            );

            const signal: SignalOutput = {
              decision,
              risk,
              symbol,
              action: decision.action,
              entryPrice: risk.entry,
              stopPrice: risk.stop,
              targetPrice: risk.target,
              riskRewardRatio: risk.riskRewardRatio,
              evaluationTimeUTC: asOfTimeUTC,
              knowledgeTimeUTC: decisionSnapshot.knowledgeTimeUTC,
              rulesetVersion: decisionSnapshot.rulesetVersion,
              configHash: decisionSnapshot.configHash,

              // Traceability fields
              stopLevelId: risk.stopLevelId || undefined,
              targetLevelId: risk.targetLevelId || undefined,
              setupType: setup ? setup.setupType : undefined,
              triggerType: trigger ? trigger.triggerType : undefined,
              regimeType: regimeSnapshot.currentRegime ? regimeSnapshot.currentRegime : undefined,

              // Conviction fields
              convictionScore: conviction.score,
              convictionLevel: conviction.level,
              convictionFactors: conviction.factors as unknown as Record<string, number>,
            };

            // Log conviction score
            console.log(
              `[${symbol}] Signal ${signal.action} - Conviction: ${ConvictionCalculator.formatScore(conviction.score, conviction.level)} ` +
              `(${ConvictionCalculator.formatFactors(conviction.factors)})`,
            );

            this.emit('decision', signal);
          }
        }
      }
    } catch (error) {
      console.error(`LiveOrchestrator evaluation error at ${asOfTimeUTC.toISOString()}:`, (error as Error).message);
      this.emit('error', error);
    }
  }
}
