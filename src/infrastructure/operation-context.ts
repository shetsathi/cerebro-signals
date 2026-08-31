/**
 * OPERATION CONTEXT INFRASTRUCTURE
 *
 * Lightweight context tracking for distributed operations.
 * Provides correlation IDs and metadata propagation without global state.
 *
 * Design:
 * - Immutable context objects
 * - Unique operation IDs
 * - Optional metadata
 * - No global singleton (easy to test)
 * - No database dependency
 * - Intended for correlation in logs and error handling
 *
 * Usage:
 *   const ctx = OperationContext.create('acquisition', { symbol: 'NIFTY' });
 *   logger.setOperationId(ctx.operationId);
 *   // ... do work ...
 *   logger.info('Finished', ctx.getMetadata());
 */

/**
 * Generate a unique operation ID
 * Format: type-YYYYMMDDHHMMSS-RANDOM (e.g., acquisition-20260821120000-a7b3f1e9)
 */
function generateOperationId(type: string): string {
  const now = new Date();
  const dateTime = now.toISOString().replace(/[-:T.Z]/g, '').slice(0, 14);
  const random = Math.random().toString(16).slice(2, 10);
  return `${type}-${dateTime}-${random}`;
}

/**
 * Immutable operation context
 * Passed through function calls for correlation
 */
export class OperationContext {
  readonly operationId: string;
  readonly type: string;
  readonly startedAtUTC: Date;
  private readonly metadata: Record<string, unknown>;

  protected constructor(operationId: string, type: string, metadata: Record<string, unknown> = {}) {
    this.operationId = operationId;
    this.type = type;
    this.startedAtUTC = new Date();
    this.metadata = Object.freeze({ ...metadata });
  }

  /**
   * Create a new operation context
   * @param type - Operation type (e.g., 'acquisition', 'replay', 'validation')
   * @param metadata - Optional metadata to attach
   */
  static create(type: string, metadata: Record<string, unknown> = {}): OperationContext {
    const operationId = generateOperationId(type);
    return new OperationContext(operationId, type, metadata);
  }

  /**
   * Create from existing operation ID (for chaining/propagation)
   */
  static fromId(operationId: string, type: string, metadata: Record<string, unknown> = {}): OperationContext {
    return new OperationContext(operationId, type, metadata);
  }

  /**
   * Get all metadata attached to this context
   */
  getMetadata(): Record<string, unknown> {
    return { ...this.metadata };
  }

  /**
   * Get a specific metadata value
   */
  getMetadataValue(key: string): unknown {
    return this.metadata[key];
  }

  /**
   * Check if metadata key exists
   */
  hasMetadata(key: string): boolean {
    return key in this.metadata;
  }

  /**
   * Get elapsed time since operation start
   */
  getElapsedMs(): number {
    return Date.now() - this.startedAtUTC.getTime();
  }

  /**
   * Serialize for logging
   */
  toJSON(): {
    operationId: string;
    type: string;
    startedAtUTC: string;
    elapsedMs: number;
    metadata: Record<string, unknown>;
  } {
    return {
      operationId: this.operationId,
      type: this.type,
      startedAtUTC: this.startedAtUTC.toISOString(),
      elapsedMs: this.getElapsedMs(),
      metadata: this.getMetadata(),
    };
  }
}

/**
 * Batch operation context
 * For operations that process many items
 */
export class BatchOperationContext extends OperationContext {
  private processed: number = 0;
  private successful: number = 0;
  private failed: number = 0;
  private errors: Array<{ index: number; error: string }> = [];

  /**
   * Create a new batch operation context
   */
  static createBatch(
    type: string,
    totalItems: number,
    metadata: Record<string, unknown> = {},
  ): BatchOperationContext {
    const operationId = generateOperationId(`batch-${type}`);
    const ctx = new BatchOperationContext(operationId, type, { totalItems, ...metadata });
    return ctx;
  }

  protected constructor(operationId: string, type: string, metadata: Record<string, unknown> = {}) {
    super(operationId, type, metadata);
  }

  /**
   * Record processing of an item
   */
  recordProcessed(successful: boolean, error?: string): void {
    this.processed++;
    if (successful) {
      this.successful++;
    } else {
      this.failed++;
      if (error) {
        this.errors.push({ index: this.processed - 1, error });
      }
    }
  }

  /**
   * Get batch statistics
   */
  getStats(): {
    total: number;
    processed: number;
    successful: number;
    failed: number;
    successRate: number;
    errors: Array<{ index: number; error: string }>;
  } {
    const total = (this.getMetadataValue('totalItems') as number) || 0;
    return {
      total,
      processed: this.processed,
      successful: this.successful,
      failed: this.failed,
      successRate: this.processed > 0 ? (this.successful / this.processed) * 100 : 0,
      errors: [...this.errors],
    };
  }

  /**
   * Serialize for logging
   */
  override toJSON(): {
    operationId: string;
    type: string;
    startedAtUTC: string;
    elapsedMs: number;
    metadata: Record<string, unknown>;
    stats: {
      total: number;
      processed: number;
      successful: number;
      failed: number;
      successRate: number;
    };
  } {
    const parent = super.toJSON();
    const stats = this.getStats();
    return {
      ...parent,
      stats: {
        total: stats.total,
        processed: stats.processed,
        successful: stats.successful,
        failed: stats.failed,
        successRate: stats.successRate,
      },
    };
  }
}

/**
 * Request-scoped context (for API/concurrent scenarios)
 * Tracks a single request through the call stack
 */
export class RequestContext extends OperationContext {
  private startedAtMs: number = 0;
  private completedAtMs: number | null = null;

  /**
   * Create a new request context
   */
  static createRequest(metadata: Record<string, unknown> = {}): RequestContext {
    const operationId = generateOperationId('request');
    const ctx = new RequestContext(operationId, 'request', metadata);
    ctx.startedAtMs = performance.now();
    return ctx;
  }

  protected constructor(operationId: string, type: string, metadata: Record<string, unknown> = {}) {
    super(operationId, type, metadata);
  }

  /**
   * Mark request as completed
   */
  markCompleted(): void {
    this.completedAtMs = performance.now();
  }

  /**
   * Get total execution time (if completed)
   */
  getExecutionTimeMs(): number {
    if (this.completedAtMs === null) {
      return performance.now() - this.startedAtMs;
    }
    return this.completedAtMs - this.startedAtMs;
  }

  /**
   * Check if request is completed
   */
  isCompleted(): boolean {
    return this.completedAtMs !== null;
  }
}
