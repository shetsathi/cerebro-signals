import {
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
  ErrorCode,
  ErrorSeverity,
  isApplicationError,
  isRetryable,
  isFatal,
  toApplicationError,
} from '../../infrastructure/error-handler';

describe('Error hierarchy', () => {
  it('should create ApplicationError with default code', () => {
    const error = new ApplicationError('Test error');
    expect(error.message).toBe('Test error');
    expect(error.code).toBe(ErrorCode.UNKNOWN_ERROR);
    expect(error.severity).toBe(ErrorSeverity.ERROR);
    expect(error.timestamp).toBeInstanceOf(Date);
  });

  it('should create ApplicationError with custom code and severity', () => {
    const error = new ApplicationError(
      'Validation failed',
      ErrorCode.VALIDATION_FAILED,
      ErrorSeverity.ERROR,
    );
    expect(error.message).toBe('Validation failed');
    expect(error.code).toBe(ErrorCode.VALIDATION_FAILED);
    expect(error.severity).toBe(ErrorSeverity.ERROR);
  });

  it('should preserve original error in chain', () => {
    const originalError = new Error('Database connection lost');
    const appError = new ApplicationError(
      'Could not persist data',
      ErrorCode.PERSISTENCE_FAILED,
      ErrorSeverity.ERROR,
      {},
      originalError,
    );
    expect(appError.originalError).toBe(originalError);
    expect(appError.originalError?.message).toBe('Database connection lost');
  });

  it('should include metadata', () => {
    const error = new ApplicationError(
      'API call failed',
      ErrorCode.EXTERNAL_SERVICE_ERROR,
      ErrorSeverity.ERROR,
      { service: 'angel-one', statusCode: 503 },
    );
    expect(error.metadata).toEqual({ service: 'angel-one', statusCode: 503 });
  });
});

describe('Specific error types', () => {
  it('should create ConfigurationError', () => {
    const error = new ConfigurationError('Missing API key', ErrorCode.CREDENTIALS_MISSING);
    expect(error).toBeInstanceOf(ApplicationError);
    expect(error.code).toBe(ErrorCode.CREDENTIALS_MISSING);
    expect(error.severity).toBe(ErrorSeverity.FATAL);
  });

  it('should create ValidationError', () => {
    const error = new ValidationError(
      'Invalid OHLC data',
      ErrorCode.INVALID_OHLC,
      { high: 100, low: 101 },
    );
    expect(error).toBeInstanceOf(ApplicationError);
    expect(error.code).toBe(ErrorCode.INVALID_OHLC);
    expect(error.severity).toBe(ErrorSeverity.ERROR);
    expect(error.metadata).toEqual({ high: 100, low: 101 });
  });

  it('should create AuthenticationError', () => {
    const error = new AuthenticationError('Invalid credentials');
    expect(error).toBeInstanceOf(ApplicationError);
    expect(error.code).toBe(ErrorCode.AUTH_FAILED);
    expect(error.severity).toBe(ErrorSeverity.ERROR);
  });

  it('should create ExternalServiceError', () => {
    const error = new ExternalServiceError('Angel One API timeout', ErrorCode.API_TIMEOUT);
    expect(error).toBeInstanceOf(ApplicationError);
    expect(error.code).toBe(ErrorCode.API_TIMEOUT);
  });

  it('should create PersistenceError', () => {
    const error = new PersistenceError(
      'Database constraint violation',
      ErrorCode.DATABASE_CONSTRAINT,
    );
    expect(error).toBeInstanceOf(ApplicationError);
    expect(error.code).toBe(ErrorCode.DATABASE_CONSTRAINT);
  });

  it('should create DataIntegrityError', () => {
    const error = new DataIntegrityError('Duplicate candle', ErrorCode.DUPLICATE_CANDLE);
    expect(error).toBeInstanceOf(ApplicationError);
    expect(error.code).toBe(ErrorCode.DUPLICATE_CANDLE);
  });

  it('should create CausalityError with FATAL severity', () => {
    const error = new CausalityError('Look-ahead violation', ErrorCode.LOOK_AHEAD_VIOLATION);
    expect(error).toBeInstanceOf(ApplicationError);
    expect(error.code).toBe(ErrorCode.LOOK_AHEAD_VIOLATION);
    expect(error.severity).toBe(ErrorSeverity.FATAL);
  });

  it('should create BusinessLogicError with FATAL severity', () => {
    const error = new BusinessLogicError('Unexpected state', ErrorCode.BUSINESS_LOGIC_ERROR);
    expect(error).toBeInstanceOf(ApplicationError);
    expect(error.severity).toBe(ErrorSeverity.FATAL);
  });

  it('should create NotImplementedError', () => {
    const error = new NotImplementedError('Live trading not yet implemented');
    expect(error).toBeInstanceOf(ApplicationError);
    expect(error.code).toBe(ErrorCode.NOT_IMPLEMENTED);
    expect(error.severity).toBe(ErrorSeverity.WARNING);
  });
});

describe('Error serialization', () => {
  it('should serialize to JSON safely', () => {
    const error = new ApplicationError(
      'Test error',
      ErrorCode.VALIDATION_FAILED,
      ErrorSeverity.ERROR,
      { candle: { id: '123' } },
    );
    const json = error.toJSON();
    expect(json.name).toBe('ApplicationError');
    expect(json.message).toBe('Test error');
    expect(json.code).toBe(ErrorCode.VALIDATION_FAILED);
    expect(json.severity).toBe(ErrorSeverity.ERROR);
    expect(json.timestamp).toMatch(/^\d{4}-\d{2}-\d{2}T/); // ISO 8601
  });

  it('should not leak original error details in JSON', () => {
    const originalError = new Error('Database password: secret123');
    const appError = new ValidationError('Validation failed', ErrorCode.VALIDATION_FAILED, {}, originalError);
    const json = appError.toJSON();
    expect(json.originalError).toContain('Error:');
    expect(json.originalError).toContain('[Error details redacted]');
    expect(json.originalError).not.toContain('secret123');
    expect(json.originalError).not.toContain('Database password');
  });

  it('should include metadata in JSON', () => {
    const error = new ValidationError('Invalid', ErrorCode.INVALID_OHLC, { row: 5, value: 'bad' });
    const json = error.toJSON();
    expect(json.metadata).toEqual({ row: 5, value: 'bad' });
  });

  it('should handle JSON.stringify', () => {
    const error = new ApplicationError('Test', ErrorCode.UNKNOWN_ERROR);
    const stringified = JSON.stringify(error);
    expect(stringified).toContain('ApplicationError');
    expect(stringified).toContain('Test');
  });
});

describe('Error type checking', () => {
  it('should identify ApplicationError correctly', () => {
    const error = new ApplicationError('Test');
    expect(isApplicationError(error)).toBe(true);
  });

  it('should identify subclass errors as ApplicationError', () => {
    const validationError = new ValidationError('Test');
    const persistenceError = new PersistenceError('Test');
    expect(isApplicationError(validationError)).toBe(true);
    expect(isApplicationError(persistenceError)).toBe(true);
  });

  it('should not identify regular errors as ApplicationError', () => {
    const error = new Error('Regular error');
    expect(isApplicationError(error)).toBe(false);
  });

  it('should not identify null/undefined as ApplicationError', () => {
    expect(isApplicationError(null)).toBe(false);
    expect(isApplicationError(undefined)).toBe(false);
    expect(isApplicationError('string')).toBe(false);
  });
});

describe('Retry logic', () => {
  it('should identify retryable errors', () => {
    expect(
      isRetryable(
        new ExternalServiceError('Timeout', ErrorCode.API_TIMEOUT),
      ),
    ).toBe(true);
    expect(
      isRetryable(
        new ExternalServiceError('Rate limit', ErrorCode.API_RATE_LIMIT),
      ),
    ).toBe(true);
    expect(
      isRetryable(
        new ExternalServiceError('Unavailable', ErrorCode.BROKER_UNAVAILABLE),
      ),
    ).toBe(true);
  });

  it('should not mark non-retryable errors as retryable', () => {
    expect(
      isRetryable(
        new ValidationError('Invalid', ErrorCode.VALIDATION_FAILED),
      ),
    ).toBe(false);
    expect(
      isRetryable(
        new ConfigurationError('Missing', ErrorCode.CREDENTIALS_MISSING),
      ),
    ).toBe(false);
  });

  it('should not identify non-ApplicationError as retryable', () => {
    expect(isRetryable(new Error('Regular error'))).toBe(false);
    expect(isRetryable(null)).toBe(false);
  });
});

describe('Fatality checking', () => {
  it('should identify fatal errors', () => {
    expect(
      isFatal(
        new ConfigurationError('Missing API key', ErrorCode.CREDENTIALS_MISSING),
      ),
    ).toBe(true);
    expect(
      isFatal(new CausalityError('Look-ahead', ErrorCode.LOOK_AHEAD_VIOLATION)),
    ).toBe(true);
    expect(
      isFatal(new BusinessLogicError('Bad state', ErrorCode.BUSINESS_LOGIC_ERROR)),
    ).toBe(true);
  });

  it('should not mark non-fatal errors as fatal', () => {
    expect(isFatal(new ValidationError('Invalid'))).toBe(false);
    expect(
      isFatal(
        new NotImplementedError('Not implemented'),
      ),
    ).toBe(false);
  });

  it('should not identify non-ApplicationError as fatal', () => {
    expect(isFatal(new Error('Regular error'))).toBe(false);
    expect(isFatal(null)).toBe(false);
  });
});

describe('Error conversion', () => {
  it('should preserve ApplicationError when converting', () => {
    const original = new ValidationError('Invalid');
    const converted = toApplicationError(original);
    expect(converted).toBe(original);
  });

  it('should wrap regular Error', () => {
    const regularError = new Error('Database error');
    const converted = toApplicationError(regularError, 'Database operation failed');
    expect(isApplicationError(converted)).toBe(true);
    expect(converted.message).toBe('Database operation failed: Database error');
    expect(converted.originalError).toBe(regularError);
  });

  it('should convert string to ApplicationError', () => {
    const converted = toApplicationError('Something went wrong', 'Operation failed');
    expect(isApplicationError(converted)).toBe(true);
    expect(converted.message).toBe('Operation failed: Something went wrong');
  });

  it('should handle null/undefined error', () => {
    const converted1 = toApplicationError(null, 'Operation failed');
    expect(isApplicationError(converted1)).toBe(true);

    const converted2 = toApplicationError(undefined);
    expect(isApplicationError(converted2)).toBe(true);
  });

  it('should default to UNKNOWN_ERROR code', () => {
    const converted = toApplicationError(new Error('Test'));
    expect(converted.code).toBe(ErrorCode.UNKNOWN_ERROR);
  });
});

describe('Error codes enumeration', () => {
  it('should have configuration error codes', () => {
    expect(ErrorCode.CONFIG_MISSING).toBeDefined();
    expect(ErrorCode.CONFIG_INVALID).toBeDefined();
    expect(ErrorCode.CONFIG_PARSE_ERROR).toBeDefined();
  });

  it('should have validation error codes', () => {
    expect(ErrorCode.VALIDATION_FAILED).toBeDefined();
    expect(ErrorCode.INVALID_OHLC).toBeDefined();
    expect(ErrorCode.INVALID_TIMESTAMP).toBeDefined();
  });

  it('should have external service error codes', () => {
    expect(ErrorCode.API_TIMEOUT).toBeDefined();
    expect(ErrorCode.API_RATE_LIMIT).toBeDefined();
    expect(ErrorCode.BROKER_UNAVAILABLE).toBeDefined();
  });

  it('should have data integrity error codes', () => {
    expect(ErrorCode.DUPLICATE_CANDLE).toBeDefined();
    expect(ErrorCode.OUT_OF_ORDER_DATA).toBeDefined();
    expect(ErrorCode.MISSING_DATA).toBeDefined();
  });

  it('should have causality error codes', () => {
    expect(ErrorCode.CAUSALITY_VIOLATION).toBeDefined();
    expect(ErrorCode.LOOK_AHEAD_VIOLATION).toBeDefined();
  });
});

describe('Error severity levels', () => {
  it('should have all severity levels', () => {
    expect(ErrorSeverity.INFO).toBe('INFO');
    expect(ErrorSeverity.WARNING).toBe('WARNING');
    expect(ErrorSeverity.ERROR).toBe('ERROR');
    expect(ErrorSeverity.FATAL).toBe('FATAL');
  });
});

describe('Prototype chain', () => {
  it('should preserve prototype chain for all error types', () => {
    const errors = [
      new ApplicationError('Test'),
      new ValidationError('Test'),
      new ConfigurationError('Test'),
      new AuthenticationError('Test'),
      new ExternalServiceError('Test'),
      new PersistenceError('Test'),
      new DataIntegrityError('Test'),
      new CausalityError('Test'),
      new BusinessLogicError('Test'),
      new NotImplementedError('Test'),
    ];

    for (const error of errors) {
      expect(error instanceof ApplicationError).toBe(true);
      expect(error instanceof Error).toBe(true);
    }
  });
});
