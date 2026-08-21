import { rawToCandleModel } from '../../historical/data-contracts';
import { HistoricalImportConfig, RawHistoricalCandle } from '../../historical/data-contracts';

describe('Knowledge-Time Configuration', () => {
  const baseConfig: HistoricalImportConfig = {
    source: 'test',
    timezone: 'UTC',
    assumeKnowledgeTime: 'closeTime',
    strictValidation: true,
    allowGaps: true,
  };

  const baseCandle: RawHistoricalCandle = {
    symbol: 'NIFTY',
    timeframe: '5m',
    openTime: '2024-01-15T09:15:00Z',
    closeTime: '2024-01-15T09:20:00Z',
    open: 22500,
    high: 22520,
    low: 22495,
    close: 22515,
    volume: 1000000,
  };

  describe('closeTime mode', () => {
    it('should use closeTime as knowledge time', () => {
      const result = rawToCandleModel(baseCandle, baseConfig);
      expect(result.candle).not.toBeNull();
      expect(result.candle!.knowledgeTimeUTC.toISOString()).toBe('2024-01-15T09:20:00.000Z');
    });
  });

  describe('openTime mode', () => {
    it('should use openTime as knowledge time', () => {
      const config = { ...baseConfig, assumeKnowledgeTime: 'openTime' as const };
      const result = rawToCandleModel(baseCandle, config);
      expect(result.candle).not.toBeNull();
      expect(result.candle!.knowledgeTimeUTC.toISOString()).toBe('2024-01-15T09:15:00.000Z');
    });
  });

  describe('explicitField mode', () => {
    it('should use knowledgeTime field if provided', () => {
      const config = { ...baseConfig, assumeKnowledgeTime: 'explicitField' as const };
      const candle = {
        ...baseCandle,
        knowledgeTime: '2024-01-15T09:20:30Z',
      };
      const result = rawToCandleModel(candle, config);
      expect(result.candle).not.toBeNull();
      expect(result.candle!.knowledgeTimeUTC.toISOString()).toBe('2024-01-15T09:20:30.000Z');
    });

    it('should reject if knowledgeTime field is missing', () => {
      const config = { ...baseConfig, assumeKnowledgeTime: 'explicitField' as const };
      const result = rawToCandleModel(baseCandle, config);
      expect(result.candle).toBeNull();
      expect(result.errors.length).toBeGreaterThan(0);
    });
  });

  describe('Knowledge-time invariant', () => {
    it('should reject if knowledge time < close time', () => {
      const config = { ...baseConfig, assumeKnowledgeTime: 'explicitField' as const };
      const candle = {
        ...baseCandle,
        knowledgeTime: '2024-01-15T09:10:00Z', // Before close time
      };
      const result = rawToCandleModel(candle, config);
      expect(result.candle).toBeNull();
      expect(result.errors.some(e => e.message.includes('cannot be before'))).toBe(true);
    });

    it('should accept knowledge time == close time', () => {
      const config = { ...baseConfig, assumeKnowledgeTime: 'explicitField' as const };
      const candle = {
        ...baseCandle,
        knowledgeTime: '2024-01-15T09:20:00Z', // Equal to close
      };
      const result = rawToCandleModel(candle, config);
      expect(result.candle).not.toBeNull();
    });

    it('should accept knowledge time > close time', () => {
      const config = { ...baseConfig, assumeKnowledgeTime: 'explicitField' as const };
      const candle = {
        ...baseCandle,
        knowledgeTime: '2024-01-15T09:21:00Z', // After close (future knowledge)
      };
      const result = rawToCandleModel(candle, config);
      expect(result.candle).not.toBeNull();
    });
  });

  describe('Configuration actually affects output', () => {
    it('should produce different candles for different knowledge-time config', () => {
      const config1 = { ...baseConfig, assumeKnowledgeTime: 'openTime' as const };
      const config2 = { ...baseConfig, assumeKnowledgeTime: 'closeTime' as const };

      const result1 = rawToCandleModel(baseCandle, config1);
      const result2 = rawToCandleModel(baseCandle, config2);

      expect(result1.candle!.knowledgeTimeUTC).not.toEqual(result2.candle!.knowledgeTimeUTC);
    });
  });
});
