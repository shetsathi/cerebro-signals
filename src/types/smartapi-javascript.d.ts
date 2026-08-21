/**
 * Type declarations for smartapi-javascript
 * Reference: https://github.com/angel-one/smartapi-javascript
 */

declare module 'smartapi-javascript' {
  export interface SmartAPIConfig {
    api_key: string;
    access_token?: string;
    refresh_token?: string;
  }

  export interface Candle {
    date?: string;
    timestamp?: string;
    open: number | string;
    high: number | string;
    low: number | string;
    close: number | string;
    volume: number | string;
    oi?: number | string;
  }

  export interface HistoricalDataParams {
    exchange: string;
    symboltoken: string;
    interval: string;
    fromdate: string;
    todate: string;
  }

  export interface SessionResponse {
    status: boolean;
    code?: number;
    message?: string;
    data?: {
      jwtToken: string;
      refreshToken: string;
      feedToken?: string;
    };
  }

  export interface CandleDataParams {
    exchange: string;
    symboltoken: string;
    interval: string;
    fromdate: string;
    todate: string;
  }

  export class SmartAPI {
    constructor(config: SmartAPIConfig);
    generateSession(
      clientcode: string,
      password: string,
      totp: string,
    ): Promise<SessionResponse | any>;
    getCandleData(params: CandleDataParams): Promise<Candle[]>;
    getProfile(): Promise<any>;
    setSessionExpiryHook(callback: () => void): void;
  }
}
