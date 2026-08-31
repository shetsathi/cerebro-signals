/**
 * ERROR HANDLING INFRASTRUCTURE
 *
 * Provides a coherent error hierarchy for the Cerebro system.
 * Errors are typed, include stable error codes, and can be safely serialized.
 *
 * Design:
 * - ApplicationError: base class for domain/operational errors
 * - Subclasses for specific error categories
 * - Stable error codes for machine-readable error handling
 * - Safe serialization that doesn't leak credentials
 * - Preservation of original cause (error chain)
 *
 * Usage:
 *   throw new ValidationError('Invalid candle', 'INVALID_OHLC', { candle });
 *   throw new ExternalServiceError('Angel One API failed', 'API_TIMEOUT', { service: 'angel-one' });
 */

/**
 * Stable error codes for all error types
 * Used for consistent error handling and recovery strategies
 */
export enum ErrorCode {
  // Configuration errors (1xxx)
  CONFIG_MISSING = 'CONFIG_MISSING',
  CONFIG_INVALID = 'CONFIG_INVALID',
  CONFIG_PARSE_ERROR = 'CONFIG_PARSE_ERROR',

  // Validation errors (2xxx)
  VALIDATION_FAILED = 'VALIDATION_FAILED',
  INVALID_SCHEMA = 'INVALID_SCHEMA',
  INVALID_BOUNDARY = 'INVALID_BOUNDARY',
  INVALID_OHLC = 'INVALID_OHLC',
  INVALID_TIMESTAMP = 'INVALID_TIMESTAMP',
  INVALID_TIMEFRAME = 'INVALID_TIMEFRAME',

  // Authentication/Authorization (3xxx)
  AUTH_FAILED = 'AUTH_FAILED',
  AUTH_EXPIRED = 'AUTH_EXPIRED',
  UNAUTHORIZED = 'UNAUTHORIZED',
  CREDENTIALS_MISSING = 'CREDENTIALS_MISSING',

  // External service errors (4xxx)
  EXTERNAL_SERVICE_ERROR = 'EXTERNAL_SERVICE_ERROR',
  API_TIMEOUT = 'API_TIMEOUT',
  API_RATE_LIMIT = 'API_RATE_LIMIT',
  API_INVALID_RESPONSE = 'API_INVALID_RESPONSE',
  BROKER_UNAVAILABLE = 'BROKER_UNAVAILABLE',

  // Persistence errors (5xxx)
  PERSISTENCE_FAILED = 'PERSISTENCE_FAILED',
  DATABASE_ERROR = 'DATABASE_ERROR',
  DATABASE_CONSTRAINT = 'DATABASE_CONSTRAINT',
  PERSISTENCE_RETRY_EXHAUSTED = 'PERSISTENCE_RETRY_EXHAUSTED',

  // Data integrity errors (6xxx)
  DATA_INTEGRITY_ERROR = 'DATA_INTEGRITY_ERROR',
  DUPLICATE_CANDLE = 'DUPLICATE_CANDLE',
  OUT_OF_ORDER_DATA = 'OUT_OF_ORDER_DATA',
  MISSING_DATA = 'MISSING_DATA',

  // Causality/Logic errors (7xxx)
  CAUSALITY_VIOLATION = 'CAUSALITY_VIOLATION',
  LOOK_AHEAD_VIOLATION = 'LOOK_AHEAD_VIOLATION',
  BUSINESS_LOGIC_ERROR = 'BUSINESS_LOGIC_ERROR',

  // Infrastructure/Runtime errors (8xxx)
  NOT_IMPLEMENTED = 'NOT_IMPLEMENTED',
  INTERNAL_ERROR = 'INTERNAL_ERROR',
  UNKNOWN_ERROR = 'UNKNOWN_ERROR',

  // Timeout/Retry errors (9xxx)
  TIMEOUT = 'TIMEOUT',
  RETRY_EXHAUSTED = 'RETRY_EXHAUSTED',
}

/**
 * Error severity for operational decisions
 */
export enum ErrorSeverity {
  // Can safely retry or ignore
  INFO = 'INFO',
  // Should be logged but typically not fatal
  WARNING = 'WARNING',
  // Operational failure, should not retry automatically
  ERROR = 'ERROR',
  // Fatal error, system should stop
  FATAL = 'FATAL',
}

/**
 * Base application error
 * All domain errors should extend this
 */
export class ApplicationError extends Error {
  readonly code: ErrorCode;
  readonly severity: ErrorSeverity;
  readonly timestamp: Date;
  readonly metadata: Record<string, unknown>;
  readonly originalError?: Error;

  constructor(
    message: string,
    code: ErrorCode = ErrorCode.UNKNOWN_ERROR,
    severity: ErrorSeverity = ErrorSeverity.ERROR,
    metadata: Record<string, unknown> = {},
    originalError?: Error,
  ) {
    super(message);
    this.name = this.constructor.name;
    this.code = code;
    this.severity = severity;
    this.timestamp = new Date();
    this.metadata = metadata;
    this.originalError = originalError;

    // Ensure proper prototype chain
    Object.setPrototypeOf(this, ApplicationError.prototype);
  }

  /**
   * Safely serialize error for logging (no credentials)
   */
  toJSON(): {
    name: string;
    message: string;
    code: string;
    severity: string;
    timestamp: string;
    metadata: Record<string, unknown>;
    originalError?: string;
  } {
    return {
      name: this.name,
      message: this.message,
      code: this.code,
      severity: this.severity,
      timestamp: this.timestamp.toISOString(),
      metadata: this.metadata,
      originalError: this.originalError ? `${this.originalError.name}: [Error details redacted]` : undefined,
    };
  }
}

/**
 * Configuration error
 * Missing or invalid environment/config variables
 */
export class ConfigurationError extends ApplicationError {
  constructor(
    message: string,
    code: ErrorCode = ErrorCode.CONFIG_INVALID,
    metadata: Record<string, unknown> = {},
    originalError?: Error,
  ) {
    super(message, code, ErrorSeverity.FATAL, metadata, originalError);
    Object.setPrototypeOf(this, ConfigurationError.prototype);
  }
}

/**
 * Validation error
 * Data failed validation (schema, constraints, etc)
 */
export class ValidationError extends ApplicationError {
  constructor(
    message: string,
    code: ErrorCode = ErrorCode.VALIDATION_FAILED,
    metadata: Record<string, unknown> = {},
    originalError?: Error,
  ) {
    super(message, code, ErrorSeverity.ERROR, metadata, originalError);
    Object.setPrototypeOf(this, ValidationError.prototype);
  }
}

/**
 * Authentication error
 * Credential failure or expiration
 */
export class AuthenticationError extends ApplicationError {
  constructor(
    message: string,
    code: ErrorCode = ErrorCode.AUTH_FAILED,
    metadata: Record<string, unknown> = {},
    originalError?: Error,
  ) {
    super(message, code, ErrorSeverity.ERROR, metadata, originalError);
    Object.setPrototypeOf(this, AuthenticationError.prototype);
  }
}

/**
 * External service error
 * Broker API, data provider, etc.
 */
export class ExternalServiceError extends ApplicationError {
  constructor(
    message: string,
    code: ErrorCode = ErrorCode.EXTERNAL_SERVICE_ERROR,
    metadata: Record<string, unknown> = {},
    originalError?: Error,
  ) {
    super(message, code, ErrorSeverity.ERROR, metadata, originalError);
    Object.setPrototypeOf(this, ExternalServiceError.prototype);
  }
}

/**
 * Persistence error
 * Database or file system operation failure
 */
export class PersistenceError extends ApplicationError {
  constructor(
    message: string,
    code: ErrorCode = ErrorCode.PERSISTENCE_FAILED,
    metadata: Record<string, unknown> = {},
    originalError?: Error,
  ) {
    super(message, code, ErrorSeverity.ERROR, metadata, originalError);
    Object.setPrototypeOf(this, PersistenceError.prototype);
  }
}

/**
 * Data integrity error
 * Duplicate, missing, or out-of-order data
 */
export class DataIntegrityError extends ApplicationError {
  constructor(
    message: string,
    code: ErrorCode = ErrorCode.DATA_INTEGRITY_ERROR,
    metadata: Record<string, unknown> = {},
    originalError?: Error,
  ) {
    super(message, code, ErrorSeverity.ERROR, metadata, originalError);
    Object.setPrototypeOf(this, DataIntegrityError.prototype);
  }
}

/**
 * Causality error
 * Look-ahead violation or other temporal logic errors
 */
export class CausalityError extends ApplicationError {
  constructor(
    message: string,
    code: ErrorCode = ErrorCode.CAUSALITY_VIOLATION,
    metadata: Record<string, unknown> = {},
    originalError?: Error,
  ) {
    super(message, code, ErrorSeverity.FATAL, metadata, originalError);
    Object.setPrototypeOf(this, CausalityError.prototype);
  }
}

/**
 * Business logic error
 * Unexpected state or constraint violation
 */
export class BusinessLogicError extends ApplicationError {
  constructor(
    message: string,
    code: ErrorCode = ErrorCode.BUSINESS_LOGIC_ERROR,
    metadata: Record<string, unknown> = {},
    originalError?: Error,
  ) {
    super(message, code, ErrorSeverity.FATAL, metadata, originalError);
    Object.setPrototypeOf(this, BusinessLogicError.prototype);
  }
}

/**
 * Not implemented error
 * Feature not yet implemented
 */
export class NotImplementedError extends ApplicationError {
  constructor(
    message: string,
    metadata: Record<string, unknown> = {},
    originalError?: Error,
  ) {
    super(message, ErrorCode.NOT_IMPLEMENTED, ErrorSeverity.WARNING, metadata, originalError);
    Object.setPrototypeOf(this, NotImplementedError.prototype);
  }
}

/**
 * Check if an error is an application error
 */
export function isApplicationError(error: unknown): error is ApplicationError {
  return error instanceof ApplicationError;
}

/**
 * Check if an error should be retried
 */
export function isRetryable(error: unknown): boolean {
  if (!isApplicationError(error)) {
    return false;
  }

  const retryableCodes = [
    ErrorCode.API_TIMEOUT,
    ErrorCode.API_RATE_LIMIT,
    ErrorCode.BROKER_UNAVAILABLE,
    ErrorCode.TIMEOUT,
    ErrorCode.DATABASE_ERROR, // some DB errors are transient
  ];

  return retryableCodes.includes(error.code);
}

/**
 * Check if an error is fatal (system should stop)
 */
export function isFatal(error: unknown): boolean {
  if (!isApplicationError(error)) {
    return false;
  }

  return error.severity === ErrorSeverity.FATAL;
}

/**
 * Convert any error to ApplicationError
 * Preserves ApplicationErrors, wraps others
 */
export function toApplicationError(error: unknown, context?: string): ApplicationError {
  if (isApplicationError(error)) {
    return error;
  }

  if (error instanceof Error) {
    const message = context ? `${context}: ${error.message}` : error.message;
    return new ApplicationError(message, ErrorCode.UNKNOWN_ERROR, ErrorSeverity.ERROR, {}, error);
  }

  const message = context ? `${context}: ${String(error)}` : String(error);
  return new ApplicationError(message, ErrorCode.UNKNOWN_ERROR, ErrorSeverity.ERROR);
}
