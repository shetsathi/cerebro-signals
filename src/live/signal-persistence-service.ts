/**
 * Signal Persistence Service
 *
 * Converts LiveOrchestrator SignalOutput to persistent records.
 * Ensures immutability: original signal prices never overwritten.
 * Prevents duplicate signals (same decision_id).
 */

import { SignalRepository, SignalRecord } from '../persistence/signal-repository.interface';
import { SignalOutput } from './live-orchestrator';

export class SignalPersistenceService {
  constructor(private signalRepository: SignalRepository) {}

  /**
   * Persist a generated signal
   * Returns signal_id if successful, null if duplicate
   */
  async persistSignal(signal: SignalOutput): Promise<string | null> {
    try {
      // Check for duplicate (same decision_id)
      const existing = await this.signalRepository.getByDecisionId(signal.decision.decisionId);
      if (existing) {
        console.log(`Signal already persisted: ${signal.decision.decisionId}`);
        return null;
      }

      // Convert SignalOutput to SignalRecord
      const record: SignalRecord = {
        symbol: signal.symbol,
        decision_action: signal.action as 'LONG' | 'SHORT',
        decision_id: signal.decision.decisionId,
        trigger_id: signal.decision.riskIds[0],
        setup_id: signal.risk.setupId,
        risk_ids: Array.from(signal.decision.riskIds), // Convert readonly to mutable
        entry_price: signal.entryPrice,
        stop_loss_price: signal.stopPrice,
        target_price: signal.targetPrice || undefined,
        risk_amount: signal.risk.risk || undefined,
        reward_amount: signal.risk.reward || undefined,
        risk_reward_ratio: signal.riskRewardRatio || undefined,
        evaluation_time_utc: signal.evaluationTimeUTC,
        knowledge_time_utc: signal.knowledgeTimeUTC,
        ruleset_version: signal.rulesetVersion,
        config_hash: signal.configHash,
        status: 'GENERATED',

        // Traceability fields
        stop_level_id: signal.stopLevelId,
        target_level_id: signal.targetLevelId,
        setup_type: signal.setupType,
        trigger_type: signal.triggerType,
        regime_type: signal.regimeType,
      };

      // Persist
      const savedSignal = await this.signalRepository.save(record);

      console.log(`Signal persisted: ${savedSignal.signal_id} - ${signal.symbol} ${signal.action}`);
      return savedSignal.signal_id;
    } catch (error) {
      console.error('Failed to persist signal:', (error as Error).message);
      throw error;
    }
  }
}
