import { OperationContext, BatchOperationContext, RequestContext } from '../../infrastructure/operation-context';

describe('OperationContext', () => {
  it('should create operation context with type', () => {
    const ctx = OperationContext.create('acquisition');
    expect(ctx.operationId).toBeDefined();
    expect(ctx.type).toBe('acquisition');
    expect(ctx.startedAtUTC).toBeInstanceOf(Date);
  });

  it('should generate unique operation IDs', () => {
    const ctx1 = OperationContext.create('test');
    const ctx2 = OperationContext.create('test');
    expect(ctx1.operationId).not.toBe(ctx2.operationId);
  });

  it('should include type in operation ID', () => {
    const ctx = OperationContext.create('replay');
    expect(ctx.operationId).toContain('replay-');
  });

  it('should include timestamp in operation ID', () => {
    const ctx = OperationContext.create('validation');
    // Operation ID format: type-YYYYMMDDHHMMSS-random
    expect(ctx.operationId).toMatch(/validation-\d{14}-/);
  });

  it('should store metadata', () => {
    const metadata = { symbol: 'NIFTY', version: '1.2.3' };
    const ctx = OperationContext.create('test', metadata);
    expect(ctx.getMetadata()).toEqual(metadata);
  });

  it('should get specific metadata value', () => {
    const ctx = OperationContext.create('test', { key1: 'value1', key2: 'value2' });
    expect(ctx.getMetadataValue('key1')).toBe('value1');
    expect(ctx.getMetadataValue('key2')).toBe('value2');
  });

  it('should check if metadata exists', () => {
    const ctx = OperationContext.create('test', { present: 'yes' });
    expect(ctx.hasMetadata('present')).toBe(true);
    expect(ctx.hasMetadata('absent')).toBe(false);
  });

  it('should have immutable metadata', () => {
    const metadata = { mutable: 'yes' };
    const ctx = OperationContext.create('test', metadata);
    const retrieved = ctx.getMetadata();
    retrieved.mutable = 'no';
    expect(ctx.getMetadataValue('mutable')).toBe('yes');
  });

  it('should calculate elapsed time', () => {
    const ctx = OperationContext.create('test');
    expect(ctx.getElapsedMs()).toBeGreaterThanOrEqual(0);
  });

  it('should increase elapsed time over multiple calls', (done) => {
    const ctx = OperationContext.create('test');
    const time1 = ctx.getElapsedMs();
    setTimeout(() => {
      const time2 = ctx.getElapsedMs();
      expect(time2).toBeGreaterThan(time1);
      done();
    }, 10);
  });

  it('should serialize to JSON', () => {
    const ctx = OperationContext.create('test', { key: 'value' });
    const json = ctx.toJSON();
    expect(json.operationId).toBe(ctx.operationId);
    expect(json.type).toBe('test');
    expect(json.startedAtUTC).toBeDefined();
    expect(json.elapsedMs).toBeGreaterThanOrEqual(0);
    expect(json.metadata).toEqual({ key: 'value' });
  });

  it('should create from existing operation ID', () => {
    const opId = 'custom-op-id-123';
    const ctx = OperationContext.fromId(opId, 'tracking', { data: 'value' });
    expect(ctx.operationId).toBe(opId);
    expect(ctx.type).toBe('tracking');
    expect(ctx.getMetadataValue('data')).toBe('value');
  });

  it('should handle metadata-less creation', () => {
    const ctx = OperationContext.create('test');
    expect(ctx.getMetadata()).toEqual({});
  });

  it('should preserve metadata types', () => {
    const metadata = {
      count: 100,
      rate: 3.14,
      active: true,
      items: [1, 2, 3],
      nested: { key: 'value' },
    };
    const ctx = OperationContext.create('test', metadata);
    const retrieved = ctx.getMetadata();
    expect(retrieved.count).toBe(100);
    expect(retrieved.rate).toBe(3.14);
    expect(retrieved.active).toBe(true);
    expect(retrieved.items).toEqual([1, 2, 3]);
    expect(retrieved.nested).toEqual({ key: 'value' });
  });
});

describe('BatchOperationContext', () => {
  it('should create batch operation', () => {
    const ctx = BatchOperationContext.createBatch('import', 1000);
    expect(ctx.operationId).toBeDefined();
    expect(ctx.type).toBe('import');
    expect(ctx.operationId).toContain('batch-import');
    expect(ctx.getMetadataValue('totalItems')).toBe(1000);
  });

  it('should track batch statistics', () => {
    const ctx = BatchOperationContext.createBatch('import', 10);
    ctx.recordProcessed(true);
    ctx.recordProcessed(true);
    ctx.recordProcessed(false, 'Validation failed');

    const stats = ctx.getStats();
    expect(stats.total).toBe(10);
    expect(stats.processed).toBe(3);
    expect(stats.successful).toBe(2);
    expect(stats.failed).toBe(1);
    expect(stats.successRate).toBeCloseTo(66.67, 1);
  });

  it('should track error details', () => {
    const ctx = BatchOperationContext.createBatch('import', 5);
    ctx.recordProcessed(true);
    ctx.recordProcessed(false, 'Error 1');
    ctx.recordProcessed(false, 'Error 2');

    const stats = ctx.getStats();
    expect(stats.errors).toHaveLength(2);
    expect(stats.errors[0]).toEqual({ index: 1, error: 'Error 1' });
    expect(stats.errors[1]).toEqual({ index: 2, error: 'Error 2' });
  });

  it('should calculate success rate correctly', () => {
    const ctx = BatchOperationContext.createBatch('test', 100);
    for (let i = 0; i < 50; i++) ctx.recordProcessed(true);
    for (let i = 0; i < 25; i++) ctx.recordProcessed(false);

    const stats = ctx.getStats();
    expect(stats.successRate).toBeCloseTo(66.67, 1);
  });

  it('should handle 100% success', () => {
    const ctx = BatchOperationContext.createBatch('test', 10);
    for (let i = 0; i < 10; i++) ctx.recordProcessed(true);

    const stats = ctx.getStats();
    expect(stats.successRate).toBe(100);
    expect(stats.failed).toBe(0);
  });

  it('should handle all failures', () => {
    const ctx = BatchOperationContext.createBatch('test', 10);
    for (let i = 0; i < 10; i++) ctx.recordProcessed(false);

    const stats = ctx.getStats();
    expect(stats.successRate).toBe(0);
    expect(stats.failed).toBe(10);
  });

  it('should serialize batch stats to JSON', () => {
    const ctx = BatchOperationContext.createBatch('import', 100);
    ctx.recordProcessed(true);
    ctx.recordProcessed(true);
    ctx.recordProcessed(false);

    const json = ctx.toJSON();
    expect(json.stats).toBeDefined();
    expect(json.stats.total).toBe(100);
    expect(json.stats.processed).toBe(3);
    expect(json.stats.successful).toBe(2);
    expect(json.stats.failed).toBe(1);
  });

  it('should handle batches with no metadata', () => {
    const ctx = BatchOperationContext.createBatch('test', 5);
    const stats = ctx.getStats();
    expect(stats.total).toBe(5);
    expect(stats.processed).toBe(0);
  });

  it('should include metadata in batch operation', () => {
    const ctx = BatchOperationContext.createBatch('import', 100, { source: 'csv', version: '1.0' });
    expect(ctx.getMetadataValue('source')).toBe('csv');
    expect(ctx.getMetadataValue('version')).toBe('1.0');
  });
});

describe('RequestContext', () => {
  it('should create request context', () => {
    const ctx = RequestContext.createRequest({ userId: 123 });
    expect(ctx.operationId).toBeDefined();
    expect(ctx.type).toBe('request');
    expect(ctx.isCompleted()).toBe(false);
  });

  it('should mark request as completed', () => {
    const ctx = RequestContext.createRequest();
    expect(ctx.isCompleted()).toBe(false);
    ctx.markCompleted();
    expect(ctx.isCompleted()).toBe(true);
  });

  it('should calculate execution time', (done) => {
    const ctx = RequestContext.createRequest();
    setTimeout(() => {
      ctx.markCompleted();
      const time = ctx.getExecutionTimeMs();
      expect(time).toBeGreaterThanOrEqual(10);
      done();
    }, 10);
  });

  it('should return current time if not completed', () => {
    const ctx = RequestContext.createRequest();
    const time1 = ctx.getExecutionTimeMs();
    expect(time1).toBeGreaterThanOrEqual(0);
  });

  it('should preserve execution time after completion', (done) => {
    const ctx = RequestContext.createRequest();
    setTimeout(() => {
      ctx.markCompleted();
      const time1 = ctx.getExecutionTimeMs();
      setTimeout(() => {
        const time2 = ctx.getExecutionTimeMs();
        expect(time2).toBe(time1);
        done();
      }, 10);
    }, 20);
  });

  it('should include metadata in request context', () => {
    const metadata = { endpoint: '/api/data', method: 'GET', userId: 456 };
    const ctx = RequestContext.createRequest(metadata);
    expect(ctx.getMetadata()).toEqual(metadata);
  });

  it('should serialize to JSON', () => {
    const ctx = RequestContext.createRequest({ endpoint: '/api' });
    const json = ctx.toJSON();
    expect(json.type).toBe('request');
    expect(json.elapsedMs).toBeDefined();
    expect(json.metadata).toEqual({ endpoint: '/api' });
  });
});

describe('Operation ID format', () => {
  it('should follow expected format', () => {
    const ctx = OperationContext.create('myop');
    // Format: type-YYYYMMDDHHMMSS-random
    expect(ctx.operationId).toMatch(/^myop-\d{14}-[a-f0-9]{8}$/);
  });

  it('should be URL-safe', () => {
    const ctx = OperationContext.create('test-type');
    expect(ctx.operationId).not.toContain(' ');
    expect(ctx.operationId).not.toContain('/');
    expect(ctx.operationId).not.toContain('\\');
  });

  it('should include reasonable timestamp', () => {
    const ctx = OperationContext.create('test');
    const now = new Date();
    expect(ctx.startedAtUTC.getTime()).toBeLessThanOrEqual(now.getTime());
    expect(ctx.startedAtUTC.getTime()).toBeGreaterThan(now.getTime() - 1000);
  });
});

describe('Concurrent operations', () => {
  it('should maintain separate state for concurrent operations', () => {
    const ctx1 = OperationContext.create('op1', { value: 1 });
    const ctx2 = OperationContext.create('op2', { value: 2 });

    expect(ctx1.operationId).not.toBe(ctx2.operationId);
    expect(ctx1.getMetadataValue('value')).toBe(1);
    expect(ctx2.getMetadataValue('value')).toBe(2);
  });

  it('should handle batch operations concurrently', () => {
    const batch1 = BatchOperationContext.createBatch('import', 100);
    const batch2 = BatchOperationContext.createBatch('export', 50);

    batch1.recordProcessed(true);
    batch2.recordProcessed(false);

    const stats1 = batch1.getStats();
    const stats2 = batch2.getStats();

    expect(stats1.total).toBe(100);
    expect(stats2.total).toBe(50);
    expect(stats1.processed).toBe(1);
    expect(stats2.processed).toBe(1);
  });
});
