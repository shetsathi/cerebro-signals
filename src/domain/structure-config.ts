export class StructureConfig {
  constructor(
    readonly leftBars: number = 2,
    readonly rightBars: number = 2,
  ) {
    this.validate();
  }

  private validate(): void {
    if (this.leftBars < 1) {
      throw new Error(`Invalid leftBars: ${this.leftBars}. Must be >= 1.`);
    }
    if (this.rightBars < 1) {
      throw new Error(`Invalid rightBars: ${this.rightBars}. Must be >= 1.`);
    }
  }

  get totalBars(): number {
    return 1 + this.leftBars + this.rightBars;
  }

  toString(): string {
    return `StructureConfig(left=${this.leftBars}, right=${this.rightBars})`;
  }
}
