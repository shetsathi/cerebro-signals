/**
 * H2 SNAPSHOT RECORDER — Immutable Evaluation History
 *
 * Records evaluation snapshots without duplicating frozen engine logic.
 * Every snapshot is immutable and tied to a specific evaluation time.
 * Snapshots reference frozen Parts 1–6 results, do not copy them.
 */

import { H2SnapshotRecord } from './h2-contracts';

/**
 * SNAPSHOT STORAGE
 *
 * Immutable recording of all evaluations.
 * Can be replayed independently for verification.
 */
export interface SnapshotStore {
  addSnapshot(snapshot: H2SnapshotRecord): void;
  getSnapshots(): readonly H2SnapshotRecord[];
  getSnapshotAt(asOfTime: Date): H2SnapshotRecord | undefined;
  getSnapshotsBetween(startTime: Date, endTime: Date): H2SnapshotRecord[];
  size(): number;
  clear(): void;
}

/**
 * In-memory immutable snapshot store
 */
export class InMemorySnapshotStore implements SnapshotStore {
  private snapshots: H2SnapshotRecord[] = [];
  private readonly maxSnapshots: number;

  constructor(maxSnapshots: number = 50000) {
    this.maxSnapshots = maxSnapshots;
  }

  addSnapshot(snapshot: H2SnapshotRecord): void {
    if (this.snapshots.length >= this.maxSnapshots) {
      throw new Error(
        `Snapshot store full: ${this.snapshots.length} snapshots, max ${this.maxSnapshots}`,
      );
    }
    // Defensive copy to prevent external mutation
    this.snapshots.push(Object.freeze({ ...snapshot }));
  }

  getSnapshots(): readonly H2SnapshotRecord[] {
    return Object.freeze([...this.snapshots]);
  }

  getSnapshotAt(asOfTime: Date): H2SnapshotRecord | undefined {
    // Binary search for snapshot closest to asOfTime
    for (let i = this.snapshots.length - 1; i >= 0; i--) {
      if (this.snapshots[i].asOfTimeUTC <= asOfTime) {
        return this.snapshots[i];
      }
    }
    return undefined;
  }

  getSnapshotsBetween(startTime: Date, endTime: Date): H2SnapshotRecord[] {
    return this.snapshots.filter(
      s => s.asOfTimeUTC >= startTime && s.asOfTimeUTC <= endTime,
    );
  }

  size(): number {
    return this.snapshots.length;
  }

  clear(): void {
    this.snapshots = [];
  }
}

/**
 * SNAPSHOT AGGREGATOR
 *
 * Compute statistics from recorded snapshots.
 * Does NOT modify frozen logic.
 * Does NOT claim profitability (only records facts).
 */
export interface SnapshotStats {
  totalSnapshots: number;
  timeRange: {
    earliest: Date;
    latest: Date;
  };
  qualifyingSetups: number;
  rejectedSetups: number;
  tradePlansCount: number;
  setupsByOutcome: {
    qualified: number;
    rejected: number;
  };
  causalityStatus: {
    allVerified: boolean;
    violations: number;
  };
}

export function aggregateSnapshotStats(store: SnapshotStore): SnapshotStats {
  const snapshots = store.getSnapshots();

  if (snapshots.length === 0) {
    return {
      totalSnapshots: 0,
      timeRange: { earliest: new Date(), latest: new Date() },
      qualifyingSetups: 0,
      rejectedSetups: 0,
      tradePlansCount: 0,
      setupsByOutcome: { qualified: 0, rejected: 0 },
      causalityStatus: { allVerified: true, violations: 0 },
    };
  }

  const qualifyingSetups = snapshots.filter(s => s.outcome.qualifyingSetupFound).length;
  const rejectedSetups = snapshots.length - qualifyingSetups;
  const tradePlansCount = snapshots.filter(s => s.outcome.tradePlanGenerated).length;
  const causalityViolations = snapshots.filter(
    s => !s.causalityCertificate.allInputsBeforeOrAt,
  ).length;

  return {
    totalSnapshots: snapshots.length,
    timeRange: {
      earliest: snapshots[0].asOfTimeUTC,
      latest: snapshots[snapshots.length - 1].asOfTimeUTC,
    },
    qualifyingSetups,
    rejectedSetups,
    tradePlansCount,
    setupsByOutcome: { qualified: qualifyingSetups, rejected: rejectedSetups },
    causalityStatus: {
      allVerified: causalityViolations === 0,
      violations: causalityViolations,
    },
  };
}

/**
 * SNAPSHOT REPLAY
 *
 * Verify causality and determinism by replaying snapshots.
 */
export interface SnapshotReplayResult {
  sequentiallyValid: boolean;
  chronological: boolean;
  noCausalityViolations: boolean;
  allSnapshotsRecorded: boolean;
}

export function replaySnapshotValidity(store: SnapshotStore): SnapshotReplayResult {
  const snapshots = store.getSnapshots();

  if (snapshots.length === 0) {
    return {
      sequentiallyValid: true,
      chronological: true,
      noCausalityViolations: true,
      allSnapshotsRecorded: true,
    };
  }

  // Verify chronological order
  let chronological = true;
  for (let i = 1; i < snapshots.length; i++) {
    if (snapshots[i].asOfTimeUTC < snapshots[i - 1].asOfTimeUTC) {
      chronological = false;
      break;
    }
  }

  // Verify causality
  let noCausalityViolations = true;
  for (const snapshot of snapshots) {
    if (!snapshot.causalityCertificate.allInputsBeforeOrAt) {
      noCausalityViolations = false;
      break;
    }
  }

  // Verify all snapshots have required fields
  let allSnapshotsRecorded = true;
  for (const snapshot of snapshots) {
    if (!snapshot.recordId || !snapshot.asOfTimeUTC || !snapshot.causalityCertificate) {
      allSnapshotsRecorded = false;
      break;
    }
  }

  return {
    sequentiallyValid: chronological && noCausalityViolations && allSnapshotsRecorded,
    chronological,
    noCausalityViolations,
    allSnapshotsRecorded,
  };
}

/**
 * SNAPSHOT COMPARISON
 *
 * Compare two snapshot stores for determinism verification.
 */
export interface SnapshotComparisonResult {
  identical: boolean;
  snapshotCount: {
    store1: number;
    store2: number;
  };
  differences: {
    indexMismatch: number;
    outcomeMismatch: number;
    timestampMismatch: number;
  };
}

export function compareSnapshots(store1: SnapshotStore, store2: SnapshotStore): SnapshotComparisonResult {
  const snapshots1 = store1.getSnapshots();
  const snapshots2 = store2.getSnapshots();

  let indexMismatch = 0;
  let outcomeMismatch = 0;
  let timestampMismatch = 0;

  const minLength = Math.min(snapshots1.length, snapshots2.length);

  for (let i = 0; i < minLength; i++) {
    const s1 = snapshots1[i];
    const s2 = snapshots2[i];

    if (s1.recordId !== s2.recordId) {
      indexMismatch++;
    }

    if (
      s1.outcome.qualifyingSetupFound !== s2.outcome.qualifyingSetupFound ||
      s1.outcome.tradePlanGenerated !== s2.outcome.tradePlanGenerated
    ) {
      outcomeMismatch++;
    }

    if (s1.asOfTimeUTC.getTime() !== s2.asOfTimeUTC.getTime()) {
      timestampMismatch++;
    }
  }

  const identical =
    snapshots1.length === snapshots2.length &&
    indexMismatch === 0 &&
    outcomeMismatch === 0 &&
    timestampMismatch === 0;

  return {
    identical,
    snapshotCount: {
      store1: snapshots1.length,
      store2: snapshots2.length,
    },
    differences: {
      indexMismatch,
      outcomeMismatch,
      timestampMismatch,
    },
  };
}
