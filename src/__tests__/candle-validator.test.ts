import { CandleValidator, BulkCandleValidator } from '../domain/candle-validator';
import { Candle, CandleStatus, CandleOHLC } from '../domain/candle';
import { Timeframe, TimeframeValue } from '../domain/timeframe';

describe('CandleValidator', () => {
  let validator: CandleValidator;

  beforeEach(() => {
    validator = new CandleValidator();
  });

  const createCandle = (
    symbol: string,
    timeframe: TimeframeValue,
    openTimeUTC: Date,
    status: CandleStatus = CandleStatus.CLOSED,
  ): Candle => {
    const closeTime = new Date(openTimeUTC);
    closeTime.setMinutes(closeTime.getMinutes() + Timeframe.from(timeframe).minutes);

    const ohlc: CandleOHLC = { open: 100, high: 105, low: 99, close: 102, volume: 1000 };

    return new Candle(symbol, Timeframe.from(timeframe), openTimeUTC, closeTime, ohlc, status);
  };

  describe('Duplicate detection', () => {
    it('should reject duplicate candles', () => {
      const candle1 = createCandle('RELIANCE', TimeframeValue.FIVE_MIN, new Date('2026-08-21T09:15:00Z'));
      const candle2 = createCandle('RELIANCE', TimeframeValue.FIVE_MIN, new Date('2026-08-21T09:15:00Z'));

      validator.validate(candle1);
      const result = validator.validate(candle2);

      expect(result.valid).toBe(false);
      expect(result.errors).toHaveLength(1);
      expect(result.errors[0].type).toBe('DUPLICATE');
      expect(result.errors[0].message).toContain('Duplicate candle');
    });

    it('should not reject different candles', () => {
      const candle1 = createCandle('RELIANCE', TimeframeValue.FIVE_MIN, new Date('2026-08-21T09:15:00Z'));
      const candle2 = createCandle('RELIANCE', TimeframeValue.FIVE_MIN, new Date('2026-08-21T09:20:00Z'));

      const result1 = validator.validate(candle1);
      const result2 = validator.validate(candle2);

      expect(result1.valid).toBe(true);
      expect(result2.valid).toBe(true);
    });

    it('should allow duplicate for different symbols', () => {
      const candle1 = createCandle('RELIANCE', TimeframeValue.FIVE_MIN, new Date('2026-08-21T09:15:00Z'));
      const candle2 = createCandle('INFY', TimeframeValue.FIVE_MIN, new Date('2026-08-21T09:15:00Z'));

      const result1 = validator.validate(candle1);
      const result2 = validator.validate(candle2);

      expect(result1.valid).toBe(true);
      expect(result2.valid).toBe(true);
    });

    it('should allow duplicate for different timeframes', () => {
      const candle1 = createCandle('RELIANCE', TimeframeValue.FIVE_MIN, new Date('2026-08-21T09:15:00Z'));
      const candle2 = createCandle(
        'RELIANCE',
        TimeframeValue.FIFTEEN_MIN,
        new Date('2026-08-21T09:15:00Z'),
      );

      const result1 = validator.validate(candle1);
      const result2 = validator.validate(candle2);

      expect(result1.valid).toBe(true);
      expect(result2.valid).toBe(true);
    });
  });

  describe('Out-of-order detection', () => {
    it('should detect out-of-order candles', () => {
      const candle1 = createCandle('RELIANCE', TimeframeValue.FIVE_MIN, new Date('2026-08-21T09:20:00Z'));
      const candle2 = createCandle('RELIANCE', TimeframeValue.FIVE_MIN, new Date('2026-08-21T09:15:00Z'));

      validator.validate(candle1);
      const result = validator.validate(candle2);

      expect(result.valid).toBe(false);
      expect(result.errors).toHaveLength(1);
      expect(result.errors[0].type).toBe('OUT_OF_ORDER');
      expect(result.errors[0].message).toContain('Out-of-order candle');
    });

    it('should allow candles in correct order', () => {
      const candle1 = createCandle('RELIANCE', TimeframeValue.FIVE_MIN, new Date('2026-08-21T09:15:00Z'));
      const candle2 = createCandle('RELIANCE', TimeframeValue.FIVE_MIN, new Date('2026-08-21T09:20:00Z'));

      const result1 = validator.validate(candle1);
      const result2 = validator.validate(candle2);

      expect(result1.valid).toBe(true);
      expect(result2.valid).toBe(true);
    });
  });

  describe('Missing candle detection', () => {
    it('should detect missing candles', () => {
      const candle1 = createCandle('RELIANCE', TimeframeValue.FIVE_MIN, new Date('2026-08-21T09:15:00Z'));
      const candle3 = createCandle('RELIANCE', TimeframeValue.FIVE_MIN, new Date('2026-08-21T09:25:00Z'));

      validator.validate(candle1);
      const result = validator.validate(candle3);

      expect(result.valid).toBe(false);
      expect(result.errors).toHaveLength(1);
      expect(result.errors[0].type).toBe('MISSING');
      expect(result.errors[0].message).toContain('Missing candle');
    });

    it('should not report missing candle for consecutive candles', () => {
      const candle1 = createCandle('RELIANCE', TimeframeValue.FIVE_MIN, new Date('2026-08-21T09:15:00Z'));
      const candle2 = createCandle('RELIANCE', TimeframeValue.FIVE_MIN, new Date('2026-08-21T09:20:00Z'));

      const result1 = validator.validate(candle1);
      const result2 = validator.validate(candle2);

      expect(result1.valid).toBe(true);
      expect(result2.valid).toBe(true);
      expect(result2.errors).toHaveLength(0);
    });
  });

  describe('Candle status tracking', () => {
    it('should track developing candles', () => {
      const developing = createCandle('RELIANCE', TimeframeValue.FIVE_MIN, new Date('2026-08-21T09:15:00Z'), CandleStatus.DEVELOPING);

      expect(developing.isDeveloping()).toBe(true);
      expect(developing.isClosed()).toBe(false);
    });

    it('should track closed candles', () => {
      const closed = createCandle('RELIANCE', TimeframeValue.FIVE_MIN, new Date('2026-08-21T09:15:00Z'), CandleStatus.CLOSED);

      expect(closed.isClosed()).toBe(true);
      expect(closed.isDeveloping()).toBe(false);
    });
  });

  describe('Candle retrieval', () => {
    it('should retrieve candle by key', () => {
      const candle = createCandle('RELIANCE', TimeframeValue.FIVE_MIN, new Date('2026-08-21T09:15:00Z'));

      validator.validate(candle);
      const retrieved = validator.getCandle(
        'RELIANCE',
        Timeframe.from(TimeframeValue.FIVE_MIN),
        new Date('2026-08-21T09:15:00Z'),
      );

      expect(retrieved).toEqual(candle);
    });

    it('should return undefined for non-existent candle', () => {
      const retrieved = validator.getCandle(
        'RELIANCE',
        Timeframe.from(TimeframeValue.FIVE_MIN),
        new Date('2026-08-21T09:15:00Z'),
      );

      expect(retrieved).toBeUndefined();
    });

    it('should return all candles', () => {
      const candle1 = createCandle('RELIANCE', TimeframeValue.FIVE_MIN, new Date('2026-08-21T09:15:00Z'));
      const candle2 = createCandle('RELIANCE', TimeframeValue.FIVE_MIN, new Date('2026-08-21T09:20:00Z'));

      validator.validate(candle1);
      validator.validate(candle2);

      const allCandles = validator.getAllCandles();

      expect(allCandles).toHaveLength(2);
    });
  });

  describe('State management', () => {
    it('should clear state', () => {
      const candle = createCandle('RELIANCE', TimeframeValue.FIVE_MIN, new Date('2026-08-21T09:15:00Z'));

      validator.validate(candle);
      expect(validator.getCandleCount()).toBe(1);

      validator.clear();
      expect(validator.getCandleCount()).toBe(0);
    });
  });
});

describe('BulkCandleValidator', () => {
  const createCandle = (
    symbol: string,
    timeframe: TimeframeValue,
    openTimeUTC: Date,
  ): Candle => {
    const closeTime = new Date(openTimeUTC);
    closeTime.setMinutes(closeTime.getMinutes() + Timeframe.from(timeframe).minutes);

    const ohlc: CandleOHLC = { open: 100, high: 105, low: 99, close: 102, volume: 1000 };

    return new Candle(symbol, Timeframe.from(timeframe), openTimeUTC, closeTime, ohlc, CandleStatus.CLOSED);
  };

  it('should validate batch of candles', () => {
    const candles = [
      createCandle('RELIANCE', TimeframeValue.FIVE_MIN, new Date('2026-08-21T09:15:00Z')),
      createCandle('RELIANCE', TimeframeValue.FIVE_MIN, new Date('2026-08-21T09:20:00Z')),
      createCandle('INFY', TimeframeValue.FIVE_MIN, new Date('2026-08-21T09:15:00Z')),
    ];

    const result = BulkCandleValidator.validateBatch(candles);

    expect(result.validCandles).toHaveLength(3);
    expect(result.errors).toHaveLength(0);
  });

  it('should detect errors in batch', () => {
    const candles = [
      createCandle('RELIANCE', TimeframeValue.FIVE_MIN, new Date('2026-08-21T09:15:00Z')),
      createCandle('RELIANCE', TimeframeValue.FIVE_MIN, new Date('2026-08-21T09:15:00Z')), // Duplicate
      createCandle('RELIANCE', TimeframeValue.FIVE_MIN, new Date('2026-08-21T09:25:00Z')), // Missing 09:20
    ];

    const result = BulkCandleValidator.validateBatch(candles);

    expect(result.validCandles).toHaveLength(1);
    expect(result.errors.length).toBeGreaterThan(0);
  });
});
