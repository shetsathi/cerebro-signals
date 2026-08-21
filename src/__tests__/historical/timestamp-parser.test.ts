import { parseTimestampUTC } from '../../historical/timestamp-parser';

describe('Timestamp Parser — Timezone Safety', () => {
  describe('UTC timestamps', () => {
    it('should parse ISO UTC with Z', () => {
      const result = parseTimestampUTC('2024-01-15T09:15:00Z', 'UTC');
      expect(result.date).not.toBeNull();
      expect(result.date!.toISOString()).toBe('2024-01-15T09:15:00.000Z');
    });

    it('should parse UTC with +00:00 offset', () => {
      const result = parseTimestampUTC('2024-01-15T09:15:00+00:00', 'UTC');
      expect(result.date).not.toBeNull();
      expect(result.date!.toISOString()).toBe('2024-01-15T09:15:00.000Z');
    });
  });

  describe('IST timezone conversion', () => {
    it('should convert naive IST to UTC', () => {
      // 09:15 IST = 03:45 UTC
      const result = parseTimestampUTC('2024-01-15T09:15:00', 'Asia/Kolkata');
      expect(result.date).not.toBeNull();
      expect(result.date!.toISOString()).toBe('2024-01-15T03:45:00.000Z');
    });

    it('should convert IST with +05:30 offset to UTC', () => {
      // 14:45+05:30 = 09:15 UTC
      const result = parseTimestampUTC('2024-01-15T14:45:00+05:30', 'Asia/Kolkata');
      expect(result.date).not.toBeNull();
      expect(result.date!.toISOString()).toBe('2024-01-15T09:15:00.000Z');
    });
  });

  describe('Date objects', () => {
    it('should accept valid Date objects', () => {
      const date = new Date('2024-01-15T09:15:00Z');
      const result = parseTimestampUTC(date, 'UTC');
      expect(result.date).not.toBeNull();
      expect(result.error).toBeNull();
    });

    it('should reject invalid Date objects', () => {
      const invalidDate = new Date('invalid');
      const result = parseTimestampUTC(invalidDate, 'UTC');
      expect(result.date).toBeNull();
      expect(result.error).not.toBeNull();
    });
  });

  describe('Error handling', () => {
    it('should reject malformed timestamps', () => {
      const result = parseTimestampUTC('not a date', 'UTC');
      expect(result.date).toBeNull();
      expect(result.error).not.toBeNull();
      expect(result.error!.errorType).toBe('TIMESTAMP_INVALID');
    });

    it('should reject unknown timezones', () => {
      const result = parseTimestampUTC('2024-01-15T09:15:00', 'Unknown/Timezone');
      expect(result.date).toBeNull();
      expect(result.error!.errorType).toBe('TIMEZONE_UNKNOWN');
    });

    it('should reject non-string/non-Date input', () => {
      const result = parseTimestampUTC(12345 as any, 'UTC');
      expect(result.date).toBeNull();
      expect(result.error).not.toBeNull();
    });
  });

  describe('Determinism — server timezone independence', () => {
    it('should produce same UTC regardless of timezone config', () => {
      // Both should convert to the same UTC time
      const result1 = parseTimestampUTC('2024-01-15T14:45:00+05:30', 'UTC');
      const result2 = parseTimestampUTC('2024-01-15T09:15:00Z', 'UTC');

      expect(result1.date!.toISOString()).toBe(result2.date!.toISOString());
    });
  });
});
