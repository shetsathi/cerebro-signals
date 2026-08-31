import { ConsoleLogger, JSONLogger, NullLogger, LogLevel } from '../../infrastructure/logger';

describe('ConsoleLogger', () => {
  let logger: ConsoleLogger;
  let consoleLogSpy: jest.SpyInstance;
  let consoleErrorSpy: jest.SpyInstance;
  let consoleWarnSpy: jest.SpyInstance;

  beforeEach(() => {
    logger = new ConsoleLogger('TestComponent', LogLevel.DEBUG);
    consoleLogSpy = jest.spyOn(console, 'log').mockImplementation();
    consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation();
    consoleWarnSpy = jest.spyOn(console, 'warn').mockImplementation();
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe('Log levels', () => {
    it('should log DEBUG messages', () => {
      logger.debug('Debug message');
      expect(consoleLogSpy).toHaveBeenCalled();
      const call = consoleLogSpy.mock.calls[0][0] as string;
      expect(call).toContain('DEBUG');
      expect(call).toContain('Debug message');
    });

    it('should log INFO messages', () => {
      logger.info('Info message');
      expect(consoleLogSpy).toHaveBeenCalled();
      const call = consoleLogSpy.mock.calls[0][0] as string;
      expect(call).toContain('INFO');
      expect(call).toContain('Info message');
    });

    it('should log WARN messages', () => {
      logger.warn('Warning message');
      expect(consoleWarnSpy).toHaveBeenCalled();
      const call = consoleWarnSpy.mock.calls[0][0] as string;
      expect(call).toContain('WARN');
      expect(call).toContain('Warning message');
    });

    it('should log ERROR messages to console.error', () => {
      logger.error('Error message');
      expect(consoleErrorSpy).toHaveBeenCalled();
      const call = consoleErrorSpy.mock.calls[0][0] as string;
      expect(call).toContain('ERROR');
      expect(call).toContain('Error message');
    });

    it('should respect minimum log level', () => {
      const warnLogger = new ConsoleLogger('Test', LogLevel.WARN);
      consoleLogSpy.mockClear();

      warnLogger.debug('Debug');
      warnLogger.info('Info');
      expect(consoleLogSpy).not.toHaveBeenCalled();

      warnLogger.warn('Warning');
      expect(consoleWarnSpy).toHaveBeenCalled();
    });
  });

  describe('Metadata handling', () => {
    it('should include metadata in log output', () => {
      logger.info('Test message', { userId: 123, action: 'login' });
      const call = consoleLogSpy.mock.calls[0][0] as string;
      expect(call).toContain('userId');
      expect(call).toContain('123');
      expect(call).toContain('action');
    });

    it('should redact sensitive keys in metadata', () => {
      logger.info('Config loaded', { api_key: 'secret123', password: 'pass456', userId: 789 });
      const call = consoleLogSpy.mock.calls[0][0] as string;
      expect(call).toContain('[REDACTED]');
      expect(call).not.toContain('secret123');
      expect(call).not.toContain('pass456');
      expect(call).toContain('789');
    });

    it('should redact nested sensitive data', () => {
      logger.info('Nested config', {
        user: { credentials: { password: 'secret' }, id: 123 },
      });
      const call = consoleLogSpy.mock.calls[0][0] as string;
      expect(call).toContain('[REDACTED]');
      expect(call).not.toContain('secret');
    });

    it('should handle empty metadata', () => {
      logger.info('Message with no metadata');
      expect(consoleLogSpy).toHaveBeenCalled();
      const call = consoleLogSpy.mock.calls[0][0] as string;
      expect(call).toContain('Message with no metadata');
    });
  });

  describe('Error logging', () => {
    it('should log Error objects with stack trace', () => {
      const error = new Error('Test error');
      logger.error('Operation failed', error);
      expect(consoleErrorSpy).toHaveBeenCalled();
      const call = consoleErrorSpy.mock.calls[0][0] as string;
      expect(call).toContain('Error');
      expect(call).toContain('Test error');
    });

    it('should handle null errors gracefully', () => {
      logger.error('Operation failed', null);
      expect(consoleErrorSpy).toHaveBeenCalled();
    });

    it('should include error metadata with error object', () => {
      const error = new Error('API failed');
      logger.error('Request failed', error, { endpoint: '/api/v1/data', statusCode: 500 });
      const call = consoleErrorSpy.mock.calls[0][0] as string;
      expect(call).toContain('API failed');
      expect(call).toContain('endpoint');
    });
  });

  describe('Operation ID tracking', () => {
    it('should set and get operation ID', () => {
      logger.setOperationId('op-12345');
      expect(logger.getOperationId()).toBe('op-12345');
    });

    it('should include operation ID in log output', () => {
      logger.setOperationId('op-xyz-789');
      logger.info('Processing step');
      const call = consoleLogSpy.mock.calls[0][0] as string;
      expect(call).toContain('op-xyz-789');
      expect(call).toContain('op:');
    });

    it('should not include operation ID if not set', () => {
      logger.setOperationId('');
      logger.info('Processing step');
      const call = consoleLogSpy.mock.calls[0][0] as string;
      expect(call).toContain('INFO');
    });
  });

  describe('Timestamp handling', () => {
    it('should include ISO 8601 timestamp', () => {
      logger.info('Timestamped message');
      const call = consoleLogSpy.mock.calls[0][0] as string;
      expect(call).toMatch(/\d{4}-\d{2}-\d{2}T/); // ISO 8601 format
    });

    it('should use UTC timezone for timestamps', () => {
      logger.info('UTC timestamp');
      const call = consoleLogSpy.mock.calls[0][0] as string;
      expect(call).toContain('Z]'); // Z indicates UTC
    });
  });

  describe('Component identification', () => {
    it('should include component name in output', () => {
      logger.info('Component message');
      const call = consoleLogSpy.mock.calls[0][0] as string;
      expect(call).toContain('TestComponent');
    });
  });
});

describe('JSONLogger', () => {
  let logger: JSONLogger;
  let consoleLogSpy: jest.SpyInstance;
  let consoleErrorSpy: jest.SpyInstance;

  beforeEach(() => {
    logger = new JSONLogger('TestComponent');
    consoleLogSpy = jest.spyOn(console, 'log').mockImplementation();
    consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation();
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('should output valid JSON', () => {
    logger.info('JSON message', { key: 'value' });
    expect(consoleLogSpy).toHaveBeenCalled();
    const jsonString = consoleLogSpy.mock.calls[0][0] as string;
    const parsed = JSON.parse(jsonString);
    expect(parsed.level).toBe('INFO');
    expect(parsed.message).toBe('JSON message');
  });

  it('should include all log entry fields in JSON', () => {
    logger.setOperationId('op-123');
    logger.info('Test', { data: 'value' });
    const jsonString = consoleLogSpy.mock.calls[0][0] as string;
    const entry = JSON.parse(jsonString);
    expect(entry.timestamp).toBeDefined();
    expect(entry.level).toBe('INFO');
    expect(entry.component).toBe('TestComponent');
    expect(entry.message).toBe('Test');
    expect(entry.operationId).toBe('op-123');
    expect(entry.metadata).toBeDefined();
  });

  it('should redact sensitive data in JSON output', () => {
    logger.info('Config', { password: 'secret123' });
    const jsonString = consoleLogSpy.mock.calls[0][0] as string;
    const entry = JSON.parse(jsonString);
    expect(entry.metadata.password).toBe('[REDACTED]');
    expect(entry.metadata.password).not.toBe('secret123');
  });

  it('should output errors to console.error', () => {
    logger.error('Error occurred');
    expect(consoleErrorSpy).toHaveBeenCalled();
  });
});

describe('NullLogger', () => {
  let logger: NullLogger;
  let consoleLogSpy: jest.SpyInstance;
  let consoleErrorSpy: jest.SpyInstance;

  beforeEach(() => {
    logger = new NullLogger('TestComponent');
    consoleLogSpy = jest.spyOn(console, 'log').mockImplementation();
    consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation();
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('should not output anything', () => {
    logger.debug('Debug');
    logger.info('Info');
    logger.warn('Warn');
    logger.error('Error');

    expect(consoleLogSpy).not.toHaveBeenCalled();
    expect(consoleErrorSpy).not.toHaveBeenCalled();
  });

  it('should still track operation ID', () => {
    logger.setOperationId('op-123');
    expect(logger.getOperationId()).toBe('op-123');
  });
});

describe('Secret redaction', () => {
  let logger: ConsoleLogger;
  let consoleLogSpy: jest.SpyInstance;

  beforeEach(() => {
    logger = new ConsoleLogger('Test');
    consoleLogSpy = jest.spyOn(console, 'log').mockImplementation();
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('should redact ANGEL_ONE_API_KEY equivalent', () => {
    logger.info('Auth', { apikey: 'XP8jd2me', clientCode: 'A400840' });
    const output = consoleLogSpy.mock.calls[0][0] as string;
    expect(output).toContain('[REDACTED]');
    expect(output).not.toContain('XP8jd2me');
  });

  it('should redact TOTP secrets', () => {
    logger.info('2FA', { totp_secret: 'RCIDZOJNCJ3OCJ33T2ZETLE2OM' });
    const output = consoleLogSpy.mock.calls[0][0] as string;
    expect(output).toContain('[REDACTED]');
    expect(output).not.toContain('RCIDZOJNCJ3OCJ33T2ZETLE2OM');
  });

  it('should redact various credential patterns', () => {
    const secrets = {
      api_key: 'secret1',
      clientcode: 'code1',
      password: 'pass123',
      token: 'token456',
      authorization: 'Bearer xyz',
      access_token: 'token789',
    };
    logger.info('Secrets', secrets);
    const output = consoleLogSpy.mock.calls[0][0] as string;
    expect(output).not.toContain('secret1');
    expect(output).not.toContain('code1');
    expect(output).not.toContain('pass123');
    expect(output).not.toContain('token456');
  });

  it('should preserve legitimate data while redacting secrets', () => {
    logger.info('Mixed data', {
      userId: 123,
      password: 'secret',
      email: 'test@example.com',
      api_key: 'key123',
    });
    const output = consoleLogSpy.mock.calls[0][0] as string;
    expect(output).toContain('123'); // userId preserved
    expect(output).toContain('test@example.com'); // email preserved
    expect(output).toContain('[REDACTED]'); // secrets redacted
  });
});
