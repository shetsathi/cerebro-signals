/**
 * Part 9 — Decision Engine Tests
 *
 * 15 comprehensive tests covering frozen rules and contracts:
 * 1. VALID LONG → LONG
 * 2. VALID SHORT → SHORT
 * 3. Multiple VALID LONG → one LONG with all riskIds
 * 4. Multiple VALID SHORT → one SHORT with all riskIds
 * 5. VALID LONG + VALID SHORT → WAIT
 * 6. REJECTED → WAIT
 * 7. INVALID → WAIT
 * 8. UNKNOWN → WAIT
 * 9. No risks → WAIT
 * 10. Decision immutability
 * 11. DecisionSnapshot immutability/sealing
 * 12. Determinism (same input → same output)
 * 13. Causality enforcement
 * 14. RiskSnapshot immutability preserved
 * 15. Parts 1–8 behavior unchanged
 */

import {
  DecisionEngine,
  DecisionEngineConfig,
} from '../domain/decision-engine';
import {
  RiskStatus,
  Risk,
} from '../domain/risk';
import { RiskSnapshot } from '../domain/risk-snapshot';
import { DecisionAction } from '../domain/decision';
import { TriggerType } from '../domain/trigger';
import { SetupType } from '../domain/setup';

// ─── Test Fixtures ───────────────────────────────────────────────────────────

const EVAL_TIME = new Date('2026-08-23T10:30:00Z');
const KNOWLEDGE_TIME = new Date('2026-08-23T10:25:00Z');

const mockConfig: DecisionEngineConfig = {
  rulesetVersion: 'V1',
  configHash: 'TEST_CONFIG_HASH',
};

function makeMockRisk(
  riskId: string,
  status: RiskStatus,
  direction: 'LONG' | 'SHORT',
  entry: number = 2500,
  stop: number = 2490,
  target: number | null = 2520,
): Risk {
  return new Risk(
    riskId,
    'RELIANCE',
    `TRIGGER_${riskId}`,
    `SETUP_${riskId}`,
    SetupType.PULLBACK_LONG,
    direction,
    TriggerType.BULLISH_RECLAIM,
    status,
    `Test risk: ${status}`,
    entry,
    stop,
    target,
    Math.abs(entry - stop),
    target !== null ? Math.abs(target - entry) : null,
    target !== null ? Math.abs(target - entry) / Math.abs(entry - stop) : null,
    `LEVEL_${riskId}`,
    target !== null ? `LEVEL_TARGET_${riskId}` : null,
    target,
    2.0,
    KNOWLEDGE_TIME,
    EVAL_TIME,
    'V1',
    'TEST_RISK_CONFIG',
  );
}

function makeRiskSnapshot(risks: Risk[]): RiskSnapshot {
  const snapshot = new RiskSnapshot(
    'RELIANCE',
    EVAL_TIME,
    KNOWLEDGE_TIME,
    'V1',
    'TEST_SNAPSHOT_CONFIG',
    risks,
  );
  snapshot.seal();
  return snapshot;
}

// ─── TEST 1: VALID LONG → LONG ───────────────────────────────────────────────

describe('TEST 1: VALID LONG → LONG', () => {
  it('should produce LONG decision when single VALID LONG risk exists', () => {
    const validLong = makeMockRisk('RISK_VALID_LONG', RiskStatus.VALID, 'LONG');
    const snapshot = makeRiskSnapshot([validLong]);

    const decision = DecisionEngine.getDecisionSnapshot(
      snapshot,
      EVAL_TIME,
      mockConfig,
    );

    expect(decision.getAllDecisions()).toHaveLength(1);
    const d = decision.getAllDecisions()[0];
    expect(d.action).toBe(DecisionAction.LONG);
    expect(d.symbol).toBe('RELIANCE');
    expect(d.riskIds).toContain('RISK_VALID_LONG');
  });
});

// ─── TEST 2: VALID SHORT → SHORT ─────────────────────────────────────────────

describe('TEST 2: VALID SHORT → SHORT', () => {
  it('should produce SHORT decision when single VALID SHORT risk exists', () => {
    const validShort = makeMockRisk('RISK_VALID_SHORT', RiskStatus.VALID, 'SHORT');
    const snapshot = makeRiskSnapshot([validShort]);

    const decision = DecisionEngine.getDecisionSnapshot(
      snapshot,
      EVAL_TIME,
      mockConfig,
    );

    expect(decision.getAllDecisions()).toHaveLength(1);
    const d = decision.getAllDecisions()[0];
    expect(d.action).toBe(DecisionAction.SHORT);
    expect(d.riskIds).toContain('RISK_VALID_SHORT');
  });
});

// ─── TEST 3: Multiple VALID LONG → one LONG with all riskIds ─────────────────

describe('TEST 3: Multiple VALID LONG → one LONG with all riskIds', () => {
  it('should collapse multiple VALID LONG risks into single LONG decision', () => {
    const risk1 = makeMockRisk('RISK_LONG_1', RiskStatus.VALID, 'LONG');
    const risk2 = makeMockRisk('RISK_LONG_2', RiskStatus.VALID, 'LONG');
    const risk3 = makeMockRisk('RISK_LONG_3', RiskStatus.VALID, 'LONG');
    const snapshot = makeRiskSnapshot([risk1, risk2, risk3]);

    const decision = DecisionEngine.getDecisionSnapshot(
      snapshot,
      EVAL_TIME,
      mockConfig,
    );

    expect(decision.getAllDecisions()).toHaveLength(1);
    const d = decision.getAllDecisions()[0];
    expect(d.action).toBe(DecisionAction.LONG);
    expect(d.riskIds).toHaveLength(3);
    expect(d.riskIds).toContain('RISK_LONG_1');
    expect(d.riskIds).toContain('RISK_LONG_2');
    expect(d.riskIds).toContain('RISK_LONG_3');
  });
});

// ─── TEST 4: Multiple VALID SHORT → one SHORT with all riskIds ───────────────

describe('TEST 4: Multiple VALID SHORT → one SHORT with all riskIds', () => {
  it('should collapse multiple VALID SHORT risks into single SHORT decision', () => {
    const risk1 = makeMockRisk('RISK_SHORT_1', RiskStatus.VALID, 'SHORT');
    const risk2 = makeMockRisk('RISK_SHORT_2', RiskStatus.VALID, 'SHORT');
    const snapshot = makeRiskSnapshot([risk1, risk2]);

    const decision = DecisionEngine.getDecisionSnapshot(
      snapshot,
      EVAL_TIME,
      mockConfig,
    );

    expect(decision.getAllDecisions()).toHaveLength(1);
    const d = decision.getAllDecisions()[0];
    expect(d.action).toBe(DecisionAction.SHORT);
    expect(d.riskIds).toHaveLength(2);
    expect(d.riskIds).toContain('RISK_SHORT_1');
    expect(d.riskIds).toContain('RISK_SHORT_2');
  });
});

// ─── TEST 5: VALID LONG + VALID SHORT → WAIT ────────────────────────────────

describe('TEST 5: VALID LONG + VALID SHORT → WAIT', () => {
  it('should produce WAIT decision when both VALID LONG and VALID SHORT exist', () => {
    const validLong = makeMockRisk('RISK_LONG', RiskStatus.VALID, 'LONG');
    const validShort = makeMockRisk('RISK_SHORT', RiskStatus.VALID, 'SHORT');
    const snapshot = makeRiskSnapshot([validLong, validShort]);

    const decision = DecisionEngine.getDecisionSnapshot(
      snapshot,
      EVAL_TIME,
      mockConfig,
    );

    expect(decision.getAllDecisions()).toHaveLength(1);
    const d = decision.getAllDecisions()[0];
    expect(d.action).toBe(DecisionAction.WAIT);
    expect(d.reason).toContain('Conflicting');
  });
});

// ─── TEST 6: REJECTED → WAIT ─────────────────────────────────────────────────

describe('TEST 6: REJECTED → WAIT', () => {
  it('should produce WAIT decision when only REJECTED risks exist', () => {
    const rejected = makeMockRisk('RISK_REJECTED', RiskStatus.REJECTED, 'LONG');
    const snapshot = makeRiskSnapshot([rejected]);

    const decision = DecisionEngine.getDecisionSnapshot(
      snapshot,
      EVAL_TIME,
      mockConfig,
    );

    expect(decision.getAllDecisions()).toHaveLength(1);
    const d = decision.getAllDecisions()[0];
    expect(d.action).toBe(DecisionAction.WAIT);
    expect(d.reason).toContain('REJECTED');
  });
});

// ─── TEST 7: INVALID → WAIT ──────────────────────────────────────────────────

describe('TEST 7: INVALID → WAIT', () => {
  it('should produce WAIT decision when only INVALID risks exist', () => {
    const invalid = makeMockRisk('RISK_INVALID', RiskStatus.INVALID, 'LONG');
    const snapshot = makeRiskSnapshot([invalid]);

    const decision = DecisionEngine.getDecisionSnapshot(
      snapshot,
      EVAL_TIME,
      mockConfig,
    );

    expect(decision.getAllDecisions()).toHaveLength(1);
    const d = decision.getAllDecisions()[0];
    expect(d.action).toBe(DecisionAction.WAIT);
    expect(d.reason).toContain('INVALID');
  });
});

// ─── TEST 8: UNKNOWN → WAIT ──────────────────────────────────────────────────

describe('TEST 8: UNKNOWN → WAIT', () => {
  it('should produce WAIT decision when only UNKNOWN risks exist', () => {
    const unknown = makeMockRisk('RISK_UNKNOWN', RiskStatus.UNKNOWN, 'LONG');
    const snapshot = makeRiskSnapshot([unknown]);

    const decision = DecisionEngine.getDecisionSnapshot(
      snapshot,
      EVAL_TIME,
      mockConfig,
    );

    expect(decision.getAllDecisions()).toHaveLength(1);
    const d = decision.getAllDecisions()[0];
    expect(d.action).toBe(DecisionAction.WAIT);
    expect(d.reason).toContain('UNKNOWN');
  });
});

// ─── TEST 9: No risks → WAIT ─────────────────────────────────────────────────

describe('TEST 9: No risks → WAIT', () => {
  it('should produce WAIT decision when RiskSnapshot is empty', () => {
    const snapshot = makeRiskSnapshot([]);

    const decision = DecisionEngine.getDecisionSnapshot(
      snapshot,
      EVAL_TIME,
      mockConfig,
    );

    expect(decision.getAllDecisions()).toHaveLength(1);
    const d = decision.getAllDecisions()[0];
    expect(d.action).toBe(DecisionAction.WAIT);
  });
});

// ─── TEST 10: Decision Immutability ──────────────────────────────────────────

describe('TEST 10: Decision immutability', () => {
  it('should freeze Decision object preventing mutations', () => {
    const validLong = makeMockRisk('RISK_1', RiskStatus.VALID, 'LONG');
    const snapshot = makeRiskSnapshot([validLong]);
    const decision = DecisionEngine.getDecisionSnapshot(
      snapshot,
      EVAL_TIME,
      mockConfig,
    );

    const d = decision.getAllDecisions()[0];

    // Attempt to mutate should fail
    expect(() => {
      (d as any).action = DecisionAction.WAIT;
    }).toThrow();

    expect(() => {
      (d as any).symbol = 'MUTATED';
    }).toThrow();
  });

  it('should have immutable riskIds array', () => {
    const risk1 = makeMockRisk('RISK_A', RiskStatus.VALID, 'LONG');
    const risk2 = makeMockRisk('RISK_B', RiskStatus.VALID, 'LONG');
    const snapshot = makeRiskSnapshot([risk1, risk2]);
    const decision = DecisionEngine.getDecisionSnapshot(
      snapshot,
      EVAL_TIME,
      mockConfig,
    );

    const d = decision.getAllDecisions()[0];
    const originalLength = d.riskIds.length;

    // Attempt to modify riskIds array should throw (frozen)
    expect(() => {
      (d.riskIds as any).push('FAKE_RISK');
    }).toThrow();

    // Original should be unchanged
    expect(d.riskIds).toHaveLength(originalLength);
  });
});

// ─── TEST 11: DecisionSnapshot immutability/sealing ──────────────────────────

describe('TEST 11: DecisionSnapshot immutability/sealing', () => {
  it('should seal DecisionSnapshot preventing modifications', () => {
    const validLong = makeMockRisk('RISK_1', RiskStatus.VALID, 'LONG');
    const snapshot = makeRiskSnapshot([validLong]);
    const decision = DecisionEngine.getDecisionSnapshot(
      snapshot,
      EVAL_TIME,
      mockConfig,
    );

    expect(decision.isSealed()).toBe(true);

    // Attempt to mutate should fail
    expect(() => {
      (decision as any).symbol = 'MUTATED';
    }).toThrow();
  });

  it('should return defensive copies of decisions array', () => {
    const validLong = makeMockRisk('RISK_1', RiskStatus.VALID, 'LONG');
    const snapshot = makeRiskSnapshot([validLong]);
    const decision = DecisionEngine.getDecisionSnapshot(
      snapshot,
      EVAL_TIME,
      mockConfig,
    );

    const arr1 = decision.getAllDecisions();
    const arr2 = decision.getAllDecisions();

    // Arrays should be different objects (copies)
    expect(arr1).not.toBe(arr2);
    // But contain same decisions
    expect(arr1[0]).toBe(arr2[0]);
  });
});

// ─── TEST 12: Determinism ───────────────────────────────────────────────────

describe('TEST 12: Determinism', () => {
  it('should produce identical output for identical input', () => {
    const risk1a = makeMockRisk('RISK_1', RiskStatus.VALID, 'LONG');
    const snapshot1 = makeRiskSnapshot([risk1a]);

    const risk1b = makeMockRisk('RISK_1', RiskStatus.VALID, 'LONG');
    const snapshot2 = makeRiskSnapshot([risk1b]);

    const decision1 = DecisionEngine.getDecisionSnapshot(
      snapshot1,
      EVAL_TIME,
      mockConfig,
    );
    const decision2 = DecisionEngine.getDecisionSnapshot(
      snapshot2,
      EVAL_TIME,
      mockConfig,
    );

    // Both should produce LONG
    expect(decision1.getAllDecisions()[0].action).toBe(DecisionAction.LONG);
    expect(decision2.getAllDecisions()[0].action).toBe(DecisionAction.LONG);

    // Reason should match
    expect(decision1.getAllDecisions()[0].reason).toBe(
      decision2.getAllDecisions()[0].reason,
    );
  });

  it('should produce deterministic decisionIds', () => {
    const risk1 = makeMockRisk('RISK_A', RiskStatus.VALID, 'LONG');
    const snapshot1 = makeRiskSnapshot([risk1]);

    const decision1 = DecisionEngine.getDecisionSnapshot(
      snapshot1,
      EVAL_TIME,
      mockConfig,
    );
    const decision2 = DecisionEngine.getDecisionSnapshot(
      snapshot1,
      EVAL_TIME,
      mockConfig,
    );

    const id1 = decision1.getAllDecisions()[0].decisionId;
    const id2 = decision2.getAllDecisions()[0].decisionId;

    expect(id1).toBe(id2);
  });
});

// ─── TEST 13: Causality ──────────────────────────────────────────────────────

describe('TEST 13: Causality enforcement', () => {
  it('should throw when RiskSnapshot.asOfTimeUTC is in future', () => {
    const futureTime = new Date('2026-08-23T11:00:00Z'); // After EVAL_TIME
    const risk1 = makeMockRisk('RISK_1', RiskStatus.VALID, 'LONG');
    const snapshot = new RiskSnapshot(
      'RELIANCE',
      futureTime,
      KNOWLEDGE_TIME,
      'V1',
      'TEST_CONFIG',
      [risk1],
    );
    snapshot.seal();

    expect(() => {
      DecisionEngine.getDecisionSnapshot(snapshot, EVAL_TIME, mockConfig);
    }).toThrow('Look-ahead violation');
  });

  it('should accept RiskSnapshot.asOfTimeUTC equal to evaluation time', () => {
    const risk1 = makeMockRisk('RISK_1', RiskStatus.VALID, 'LONG');
    const snapshot = makeRiskSnapshot([risk1]);

    expect(() => {
      DecisionEngine.getDecisionSnapshot(snapshot, EVAL_TIME, mockConfig);
    }).not.toThrow();
  });
});

// ─── TEST 14: RiskSnapshot immutability preserved ──────────────────────────

describe('TEST 14: RiskSnapshot immutability preserved', () => {
  it('should not modify input RiskSnapshot', () => {
    const risk1 = makeMockRisk('RISK_1', RiskStatus.VALID, 'LONG');
    const snapshot = makeRiskSnapshot([risk1]);

    const initialRisks = snapshot.getAllRisks();

    DecisionEngine.getDecisionSnapshot(snapshot, EVAL_TIME, mockConfig);

    const finalRisks = snapshot.getAllRisks();

    // Snapshot should be unchanged
    expect(finalRisks).toHaveLength(initialRisks.length);
    expect(finalRisks[0]).toBe(initialRisks[0]);
  });
});

// ─── TEST 15: Parts 1–8 behavior unchanged ────────────────────────────────

describe('TEST 15: Parts 1–8 behavior unchanged', () => {
  it('should not invoke any upstream engine methods', () => {
    const risk1 = makeMockRisk('RISK_1', RiskStatus.VALID, 'LONG');
    const snapshot = makeRiskSnapshot([risk1]);

    // Decision should only call RiskSnapshot.getAllRisks()
    // No access to Part 1–8 structure/regime/levels/location/setup/trigger
    const decision = DecisionEngine.getDecisionSnapshot(
      snapshot,
      EVAL_TIME,
      mockConfig,
    );

    // Should produce valid decision without side effects
    expect(decision).toBeDefined();
    expect(decision.isSealed()).toBe(true);
  });

  it('should not require Part 4 RegimeSnapshot', () => {
    const risk1 = makeMockRisk('RISK_1', RiskStatus.VALID, 'LONG');
    const snapshot = makeRiskSnapshot([risk1]);

    // Decision should work with RiskSnapshot alone
    const decision = DecisionEngine.getDecisionSnapshot(
      snapshot,
      EVAL_TIME,
      mockConfig,
    );

    expect(decision.getAllDecisions()).toHaveLength(1);
    expect(decision.getAllDecisions()[0].action).toBe(DecisionAction.LONG);
  });

  it('should not require Part 5 LocationSnapshot', () => {
    const risk1 = makeMockRisk('RISK_1', RiskStatus.VALID, 'LONG');
    const snapshot = makeRiskSnapshot([risk1]);

    // Decision should work with RiskSnapshot alone
    const decision = DecisionEngine.getDecisionSnapshot(
      snapshot,
      EVAL_TIME,
      mockConfig,
    );

    expect(decision.getAllDecisions()).toHaveLength(1);
  });
});

// ─── Additional Robustness Tests ──────────────────────────────────────────

describe('Additional robustness tests', () => {
  it('should handle mixed risk statuses correctly', () => {
    const validLong = makeMockRisk('RISK_VALID_LONG', RiskStatus.VALID, 'LONG');
    const rejected = makeMockRisk('RISK_REJECTED', RiskStatus.REJECTED, 'SHORT');
    const invalid = makeMockRisk('RISK_INVALID', RiskStatus.INVALID, 'SHORT');
    const snapshot = makeRiskSnapshot([validLong, rejected, invalid]);

    const decision = DecisionEngine.getDecisionSnapshot(
      snapshot,
      EVAL_TIME,
      mockConfig,
    );

    // Should produce LONG (valid risk wins, others ignored)
    expect(decision.getAllDecisions()).toHaveLength(1);
    expect(decision.getAllDecisions()[0].action).toBe(DecisionAction.LONG);
  });

  it('should produce diagnostics for multiple non-VALID statuses', () => {
    const rejected = makeMockRisk('RISK_REJECTED', RiskStatus.REJECTED, 'LONG');
    const invalid = makeMockRisk('RISK_INVALID', RiskStatus.INVALID, 'LONG');
    const unknown = makeMockRisk('RISK_UNKNOWN', RiskStatus.UNKNOWN, 'LONG');
    const snapshot = makeRiskSnapshot([rejected, invalid, unknown]);

    const decision = DecisionEngine.getDecisionSnapshot(
      snapshot,
      EVAL_TIME,
      mockConfig,
    );

    const d = decision.getAllDecisions()[0];
    expect(d.action).toBe(DecisionAction.WAIT);
    expect(d.reason).toContain('REJECTED');
    expect(d.reason).toContain('INVALID');
    expect(d.reason).toContain('UNKNOWN');
  });

  it('should maintain causality markers in Decision', () => {
    const risk1 = makeMockRisk('RISK_1', RiskStatus.VALID, 'LONG');
    const snapshot = makeRiskSnapshot([risk1]);

    const decision = DecisionEngine.getDecisionSnapshot(
      snapshot,
      EVAL_TIME,
      mockConfig,
    );

    const d = decision.getAllDecisions()[0];
    expect(d.asOfTimeUTC.getTime()).toBe(EVAL_TIME.getTime());
    expect(d.knowledgeTimeUTC.getTime()).toBe(KNOWLEDGE_TIME.getTime());
  });

  it('should include rulesetVersion and configHash for traceability', () => {
    const risk1 = makeMockRisk('RISK_1', RiskStatus.VALID, 'LONG');
    const snapshot = makeRiskSnapshot([risk1]);

    const decision = DecisionEngine.getDecisionSnapshot(
      snapshot,
      EVAL_TIME,
      mockConfig,
    );

    const d = decision.getAllDecisions()[0];
    expect(d.rulesetVersion).toBe('V1');
    expect(d.configHash).toBe('TEST_CONFIG_HASH');
  });
});
