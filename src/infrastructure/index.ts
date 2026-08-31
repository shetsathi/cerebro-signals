/**
 * INFRASTRUCTURE EXPORTS
 *
 * Production-grade logging, error handling, and operation context infrastructure.
 * Intended to be integrated throughout the codebase.
 */

// Logger infrastructure
export { LogLevel, LogEntry, Logger, ConsoleLogger, JSONLogger, NullLogger } from './logger';

// Error handling infrastructure
export {
  ErrorCode,
  ErrorSeverity,
  ApplicationError,
  ConfigurationError,
  ValidationError,
  AuthenticationError,
  ExternalServiceError,
  PersistenceError,
  DataIntegrityError,
  CausalityError,
  BusinessLogicError,
  NotImplementedError,
  isApplicationError,
  isRetryable,
  isFatal,
  toApplicationError,
} from './error-handler';

// Operation context infrastructure
export { OperationContext, BatchOperationContext, RequestContext } from './operation-context';
