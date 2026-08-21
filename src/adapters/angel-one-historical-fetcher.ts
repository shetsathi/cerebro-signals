/**
 * ANGEL ONE HISTORICAL DATA FETCHER
 *
 * Acquires NIFTY 50 historical candles from Angel One SmartAPI.
 * Uses OFFICIAL Angel One SmartAPI SDK (angel-one/smartapi-javascript).
 * Reference: https://github.com/angel-one/smartapi-javascript
 *
 * Official SmartAPI Configuration:
 * - Base URL: https://apiconnect.angelone.in
 * - SDK: smartapi-javascript (v1.5.5+)
 * - Authentication: generateSession(clientcode, password, totp)
 * - Historical: getCandleData(exchange, symboltoken, interval, fromdate, todate)
 * - NIFTY 50 Token: 99926000 (NSE exchange)
 * - Intervals: ONE_MINUTE, FIVE_MINUTE, FIFTEEN_MINUTE, ONE_HOUR, ONE_DAY
 * - Max date range: 90 days per request
 * - Date format: YYYY-MM-DD HH:MM (IST)
 */

import { SmartAPI } from 'smartapi-javascript';
import OTPLib from 'otplib';
import { loadAngelOneConfig, AngelOneConfig } from './angel-one-config';

/**
 * Angel One SmartAPI historical candle response
 */
export interface AngelOneCandle {
  date: string; // Format: "DD-MMM-YYYY HH:MM" (IST)
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
  oi?: number; // Open Interest (optional)
}

/**
 * Angel One API historical data response
 */
export interface AngelOneHistoricalResponse {
  status: boolean;
  code?: number;
  message?: string;
  data?: AngelOneCandle[]; // Array directly, not nested
}

/**
 * Fetch request batch info
 */
export interface FetchBatch {
  intervalKey: string;
  fromDate: string; // DD-MM-YYYY
  toDate: string; // DD-MM-YYYY
  status: 'pending' | 'success' | 'failed' | 'partial';
  candleCount: number;
  error?: string;
}

/**
 * Angel One SmartAPI Historical Data Fetcher
 * Uses official angel-one/smartapi-javascript SDK for authentication and data retrieval
 * Reference: https://github.com/angel-one/smartapi-javascript
 */
export class AngelOneHistoricalFetcher {
  private config: AngelOneConfig;
  private smartApi?: SmartAPI;
  private batches: Map<string, FetchBatch> = new Map();

  // NIFTY 50 index instrument token (NSE) — official spec
  private readonly NIFTY_TOKEN = '99926000';
  private readonly EXCHANGE = 'NSE';

  // SmartAPI interval mapping (official spec from SDK)
  // Format: internal key → official SmartAPI interval name
  private readonly INTERVAL_MAP: { [key: string]: string } = {
    '5m': 'FIVE_MINUTE',
    '15m': 'FIFTEEN_MINUTE',
    '60m': 'ONE_HOUR',
    '1D': 'ONE_DAY',
  };

  // Maximum days per API request (verified with official SDK)
  private readonly MAX_DAYS_PER_REQUEST = 90;

  constructor() {
    this.config = loadAngelOneConfig();
    // Initialize SmartAPI with official configuration
    this.smartApi = new SmartAPI({
      api_key: this.config.apiKey,
    });
  }

  /**
   * Verify configuration before attempting API calls
   */
  public verifyConfiguration(): {
    valid: boolean;
    issues: string[];
  } {
    const issues: string[] = [];

    if (!this.config.apiKey || this.config.apiKey.length < 3) {
      issues.push('API key not properly configured');
    }
    if (!this.config.clientCode || this.config.clientCode.length < 3) {
      issues.push('Client code not properly configured');
    }
    if (!this.config.password || this.config.password.length < 2) {
      issues.push('Password not properly configured');
    }
    if (!this.config.totpSecret || this.config.totpSecret.length < 10) {
      issues.push('TOTP secret not properly configured');
    }

    return {
      valid: issues.length === 0,
      issues,
    };
  }

  /**
   * Authenticate with Angel One SmartAPI using official SDK
   * Uses generateSession(clientcode, password, totp)
   * TOTP is generated from TOTP secret using RFC 6238
   * Reference: https://github.com/angel-one/smartapi-javascript
   */
  public async authenticate(): Promise<void> {
    if (!this.smartApi) {
      throw new Error('SmartAPI not initialized');
    }

    const verification = this.verifyConfiguration();
    if (!verification.valid) {
      throw new Error(
        `Configuration incomplete. Issues: ${verification.issues.join('; ')}`,
      );
    }

    try {
      // Generate 6-digit TOTP code from TOTP secret (RFC 6238)
      const totp = this.generateTOTP(this.config.totpSecret);

      // Use official SDK's generateSession method
      // SDK automatically handles all headers including:
      // X-PrivateKey, X-SourceID, X-MACaddress, X-ClientLocalIP, X-ClientPublicIP
      const response = await this.smartApi.generateSession(
        this.config.clientCode,
        this.config.password,
        totp,  // Pass generated TOTP code (6 digits), not the secret
      );

      if (!response) {
        throw new Error('No response from authentication');
      }

      // Check response status
      const statusOk = (response as any).status === true || (response as any).data?.jwtToken;
      if (!statusOk) {
        const errorMsg = (response as any).message || JSON.stringify(response);
        throw new Error(`Authentication error: ${errorMsg}`);
      }

      console.log('✓ Authentication successful');
    } catch (error) {
      throw new Error(`Angel One authentication failed: ${error}`);
    }
  }

  /**
   * Fetch historical candles for a specific timeframe and date range
   *
   * @param timeframe - One of: 5m, 15m, 60m, 1D
   * @param fromDate - Start date (YYYY-MM-DD)
   * @param toDate - End date (YYYY-MM-DD)
   * @returns Array of candles
   */
  public async fetchHistoricalData(
    timeframe: string,
    fromDate: string,
    toDate: string,
  ): Promise<AngelOneCandle[]> {
    if (!this.smartApi) {
      throw new Error('SmartAPI not initialized');
    }

    const interval = this.INTERVAL_MAP[timeframe];
    if (!interval) {
      throw new Error(`Unsupported timeframe: ${timeframe}`);
    }

    const allCandles: AngelOneCandle[] = [];
    const batchKey = `${timeframe}_${fromDate}_${toDate}`;

    try {
      // Batch requests if date range exceeds maximum
      const batches = this.createDateBatches(fromDate, toDate);

      for (const batch of batches) {
        const candles = await this.fetchBatch(interval, batch.from, batch.to);
        allCandles.push(...candles);

        // Record batch status
        const recordKey = `${timeframe}_${batch.from}_${batch.to}`;
        this.batches.set(recordKey, {
          intervalKey: timeframe,
          fromDate: batch.from,
          toDate: batch.to,
          status: 'success',
          candleCount: candles.length,
        });
      }

      console.log(
        `✓ Fetched ${allCandles.length} candles for ${timeframe} (${fromDate} to ${toDate})`,
      );
      return allCandles;
    } catch (error) {
      this.batches.set(batchKey, {
        intervalKey: timeframe,
        fromDate,
        toDate,
        status: 'failed',
        candleCount: 0,
        error: String(error),
      });
      throw error;
    }
  }

  /**
   * Private: Fetch a single batch of candles (max 90 days)
   * Uses official SDK's getCandleData method
   * Reference: https://github.com/angel-one/smartapi-javascript
   */
  private async fetchBatch(interval: string, fromDate: string, toDate: string): Promise<AngelOneCandle[]> {
    if (!this.smartApi) {
      throw new Error('SmartAPI not initialized');
    }

    try {
      // Use official SDK's getCandleData method with request object
      // Official SDK expects: getCandleData({ exchange, symboltoken, interval, fromdate, todate })
      // NOT: getCandleData(exchange, symboltoken, interval, fromdate, todate)
      const response = await this.smartApi.getCandleData({
        exchange: this.EXCHANGE,      // NSE
        symboltoken: this.NIFTY_TOKEN, // 99926000
        interval: interval,            // FIVE_MINUTE, FIFTEEN_MINUTE, ONE_HOUR, ONE_DAY
        fromdate: fromDate,            // YYYY-MM-DD HH:MM format
        todate: toDate,                // YYYY-MM-DD HH:MM format
      });

      // Debug: Log response structure (without exposing sensitive data)
      if (!response || (Array.isArray(response) && response.length === 0)) {
        console.log(`[DEBUG] No candles in response for ${interval}`);
      }

      // Handle various response formats from SDK
      let candles: any[] = [];

      if (response && typeof response === 'object') {
        const resp = response as any;
        // Response could be direct array or wrapped in data property
        if (Array.isArray(response)) {
          candles = response;
        } else if (resp.data && Array.isArray(resp.data)) {
          candles = resp.data;
        } else if (resp.fetched && Array.isArray(resp.fetched)) {
          candles = resp.fetched;
        } else {
          // Try to extract any array from response
          const values = Object.values(resp);
          const arrayValue = values.find(v => Array.isArray(v));
          if (arrayValue) {
            candles = arrayValue as any[];
          }
        }
      }

      if (!candles || candles.length === 0) {
        // Empty result is valid (no data for this date/range)
        return [];
      }

      // Transform SDK response to internal format
      // Official SmartAPI returns array of arrays: [timestamp, open, high, low, close, volume]
      // OR object format: {date, open, high, low, close, volume}
      return candles.map((candle: any) => {
        if (Array.isArray(candle)) {
          // Array format: [timestamp, open, high, low, close, volume]
          return {
            date: candle[0] || '',
            open: candle[1] || 0,
            high: candle[2] || 0,
            low: candle[3] || 0,
            close: candle[4] || 0,
            volume: candle[5] || 0,
          };
        } else {
          // Object format: {date, open, high, low, close, volume}
          return {
            date: candle.date || candle.timestamp || '',
            open: typeof candle.open === 'number' ? candle.open : parseFloat(candle.open as string),
            high: typeof candle.high === 'number' ? candle.high : parseFloat(candle.high as string),
            low: typeof candle.low === 'number' ? candle.low : parseFloat(candle.low as string),
            close: typeof candle.close === 'number' ? candle.close : parseFloat(candle.close as string),
            volume: typeof candle.volume === 'number' ? candle.volume : parseInt(candle.volume as string),
          };
        }
      });
    } catch (error) {
      throw new Error(
        `Failed to fetch ${interval} data for ${fromDate} to ${toDate}: ${error}`,
      );
    }
  }

  /**
   * Create date batches (max 90 days per batch)
   * Formats dates as YYYY-MM-DD HH:MM for official SmartAPI
   */
  private createDateBatches(
    fromDateStr: string,
    toDateStr: string,
  ): Array<{ from: string; to: string }> {
    // Parse input dates (expecting YYYY-MM-DD format from caller)
    const start = new Date(fromDateStr);
    const end = new Date(toDateStr);
    const batches: Array<{ from: string; to: string }> = [];

    let current = new Date(start);

    while (current < end) {
      const batchEnd = new Date(current);
      batchEnd.setDate(batchEnd.getDate() + this.MAX_DAYS_PER_REQUEST - 1);

      if (batchEnd > end) {
        batchEnd.setTime(end.getTime());
      }

      // Set market open time (09:15 IST) for start
      const batchStart = new Date(current);
      batchStart.setHours(9, 15, 0, 0);

      // Set market close time (15:30 IST) for end
      const batchEndTime = new Date(batchEnd);
      batchEndTime.setHours(15, 30, 0, 0);

      batches.push({
        from: this.formatDate(batchStart),
        to: this.formatDate(batchEndTime),
      });

      current = new Date(batchEnd);
      current.setDate(current.getDate() + 1);
    }

    return batches;
  }

  /**
   * Generate TOTP code from secret (RFC 6238)
   * Required by official SmartAPI authentication
   */
  private generateTOTP(secret: string): string {
    try {
      const totp = OTPLib.authenticator.generate(secret);

      if (!/^\d{6}$/.test(totp)) {
        throw new Error(`Invalid TOTP format: expected 6 digits, got '${totp}'`);
      }

      return totp;
    } catch (error) {
      throw new Error(`TOTP generation failed: ${error}`);
    }
  }

  /**
   * Format date for API (YYYY-MM-DD HH:MM)
   * Official SmartAPI format per SDK specification
   */
  private formatDate(date: Date): string {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    const hours = String(date.getHours()).padStart(2, '0');
    const minutes = String(date.getMinutes()).padStart(2, '0');
    return `${year}-${month}-${day} ${hours}:${minutes}`;
  }

  /**
   * Get batch execution summary
   */
  public getBatchSummary(): {
    totalBatches: number;
    successfulBatches: number;
    failedBatches: number;
    totalCandles: number;
    batches: FetchBatch[];
  } {
    const batchList = Array.from(this.batches.values());
    const successful = batchList.filter(b => b.status === 'success').length;
    const failed = batchList.filter(b => b.status === 'failed').length;
    const totalCandles = batchList.reduce((sum, b) => sum + b.candleCount, 0);

    return {
      totalBatches: batchList.length,
      successfulBatches: successful,
      failedBatches: failed,
      totalCandles,
      batches: batchList,
    };
  }

  /**
   * Check if all required batches were successful
   */
  public areAllBatchesSuccessful(): boolean {
    const batches = Array.from(this.batches.values());
    return batches.length > 0 && batches.every(b => b.status === 'success');
  }
}
