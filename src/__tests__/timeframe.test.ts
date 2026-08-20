import { Timeframe, TimeframeValue } from '../domain/timeframe';

describe('Timeframe', () => {
  describe('Creation and validation', () => {
    it('should create 5m timeframe', () => {
      const tf = Timeframe.from(TimeframeValue.FIVE_MIN);

      expect(tf.value).toBe('5m');
      expect(tf.minutes).toBe(5);
    });

    it('should create 15m timeframe', () => {
      const tf = Timeframe.from(TimeframeValue.FIFTEEN_MIN);

      expect(tf.value).toBe('15m');
      expect(tf.minutes).toBe(15);
    });

    it('should create 60m timeframe', () => {
      const tf = Timeframe.from(TimeframeValue.SIXTY_MIN);

      expect(tf.value).toBe('60m');
      expect(tf.minutes).toBe(60);
    });

    it('should create 1D timeframe', () => {
      const tf = Timeframe.from(TimeframeValue.DAILY);

      expect(tf.value).toBe('1D');
      expect(tf.minutes).toBe(1440);
    });

    it('should reject invalid timeframe', () => {
      expect(() => Timeframe.from('invalid')).toThrow();
    });
  });

  describe('Comparison', () => {
    it('should compare timeframes for equality', () => {
      const tf1 = Timeframe.from(TimeframeValue.FIVE_MIN);
      const tf2 = Timeframe.from(TimeframeValue.FIVE_MIN);
      const tf3 = Timeframe.from(TimeframeValue.FIFTEEN_MIN);

      expect(tf1.equals(tf2)).toBe(true);
      expect(tf1.equals(tf3)).toBe(false);
    });
  });

  describe('String representation', () => {
    it('should convert to string', () => {
      const tf = Timeframe.from(TimeframeValue.FIVE_MIN);

      expect(tf.toString()).toBe('5m');
    });
  });

  describe('All timeframes', () => {
    it('should have all required timeframes', () => {
      const timeframes = [
        TimeframeValue.FIVE_MIN,
        TimeframeValue.FIFTEEN_MIN,
        TimeframeValue.SIXTY_MIN,
        TimeframeValue.DAILY,
      ];

      for (const tf of timeframes) {
        expect(() => Timeframe.from(tf)).not.toThrow();
      }
    });
  });
});
