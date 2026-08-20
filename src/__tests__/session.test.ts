import { SessionTime, CandleSession } from '../domain/session';
import { utcToZonedTime } from 'date-fns-tz';

const IST_TIMEZONE = 'Asia/Kolkata';

describe('SessionTime', () => {
  describe('Session Boundaries', () => {
    it('should correctly identify session open at 09:15 IST', () => {
      const istDate = new Date('2026-08-21T09:15:00');
      const session = SessionTime.fromIST(istDate);

      expect(session.isSessionOpen()).toBe(true);
      expect(session.isBeforeSessionOpen()).toBe(false);
      expect(session.isAfterSessionClose()).toBe(false);
    });

    it('should correctly identify time before session open', () => {
      const istDate = new Date('2026-08-21T09:14:59');
      const session = SessionTime.fromIST(istDate);

      expect(session.isSessionOpen()).toBe(false);
      expect(session.isBeforeSessionOpen()).toBe(true);
    });

    it('should correctly identify session close at 15:30 IST', () => {
      const istDate = new Date('2026-08-21T15:30:00');
      const session = SessionTime.fromIST(istDate);

      expect(session.isAfterSessionClose()).toBe(true);
    });

    it('should handle boundary at 09:15:00', () => {
      const istDate = new Date('2026-08-21T09:15:00');
      const session = SessionTime.fromIST(istDate);

      expect(session.hours).toBe(9);
      expect(session.minutes).toBe(15);
      expect(session.isSessionOpen()).toBe(true);
    });

    it('should handle boundary at 15:30:00', () => {
      const istDate = new Date('2026-08-21T15:30:00');
      const session = SessionTime.fromIST(istDate);

      expect(session.hours).toBe(15);
      expect(session.minutes).toBe(30);
      expect(session.isAfterSessionClose()).toBe(true);
    });
  });

  describe('Trading Days', () => {
    it('should identify weekday as trading day', () => {
      // 2026-08-21 is a Friday
      const istDate = new Date('2026-08-21T10:00:00');
      const session = SessionTime.fromIST(istDate);

      expect(session.isTradingDay()).toBe(true);
    });

    it('should reject Saturday as trading day', () => {
      // 2026-08-22 is a Saturday
      const istDate = new Date('2026-08-22T10:00:00');
      const session = SessionTime.fromIST(istDate);

      expect(session.isTradingDay()).toBe(false);
      expect(session.isWeekend()).toBe(true);
    });

    it('should reject Sunday as trading day', () => {
      // 2026-08-23 is a Sunday
      const istDate = new Date('2026-08-23T10:00:00');
      const session = SessionTime.fromIST(istDate);

      expect(session.isTradingDay()).toBe(false);
      expect(session.isWeekend()).toBe(true);
    });

    it('should not be in session on weekend', () => {
      const istDate = new Date('2026-08-22T10:00:00'); // Saturday
      const session = SessionTime.fromIST(istDate);

      expect(session.isSessionOpen()).toBe(false);
    });
  });

  describe('UTC/IST Conversion', () => {
    it('should convert IST to UTC correctly', () => {
      const istDate = new Date('2026-08-21T09:15:00');
      const session = SessionTime.fromIST(istDate);
      const utcDate = session.utc;

      // IST is UTC+5:30, so 09:15 IST = 03:45 UTC
      expect(utcDate.getUTCHours()).toBe(3);
      expect(utcDate.getUTCMinutes()).toBe(45);
    });

    it('should maintain consistency between UTC and IST', () => {
      const originalIST = new Date('2026-08-21T12:00:00');
      const session = SessionTime.fromIST(originalIST);

      // Convert to UTC and back
      const utc = session.utc;
      const backToIST = utcToZonedTime(utc, IST_TIMEZONE);

      expect(backToIST.getHours()).toBe(12);
      expect(backToIST.getMinutes()).toBe(0);
    });
  });

  describe('toString', () => {
    it('should format time correctly', () => {
      const istDate = new Date('2026-08-21T09:15:00');
      const session = SessionTime.fromIST(istDate);

      const str = session.toString();
      expect(str).toContain('2026-08-21');
      expect(str).toContain('09:15');
    });
  });
});
