/**
 * Angel One Live WebSocket Client
 *
 * Real-time LTP stream from Angel One SmartAPI.
 * Loads credentials securely from Supabase Vault.
 * Emits 'tick' events with price data.
 *
 * CRITICAL: Never expose credentials in logs or errors.
 */

import { EventEmitter } from 'events';
import { SupabaseClient } from '@supabase/supabase-js';
import SmartApi from 'smartapi-javascript';
import { totp } from 'otplib';

export interface Tick {
  symbol: string;
  ltp: number;
  bid?: number;
  ask?: number;
  timestamp: Date;
  volume?: number;
}

export class AngelOneLiveClient extends EventEmitter {
  private smartApi: any = null; // SmartApi type not properly exported from library
  private connected: boolean = false;
  private subscriptions: Set<string> = new Set();
  private reconnectAttempts = 0;
  private readonly maxReconnectAttempts = 5;
  private readonly reconnectDelayMs = 5000;

  constructor(private supabase: SupabaseClient) {
    super();
  }

  /**
   * Load credentials from Supabase Vault and connect to Angel One
   */
  async connect(): Promise<void> {
    try {
      const credentials = await this.loadCredentialsFromVault();

      // Initialize SmartApi with loaded credentials
      this.smartApi = new (SmartApi as any)({
        auth_token: '', // Will be obtained after login
        api_key: credentials.apiKey,
        client_code: credentials.clientCode,
      });

      // Attempt login
      await this.login(credentials);

      this.connected = true;
      this.reconnectAttempts = 0;
      this.emit('connected');
    } catch (error) {
      this.handleConnectionError(error as Error);
    }
  }

  /**
   * Load Angel One credentials from Supabase Vault
   * CRITICAL: Credentials never logged or exposed
   */
  private async loadCredentialsFromVault(): Promise<{
    apiKey: string;
    clientCode: string;
    password: string;
    totpSecret: string;
  }> {
    try {
      // Query vault.decrypted_secrets for Angel One credentials
      // NOTE: This requires service_role key, which should only be available to backend
      const { data: apiKeyData, error: apiKeyError } = await this.supabase
        .from('vault.decrypted_secrets')
        .select('secret')
        .eq('name', 'angel_one_api_key')
        .single();

      if (apiKeyError) {
        throw new Error('Failed to load API key from Vault');
      }

      const { data: clientCodeData, error: clientCodeError } = await this.supabase
        .from('vault.decrypted_secrets')
        .select('secret')
        .eq('name', 'angel_one_client_code')
        .single();

      if (clientCodeError) {
        throw new Error('Failed to load client code from Vault');
      }

      const { data: passwordData, error: passwordError } = await this.supabase
        .from('vault.decrypted_secrets')
        .select('secret')
        .eq('name', 'angel_one_password')
        .single();

      if (passwordError) {
        throw new Error('Failed to load password from Vault');
      }

      const { data: totpData, error: totpError } = await this.supabase
        .from('vault.decrypted_secrets')
        .select('secret')
        .eq('name', 'angel_one_totp_secret')
        .single();

      if (totpError) {
        throw new Error('Failed to load TOTP secret from Vault');
      }

      // Validate all credentials present
      if (!apiKeyData?.secret || !clientCodeData?.secret || !passwordData?.secret || !totpData?.secret) {
        throw new Error('Incomplete credentials in Vault');
      }

      return {
        apiKey: apiKeyData.secret,
        clientCode: clientCodeData.secret,
        password: passwordData.secret,
        totpSecret: totpData.secret,
      };
    } catch (error) {
      // Log error without exposing credential values
      console.error('Vault credential loading failed:', (error as Error).message);
      throw error;
    }
  }

  /**
   * Login to Angel One
   */
  private async login(credentials: {
    apiKey: string;
    clientCode: string;
    password: string;
    totpSecret: string;
  }): Promise<void> {
    if (!this.smartApi) {
      throw new Error('SmartApi not initialized');
    }

    try {
      // Generate TOTP from secret
      const totpCode = totp.generate(credentials.totpSecret);

      // Login
      const loginResult = await (this.smartApi as any).login({
        clientcode: credentials.clientCode,
        password: credentials.password,
        totp: totpCode,
      });

      if (!loginResult || !loginResult.data || !loginResult.data.jwtToken) {
        throw new Error('Login failed: No auth token received');
      }

      console.log('Angel One login successful');

      // Store auth token (do not log it)
      if (this.smartApi) {
        this.smartApi.setAuthToken(loginResult.data.jwtToken);
      }
    } catch (error) {
      console.error('Angel One login error:', (error as Error).message);
      throw error;
    }
  }

  /**
   * Subscribe to LTP stream for a symbol
   */
  async subscribe(symbol: string): Promise<void> {
    if (!this.connected || !this.smartApi) {
      throw new Error('Not connected to Angel One');
    }

    try {
      // SmartApi WebSocket subscription
      this.smartApi.subscribe(symbol);
      this.subscriptions.add(symbol);
      console.log(`Subscribed to ${symbol}`);
    } catch (error) {
      console.error(`Failed to subscribe to ${symbol}:`, (error as Error).message);
      throw error;
    }
  }

  /**
   * Unsubscribe from LTP stream
   */
  async unsubscribe(symbol: string): Promise<void> {
    if (!this.smartApi) return;

    try {
      this.smartApi.unsubscribe(symbol);
      this.subscriptions.delete(symbol);
      console.log(`Unsubscribed from ${symbol}`);
    } catch (error) {
      console.error(`Failed to unsubscribe from ${symbol}:`, (error as Error).message);
    }
  }

  /**
   * Handle incoming tick from WebSocket
   * Emit 'tick' event for aggregator to process
   */
  onTick(tickData: any): void {
    try {
      const tick: Tick = {
        symbol: tickData.token || tickData.symbol,
        ltp: parseFloat(tickData.ltp),
        bid: tickData.bid ? parseFloat(tickData.bid) : undefined,
        ask: tickData.ask ? parseFloat(tickData.ask) : undefined,
        timestamp: new Date(),
        volume: tickData.volume ? parseInt(tickData.volume) : undefined,
      };

      this.emit('tick', tick);
    } catch (error) {
      console.error('Error processing tick:', (error as Error).message);
    }
  }

  /**
   * Handle connection errors with reconnect logic
   */
  private handleConnectionError(error: Error): void {
    console.error('Connection error:', error.message);

    this.connected = false;
    this.reconnectAttempts++;

    if (this.reconnectAttempts < this.maxReconnectAttempts) {
      const delaySeconds = Math.pow(2, this.reconnectAttempts); // Exponential backoff
      console.log(`Reconnecting in ${delaySeconds}s (attempt ${this.reconnectAttempts}/${this.maxReconnectAttempts})`);

      setTimeout(() => {
        this.connect();
      }, delaySeconds * 1000);
    } else {
      console.error('Max reconnection attempts reached. Giving up.');
      this.emit('error', error);
    }
  }

  /**
   * Disconnect from Angel One
   */
  async disconnect(): Promise<void> {
    if (this.smartApi) {
      try {
        for (const symbol of this.subscriptions) {
          await this.unsubscribe(symbol);
        }
        // SmartApi disconnect if available
        this.connected = false;
        console.log('Disconnected from Angel One');
      } catch (error) {
        console.error('Error disconnecting:', (error as Error).message);
      }
    }
  }

  isConnected(): boolean {
    return this.connected;
  }

  getSubscriptions(): string[] {
    return Array.from(this.subscriptions);
  }
}
