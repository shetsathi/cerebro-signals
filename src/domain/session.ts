import { parseISO } from 'date-fns';
import { format, utcToZonedTime } from 'date-fns-tz';

const IST_TIMEZONE = 'Asia/Kolkata';

export class SessionTime {
  private istDate: Date;

  constructor(utcDate: Date) {
    // Convert UTC to IST for session calculations
    this.istDate = utcToZonedTime(utcDate, IST_TIMEZONE);
  }

  static fromIST(istDate: Date): SessionTime {
    return new SessionTime(istDate);
  }

  static fromUTC(utcDate: Date): SessionTime {
    return new SessionTime(utcDate);
  }

  static now(): SessionTime {
    return new SessionTime(new Date());
  }

  get utc(): Date {
    // Convert IST Date to UTC Date
    // The istDate is already in IST, so we need to interpret it as IST and convert to UTC
    const year = this.istDate.getFullYear();
    const month = this.istDate.getMonth();
    const date = this.istDate.getDate();
    const hours = this.istDate.getHours();
    const minutes = this.istDate.getMinutes();
    const seconds = this.istDate.getSeconds();

    // Create ISO string in IST
    const istString = `${year}-${String(month + 1).padStart(2, '0')}-${String(date).padStart(2, '0')}T${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;

    // Parse as UTC then convert back accounting for IST offset (5:30)
    const utcDate = new Date(istString + 'Z');
    // Adjust for IST offset: IST = UTC + 5:30, so UTC = IST - 5:30
    utcDate.setHours(utcDate.getHours() - 5);
    utcDate.setMinutes(utcDate.getMinutes() - 30);

    return utcDate;
  }

  get ist(): Date {
    return new Date(this.istDate);
  }

  get hours(): number {
    return this.istDate.getHours();
  }

  get minutes(): number {
    return this.istDate.getMinutes();
  }

  get seconds(): number {
    return this.istDate.getSeconds();
  }

  get dayOfWeek(): number {
    return this.istDate.getDay();
  }

  get date(): Date {
    return new Date(this.istDate);
  }

  isWeekend(): boolean {
    return this.dayOfWeek === 0 || this.dayOfWeek === 6;
  }

  isTradingDay(): boolean {
    return !this.isWeekend();
  }

  isSessionOpen(): boolean {
    if (!this.isTradingDay()) return false;

    const hours = this.hours;
    const mins = this.minutes;
    const totalMins = hours * 60 + mins;
    const sessionOpenMins = 9 * 60 + 15; // 09:15
    const sessionCloseMins = 15 * 60 + 30; // 15:30

    return totalMins >= sessionOpenMins && totalMins < sessionCloseMins;
  }

  isBeforeSessionOpen(): boolean {
    if (!this.isTradingDay()) return false;

    const hours = this.hours;
    const mins = this.minutes;
    const totalMins = hours * 60 + mins;
    const sessionOpenMins = 9 * 60 + 15; // 09:15

    return totalMins < sessionOpenMins;
  }

  isAfterSessionClose(): boolean {
    if (!this.isTradingDay()) return false;

    const hours = this.hours;
    const mins = this.minutes;
    const totalMins = hours * 60 + mins;
    const sessionCloseMins = 15 * 60 + 30; // 15:30

    return totalMins >= sessionCloseMins;
  }

  getSessionOpenTime(): Date {
    const open = new Date(this.istDate);
    open.setHours(9, 15, 0, 0);
    return open;
  }

  getSessionCloseTime(): Date {
    const close = new Date(this.istDate);
    close.setHours(15, 30, 0, 0);
    return close;
  }

  isSessionClose(): boolean {
    const hours = this.hours;
    const mins = this.minutes;
    const totalMins = hours * 60 + mins;
    return totalMins === 15 * 60 + 30; // exactly 15:30
  }

  toString(): string {
    return format(this.istDate, 'yyyy-MM-dd HH:mm:ss', { timeZone: IST_TIMEZONE });
  }
}

export class CandleSession {
  constructor(
    readonly openTimeIST: Date,
    readonly closeTimeIST: Date,
  ) {}

  static getSessionOpenTimeIST(): Date {
    const now = new Date();
    const istNow = utcToZonedTime(now, IST_TIMEZONE);
    const open = new Date(istNow);
    open.setHours(9, 15, 0, 0);
    return open;
  }

  static getSessionCloseTimeIST(): Date {
    const now = new Date();
    const istNow = utcToZonedTime(now, IST_TIMEZONE);
    const close = new Date(istNow);
    close.setHours(15, 30, 0, 0);
    return close;
  }

  contains(timeIST: Date): boolean {
    return timeIST >= this.openTimeIST && timeIST < this.closeTimeIST;
  }
}
