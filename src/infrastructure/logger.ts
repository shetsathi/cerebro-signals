/**
 * STRUCTURED LOGGER INFRASTRUCTURE
 *
 * Provides deterministic, testable logging with:
 * - Typed log levels (DEBUG, INFO, WARN, ERROR)
 * - Structured metadata
 * - Timestamp tracking
 * - Safe credential redaction
 * - No external dependencies (Node.js only)
 *
 * Usage:
 *   const logger = new ConsoleLogger('MyComponent');
 *   logger.info('User action', { userId: 123, action: 'login' });
 *   logger.error('Operation failed', error, { operationId: 'op-456' });
 */

/**
 * Log level enumeration
 * DEBUG < INFO < WARN < ERROR (lower = more verbose)
 */
export enum LogLevel {
  DEBUG = 'DEBUG',
  INFO = 'INFO',
  WARN = 'WARN',
  ERROR = 'ERROR',
}

/**
 * Structured log entry (immutable)
 */
export interface LogEntry {
  timestamp: string; // ISO 8601 UTC
  level: LogLevel;
  component?: string;
  message: string;
  operationId?: string;
  metadata?: Record<string, unknown>;
  error?: {
    name: string;
    message: string;
    stack?: string;
  };
}

/**
 * Logger interface
 * Implementations handle output (console, file, JSON, etc)
 */
export interface Logger {
  debug(message: string, metadata?: Record<string, unknown>): void;
  info(message: string, metadata?: Record<string, unknown>): void;
  warn(message: string, metadata?: Record<string, unknown>): void;
  error(message: string, error?: Error | null, metadata?: Record<string, unknown>): void;
  setOperationId(operationId: string): void;
  getOperationId(): string | undefined;
}

/**
 * Sensitive keys that should never appear in logs
 * Used to redact credentials from metadata
 */
const SENSITIVE_KEYS = new Set([
  'apikey',
  'api_key',
  'clientcode',
  'client_code',
  'password',
  'totp',
  'totp_secret',
  'totpsecret',
  'token',
  'authorization',
  'secret',
  'credential',
  'credentials',
  'access_token',
  'refresh_token',
  'session',
  'cookie',
  'cookies',
  'auth',
]);

/**
 * Redact sensitive values from metadata to prevent credential leakage
 */
function redactSensitiveData(obj: Record<string, unknown>): Record<string, unknown> {
  if (!obj || typeof obj !== 'object') {
    return obj;
  }

  const redacted: Record<string, unknown> = {};

  for (const [key, value] of Object.entries(obj)) {
    const lowerKey = key.toLowerCase();

    // Redact if key matches sensitive pattern
    if (SENSITIVE_KEYS.has(lowerKey)) {
      redacted[key] = '[REDACTED]';
    }
    // Recursively redact nested objects
    else if (value && typeof value === 'object' && !Array.isArray(value)) {
      redacted[key] = redactSensitiveData(value as Record<string, unknown>);
    }
    // Keep arrays but don't inspect deeply (could contain sensitive data)
    else if (Array.isArray(value)) {
      redacted[key] = '[array]';
    }
    // Keep primitive values
    else {
      redacted[key] = value;
    }
  }

  return redacted;
}

/**
 * Extract error details safely
 */
function extractErrorDetails(error: Error | null | undefined): { name: string; message: string; stack?: string } | undefined {
  if (!error) {
    return undefined;
  }

  return {
    name: error.name || 'Error',
    message: error.message || String(error),
    stack: error.stack,
  };
}

/**
 * Create a structured log entry
 */
function createLogEntry(
  level: LogLevel,
  message: string,
  component?: string,
  operationId?: string,
  metadata?: Record<string, unknown>,
  error?: Error | null,
): LogEntry {
  return {
    timestamp: new Date().toISOString(),
    level,
    component,
    message,
    operationId,
    metadata: metadata ? redactSensitiveData(metadata) : undefined,
    error: extractErrorDetails(error),
  };
}

/**
 * Console Logger Implementation
 * Outputs structured logs to console
 */
export class ConsoleLogger implements Logger {
  private operationId: string | undefined;
  private minLevel: LogLevel = LogLevel.DEBUG;

  constructor(
    private component: string,
    minLevel: LogLevel = LogLevel.DEBUG,
  ) {
    this.minLevel = minLevel;
  }

  private shouldLog(level: LogLevel): boolean {
    const levels = [LogLevel.DEBUG, LogLevel.INFO, LogLevel.WARN, LogLevel.ERROR];
    const levelIndex = levels.indexOf(level);
    const minLevelIndex = levels.indexOf(this.minLevel);
    return levelIndex >= minLevelIndex;
  }

  private output(entry: LogEntry): void {
    const timestamp = entry.timestamp;
    const level = entry.level;
    const prefix = `[${timestamp}] ${level}`;
    const component = entry.component ? ` ${entry.component}` : '';
    const opId = entry.operationId ? ` (op:${entry.operationId})` : '';

    const header = `${prefix}${component}${opId}`;
    const message = entry.message;

    const details: string[] = [];

    if (entry.metadata && Object.keys(entry.metadata).length > 0) {
      details.push(`metadata: ${JSON.stringify(entry.metadata)}`);
    }

    if (entry.error) {
      details.push(
        `error: ${entry.error.name}: ${entry.error.message}` +
          (entry.error.stack ? `\n${entry.error.stack}` : ''),
      );
    }

    const fullMessage = details.length > 0 ? `${header} ${message}\n  ${details.join('\n  ')}` : `${header} ${message}`;

    if (entry.level === LogLevel.ERROR) {
      console.error(fullMessage);
    } else if (entry.level === LogLevel.WARN) {
      console.warn(fullMessage);
    } else {
      console.log(fullMessage);
    }
  }

  debug(message: string, metadata?: Record<string, unknown>): void {
    if (this.shouldLog(LogLevel.DEBUG)) {
      const entry = createLogEntry(LogLevel.DEBUG, message, this.component, this.operationId, metadata);
      this.output(entry);
    }
  }

  info(message: string, metadata?: Record<string, unknown>): void {
    if (this.shouldLog(LogLevel.INFO)) {
      const entry = createLogEntry(LogLevel.INFO, message, this.component, this.operationId, metadata);
      this.output(entry);
    }
  }

  warn(message: string, metadata?: Record<string, unknown>): void {
    if (this.shouldLog(LogLevel.WARN)) {
      const entry = createLogEntry(LogLevel.WARN, message, this.component, this.operationId, metadata);
      this.output(entry);
    }
  }

  error(message: string, error?: Error | null, metadata?: Record<string, unknown>): void {
    if (this.shouldLog(LogLevel.ERROR)) {
      const entry = createLogEntry(LogLevel.ERROR, message, this.component, this.operationId, metadata, error);
      this.output(entry);
    }
  }

  setOperationId(operationId: string): void {
    this.operationId = operationId;
  }

  getOperationId(): string | undefined {
    return this.operationId;
  }
}

/**
 * JSON Logger Implementation
 * Outputs structured JSON logs (for log aggregation systems)
 */
export class JSONLogger implements Logger {
  private operationId: string | undefined;
  private minLevel: LogLevel = LogLevel.DEBUG;

  constructor(
    private component: string,
    minLevel: LogLevel = LogLevel.DEBUG,
  ) {
    this.minLevel = minLevel;
  }

  private shouldLog(level: LogLevel): boolean {
    const levels = [LogLevel.DEBUG, LogLevel.INFO, LogLevel.WARN, LogLevel.ERROR];
    const levelIndex = levels.indexOf(level);
    const minLevelIndex = levels.indexOf(this.minLevel);
    return levelIndex >= minLevelIndex;
  }

  private output(entry: LogEntry): void {
    const jsonOutput = JSON.stringify(entry);
    if (entry.level === LogLevel.ERROR) {
      console.error(jsonOutput);
    } else {
      console.log(jsonOutput);
    }
  }

  debug(message: string, metadata?: Record<string, unknown>): void {
    if (this.shouldLog(LogLevel.DEBUG)) {
      const entry = createLogEntry(LogLevel.DEBUG, message, this.component, this.operationId, metadata);
      this.output(entry);
    }
  }

  info(message: string, metadata?: Record<string, unknown>): void {
    if (this.shouldLog(LogLevel.INFO)) {
      const entry = createLogEntry(LogLevel.INFO, message, this.component, this.operationId, metadata);
      this.output(entry);
    }
  }

  warn(message: string, metadata?: Record<string, unknown>): void {
    if (this.shouldLog(LogLevel.WARN)) {
      const entry = createLogEntry(LogLevel.WARN, message, this.component, this.operationId, metadata);
      this.output(entry);
    }
  }

  error(message: string, error?: Error | null, metadata?: Record<string, unknown>): void {
    if (this.shouldLog(LogLevel.ERROR)) {
      const entry = createLogEntry(LogLevel.ERROR, message, this.component, this.operationId, metadata, error);
      this.output(entry);
    }
  }

  setOperationId(operationId: string): void {
    this.operationId = operationId;
  }

  getOperationId(): string | undefined {
    return this.operationId;
  }
}

/**
 * Null Logger Implementation
 * Discards all log output (useful for testing)
 */
export class NullLogger implements Logger {
  private operationId: string | undefined;

  constructor(private component: string) {}

  debug(_message: string, _metadata?: Record<string, unknown>): void {}
  info(_message: string, _metadata?: Record<string, unknown>): void {}
  warn(_message: string, _metadata?: Record<string, unknown>): void {}
  error(_message: string, _error?: Error | null, _metadata?: Record<string, unknown>): void {}

  setOperationId(operationId: string): void {
    this.operationId = operationId;
  }

  getOperationId(): string | undefined {
    return this.operationId;
  }
}
