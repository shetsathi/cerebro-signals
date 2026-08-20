import { SwingPoint } from './swing-point';
import { StructureState, StructureType } from './structure-state';

export interface BOSEvent {
  candleCloseTimeUTC: Date;
  levelPrice: number;
  direction: 'bullish' | 'bearish';
}

export interface CHOCHEvent {
  candleCloseTimeUTC: Date;
  levelPrice: number;
  direction: 'bullish' | 'bearish';
}

export class StructureSnapshot {
  readonly asOfTimeUTC: Date;
  private readonly confirmedSwings: ReadonlyArray<SwingPoint>;
  private readonly structureState: StructureState;
  private readonly bosEvents: ReadonlyArray<BOSEvent>;
  private readonly chochEvents: ReadonlyArray<CHOCHEvent>;
  private sealed: boolean = false;

  constructor(
    asOfTimeUTC: Date,
    confirmedSwings: SwingPoint[] = [],
    structureState: StructureState = new StructureState(StructureType.UNKNOWN),
    bosEvents: BOSEvent[] = [],
    chochEvents: CHOCHEvent[] = [],
  ) {
    // Defensive copy of timestamp
    this.asOfTimeUTC = new Date(asOfTimeUTC.getTime());
    this.confirmedSwings = Object.freeze([...confirmedSwings]);
    this.structureState = structureState;
    this.bosEvents = Object.freeze([...bosEvents]);
    this.chochEvents = Object.freeze([...chochEvents]);
  }

  seal(): void {
    this.sealed = true;
  }

  isSealed(): boolean {
    return this.sealed;
  }

  getConfirmedSwings(): SwingPoint[] {
    return [...this.confirmedSwings];
  }

  getStructureState(): StructureState {
    return this.structureState;
  }

  getLatestSwingHigh(): SwingPoint | null {
    return this.structureState.latestSwingHigh;
  }

  getLatestSwingLow(): SwingPoint | null {
    return this.structureState.latestSwingLow;
  }

  getStructureType(): StructureType {
    return this.structureState.structureType;
  }

  getBOSEvents(): BOSEvent[] {
    return [...this.bosEvents];
  }

  getCHOCHEvents(): CHOCHEvent[] {
    return [...this.chochEvents];
  }

  toString(): string {
    const type = this.structureState.structureType;
    const swingCount = this.confirmedSwings.length;
    const bosCount = this.bosEvents.length;
    const chochCount = this.chochEvents.length;
    return `StructureSnapshot(${this.asOfTimeUTC.toISOString()}) [${type}, swings=${swingCount}, BOS=${bosCount}, CHOCH=${chochCount}]`;
  }
}
