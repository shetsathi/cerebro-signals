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

      // Part 4: Regime Engine
      const regimeSnapshot = RegimeEngine.getRegimeSnapshot(
        allCandlesUpTo,
        asOfTimeUTC,
        symbol,
        this.config.structureConfig,
      );

      // Part 5: Level & Location Engine
      const locationSnapshot = LevelEngine.getLocationSnapshot(
        allCandlesUpTo,
        structureSnapshot,
        asOfTimeUTC,
        symbol,
        this.config.levelConfig,
      );

      // Part 6: Setup Qualification Engine
      const setupSnapshot = SetupEngine.getSetupSnapshot(
        locationSnapshot,
        structureSnapshot,
        asOfTimeUTC,
        symbol,
        this.config.setupConfig,
      );

      // Part 7: Trigger Engine
      const triggerSnapshot = TriggerEngine.getTriggerSnapshot(
        setupSnapshot,
        locationSnapshot,
        closedCandle,
        asOfTimeUTC,
        this.config.triggerConfig,
      );

      // Part 8: Risk Engine
      const riskSnapshot = RiskEngine.getRiskSnapshot(
        triggerSnapshot,
        locationSnapshot,
        asOfTimeUTC,
        this.config.riskConfig,
      );

      // Part 9: Decision Engine
      const decisionSnapshot = DecisionEngine.getDecisionSnapshot(
        riskSnapshot,
        asOfTimeUTC,
        this.config.decisionConfig,
      );

      // Extract actionable decisions (LONG/SHORT only, not WAIT)
      const longDecisions = decisionSnapshot.getLongDecisions();
      const shortDecisions = decisionSnapshot.getShortDecisions();

      // Emit each actionable decision as a signal
      for (const decision of [...longDecisions, ...shortDecisions]) {
        // Find corresponding risk to extract prices
        const risks = riskSnapshot.getAllRisks().filter(r => decision.riskIds.includes(r.riskId));

        for (const risk of risks) {
          if (risk.status === RiskStatus.VALID) {
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
            };

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
