import { SwingPoint } from './swing-point';

export enum StructureType {
  BULLISH = 'BULLISH',
  BEARISH = 'BEARISH',
  NEUTRAL = 'NEUTRAL',
  UNKNOWN = 'UNKNOWN',
}

export class StructureState {
  constructor(
    readonly structureType: StructureType,
    readonly latestSwingHigh: SwingPoint | null = null,
    readonly latestSwingLow: SwingPoint | null = null,
    readonly previousSwingHigh: SwingPoint | null = null,
    readonly previousSwingLow: SwingPoint | null = null,
  ) {}

  isKnown(): boolean {
    return this.structureType !== StructureType.UNKNOWN;
  }

  toString(): string {
    const high = this.latestSwingHigh ? `${this.latestSwingHigh.price.toFixed(2)}` : 'none';
    const low = this.latestSwingLow ? `${this.latestSwingLow.price.toFixed(2)}` : 'none';
    return `${this.structureType}(high=${high}, low=${low})`;
  }
}
