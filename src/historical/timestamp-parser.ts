/**
 * TIMEZONE-AWARE TIMESTAMP PARSING
 *
 * Ensures deterministic UTC conversion regardless of server timezone.
 * Handles explicit offsets and timezone-naive interpretation via config.
 */

import { DataValidationError } from './data-contracts';

/**
 * Parse timestamp to UTC Date
 *
 * Handles:
 * - ISO with Z: "2024-01-15T09:15:00Z" → UTC
 * - ISO with offset: "2024-01-15T14:45:00+05:30" → UTC
 * - Naive with config: "2024-01-15 09:15:00" + timezone="Asia/Kolkata" → UTC
 *
 * Never uses machine/server timezone.
 */
export function parseTimestampUTC(
  input: string | Date,
  sourceTimezone: string,
): { date: Date | null; error: DataValidationError | null } {
  if (input instanceof Date) {
    if (isNaN(input.getTime())) {
      return {
        date: null,
        error: {
          errorType: 'TIMESTAMP_INVALID',
          message: `Invalid Date object`,
          severity: 'ERROR',
        },
      };
    }
    return { date: input, error: null };
  }

  if (typeof input !== 'string') {
    return {
      date: null,
      error: {
        errorType: 'TIMESTAMP_INVALID',
        message: `Expected string or Date, got ${typeof input}`,
        severity: 'ERROR',
      },
    };
  }

  const str = input.trim();

  // Case 1: Explicit UTC (Z suffix)
  if (str.endsWith('Z')) {
    const d = new Date(str);
    if (!isNaN(d.getTime())) {
      return { date: d, error: null };
    }
    return {
      date: null,
      error: {
        errorType: 'TIMESTAMP_INVALID',
        message: `Invalid ISO UTC timestamp: ${str}`,
        severity: 'ERROR',
      },
    };
  }

  // Case 2: Explicit offset (e.g., +05:30, -04:00)
  if (/[+-]\d{2}:?\d{2}$/.test(str)) {
    const d = new Date(str);
    if (!isNaN(d.getTime())) {
      return { date: d, error: null };
    }
    return {
      date: null,
      error: {
        errorType: 'TIMESTAMP_INVALID',
        message: `Invalid ISO timestamp with offset: ${str}`,
        severity: 'ERROR',
      },
    };
  }

  // Case 3: Timezone-naive — interpret using sourceTimezone
  return parseNaiveTimestamp(str, sourceTimezone);
}

function parseNaiveTimestamp(
  str: string,
  sourceTimezone: string,
): { date: Date | null; error: DataValidationError | null } {
  // Parse as ISO string, then adjust for timezone
  const baseDate = new Date(str + 'Z'); // Append Z to parse as UTC first

  if (isNaN(baseDate.getTime())) {
    return {
      date: null,
      error: {
        errorType: 'TIMESTAMP_INVALID',
        message: `Invalid timestamp format: ${str}`,
        severity: 'ERROR',
      },
    };
  }

  // Adjust based on source timezone
  if (sourceTimezone === 'UTC') {
    return { date: baseDate, error: null };
  }

  if (sourceTimezone === 'Asia/Kolkata') {
    // IST = UTC + 5:30
    // To convert naive IST time to UTC: subtract 5:30
    const istOffsetMs = (5 * 60 + 30) * 60 * 1000;
    return {
      date: new Date(baseDate.getTime() - istOffsetMs),
      error: null,
    };
  }

  if (sourceTimezone === 'America/New_York') {
    // Simplified: EST/EDT handling
    const offsetHours = isDSTInNY(baseDate) ? -4 : -5;
    const offsetMs = offsetHours * 60 * 60 * 1000;
    return {
      date: new Date(baseDate.getTime() - offsetMs),
      error: null,
    };
  }

  if (sourceTimezone === 'Europe/London') {
    const offsetHours = isDSTInLondon(baseDate) ? 0 : -1;
    const offsetMs = offsetHours * 60 * 60 * 1000;
    return {
      date: new Date(baseDate.getTime() - offsetMs),
      error: null,
    };
  }

  // Unknown timezone
  return {
    date: null,
    error: {
      errorType: 'TIMEZONE_UNKNOWN',
      message: `Unsupported timezone: ${sourceTimezone}`,
      severity: 'ERROR',
    },
  };
}

function isDSTInNY(date: Date): boolean {
  // Simplified: DST in US is roughly Mar-Nov
  const month = date.getUTCMonth();
  return month >= 2 && month <= 9;
}

function isDSTInLondon(date: Date): boolean {
  // Simplified: BST in UK is roughly Mar-Oct
  const month = date.getUTCMonth();
  return month >= 2 && month <= 9;
}
