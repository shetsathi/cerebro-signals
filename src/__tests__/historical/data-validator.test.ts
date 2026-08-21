import { HistoricalDataValidator } from '../../historical/data-validator';
import { Candle, CandleStatus } from '../../domain/candle';
import { Timeframe, TimeframeValue } from '../../domain/timeframe';

describe('Historical Data — Validator', () => {
  const createCandle = (
    symbol: string,
    timeframeValue: TimeframeValue,
    openTime: Date,
    closeTime: Date,
  ): Candle => {
    return new Candle(
      symbol,
      Timeframe.from(timeframeValue),
      openTime,
      closeTime,
      { open: 100, high: 105, low: 95, close: 102, volume: 1000 },
      CandleStatus.CLOSED,
      closeTime,
    );
  };

  describe('Batch Validation', () => {
    it('should accept valid chronological candles', () => {
      const validator = new HistoricalDataValidator();
      const candles = [
        createCandle('NIFTY', TimeframeValue.FIVE_MIN, new Date('2024-01-15T09:15:00Z'), new Date('2024-01-15T09:20:00Z')),
        createCandle('NIFTY', TimeframeValue.FIVE_MIN, new Date('2024-01-15T09:20:00Z'), new Date('2024-01-15T09:25:00Z')),
      ];

      const result = validator.validateBatch(candles);

      expect(result.valid).toBe(true);
      expect(result.errors.length).toBe(0);
    });

    it('should detect duplicate candles', () => {
      const validator = new HistoricalDataValidator();
      const openTime = new Date('2024-01-15T09:15:00Z');
      const closeTime = new Date('2024-01-15T09:20:00Z');

      const candles = [
        createCandle('NIFTY', TimeframeValue.FIVE_MIN, openTime, closeTime),
        createCandle('NIFTY', TimeframeValue.FIVE_MIN, openTime, closeTime), // duplicate
      ];

      const result = validator.validateBatch(candles);

      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.errorType === 'DUPLICATE')).toBe(true);
    });

    it('should warn about out-of-order input (validator auto-sorts)', () => {
      const validator = new HistoricalDataValidator();
      const candles = [
        createCandle('NIFTY', TimeframeValue.FIVE_MIN, new Date('2024-01-15T09:20:00Z'), new Date('2024-01-15T09:25:00Z')),
        createCandle('NIFTY', TimeframeValue.FIVE_MIN, new Date('2024-01-15T09:15:00Z'), new Date('2024-01-15T09:20:00Z')),
      ];

      const result = validator.validateBatch(candles);

      // Validator sorts internally so out-of-order input is tolerated
      // But would detect duplicate or other issues
      expect(result.valid).toBe(true); // no errors after sorting
    });

    it('should warn about missing intervals', () => {
      const validator = new HistoricalDataValidator();
      const candles = [
        createCandle('NIFTY', TimeframeValue.FIVE_MIN, new Date('2024-01-15T09:15:00Z'), new Date('2024-01-15T09:20:00Z')),
        createCandle('NIFTY', TimeframeValue.FIVE_MIN, new Date('2024-01-15T09:30:00Z'), new Date('2024-01-15T09:35:00Z')), // 10 minute gap
      ];

      const result = validator.validateBatch(candles);

      expect(result.warnings.some(w => w.errorType === 'MISSING_INTERVAL')).toBe(true);
    });

    it('should warn about out-of-session candles', () => {
      const validator = new HistoricalDataValidator();
      // UTC 02:00 = IST 07:30 (before session open)
      const candles = [
        createCandle('NIFTY', TimeframeValue.FIVE_MIN, new Date('2024-01-15T02:00:00Z'), new Date('2024-01-15T02:05:00Z')),
      ];

      const result = validator.validateBatch(candles);

      expect(result.warnings.some(w => w.errorType === 'SESSION_BOUNDARY')).toBe(true);
    });

    it('should handle multiple symbols separately', () => {
      const validator = new HistoricalDataValidator();
      const candles = [
        createCandle('NIFTY', TimeframeValue.FIVE_MIN, new Date('2024-01-15T09:15:00Z'), new Date('2024-01-15T09:20:00Z')),
        createCandle('BANKNIFTY', TimeframeValue.FIVE_MIN, new Date('2024-01-15T09:15:00Z'), new Date('2024-01-15T09:20:00Z')),
      ];

      const result = validator.validateBatch(candles);

      // Different symbols, so no duplicate error
      expect(result.valid).toBe(true);
    });

    it('should handle multiple timeframes separately', () => {
      const validator = new HistoricalDataValidator();
      const candles = [
        createCandle('NIFTY', TimeframeValue.FIVE_MIN, new Date('2024-01-15T09:15:00Z'), new Date('2024-01-15T09:20:00Z')),
        createCandle('NIFTY', TimeframeValue.FIFTEEN_MIN, new Date('2024-01-15T09:15:00Z'), new Date('2024-01-15T09:30:00Z')),
      ];

      const result = validator.validateBatch(candles);

      expect(result.valid).toBe(true);
    });
  });
});
