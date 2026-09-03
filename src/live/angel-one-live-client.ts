/**
 * Angel One Live WebSocket Client
 *
 * Real-time LTP stream from Angel One SmartAPI.
 * Uses official smartapi-typescript SDK for WebSocket connection.
 * Loads credentials securely from Supabase Vault.
 * Emits 'tick' events with price data.
 *
 * CRITICAL: Never expose credentials in logs or errors.
 */

import { EventEmitter } from 'events';
import { SupabaseClient } from '@supabase/supabase-js';
import { SmartAPI } from 'smartapi-typescript';
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
   * Returns a promise that resolves when connected or rejects after max retries
   */
  async connect(): Promise<void> {
    return this.attemptConnection();
  }

  /**
   * Attempt connection with retry logic
   */
  private async attemptConnection(): Promise<void> {
    try {
      const credentials = await this.loadCredentialsFromVault();

      // Initialize SmartAPI with real SDK
      try {
        console.log('🔐 Authenticating with Angel One...');

        this.smartApi = new SmartAPI({
          apiKey: credentials.apiKey,
          clientId: credentials.clientCode,
          password: credentials.password,
          totpSecret: credentials.totpSecret,
        });

        // Perform real login
        await this.login(credentials);

        // Set up WebSocket event handlers
        this.setupWebSocketHandlers();

        this.connected = true;
        this.reconnectAttempts = 0;
        console.log('✅ Connected to Angel One WebSocket');
        this.emit('connected');
      } catch (smartApiError) {
        console.error('❌ Angel One login error:', (smartApiError as Error).message);

        // Check if we should retry
        if (this.reconnectAttempts < this.maxReconnectAttempts) {
          const delaySeconds = Math.pow(2, this.reconnectAttempts);
          this.reconnectAttempts++;
          console.log(`⏳ Retrying in ${delaySeconds}s (attempt ${this.reconnectAttempts}/${this.maxReconnectAttempts})`);

          // Wait before retrying
          await new Promise(resolve => setTimeout(resolve, delaySeconds * 1000));
          return this.attemptConnection(); // Recursive retry
        } else {
          // Max retries exceeded
          console.error('❌ Max connection attempts reached. Cannot connect to Angel One.');
          console.error('✓ Real data only mode - no fallback available');
          console.error('Verify your Angel One credentials:');
          console.error('  1. ANGEL_ONE_API_KEY');
          console.error('  2. ANGEL_ONE_CLIENT_CODE');
          console.error('  3. ANGEL_ONE_PASSWORD');
          console.error('  4. ANGEL_ONE_TOTP_SECRET');
          console.error('  5. Angel One API is accessible from your network');
          throw smartApiError;
        }
      }
    } catch (error) {
      throw error;
    }
  }


  /**
   * Set up WebSocket event handlers
   */
  private setupWebSocketHandlers(): void {
    if (!this.smartApi) return;

    // Handle incoming tick data
    (this.smartApi as any).on('tick', (data: any) => {
      try {
        this.onTick(data);
      } catch (error) {
        console.error('Error processing tick:', (error as Error).message);
      }
    });

    // Handle connection events
    (this.smartApi as any).on('connect', () => {
      console.log('✅ WebSocket connected to Angel One');
    });

    (this.smartApi as any).on('disconnect', () => {
      console.warn('⚠️  WebSocket disconnected from Angel One');
      this.connected = false;
    });

    (this.smartApi as any).on('error', (error: any) => {
      console.error('WebSocket error:', error);
    });
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
    // Try Vault first (production), fall back to env vars (development)
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
      // Fall back to environment variables (development mode)
      console.log('Vault not available, falling back to environment variables');

      const apiKey = process.env.ANGEL_ONE_API_KEY;
      const clientCode = process.env.ANGEL_ONE_CLIENT_CODE;
      const password = process.env.ANGEL_ONE_PASSWORD;
      const totpSecret = process.env.ANGEL_ONE_TOTP_SECRET;

      if (!apiKey || !clientCode || !password || !totpSecret) {
        throw new Error('Missing Angel One credentials in environment variables');
      }

      return {
        apiKey,
        clientCode,
        password,
        totpSecret,
      };
    }
  }

  /**
   * Login to Angel One with TOTP
   */
  private async login(credentials: {
    apiKey: string;
    clientCode: string;
    password: string;
    totpSecret: string;
  }): Promise<void> {
    if (!this.smartApi) {
      throw new Error('SmartAPI not initialized');
    }

    try {
      // Generate 6-digit TOTP code from secret
      const totpCode = totp.generate(credentials.totpSecret);
      console.log('🔑 Generated TOTP code for authentication');
      console.log(`📋 Sending login request for client: ${credentials.clientCode}`);

      // Call login API with correct signature: login(password, totp, state?, options?)
      const loginResult = await (this.smartApi as any).login(
        credentials.password,
        totpCode,
        undefined, // state
        {
          clientLocalIP: '127.0.0.1',
          clientPublicIP: '0.0.0.0',
          macAddress: '00:00:00:00:00:00',
        }
      );

      // Validate login response
      if (!loginResult?.data?.jwtToken) {
        throw new Error(`Login failed: ${loginResult?.message || 'No JWT token received'}`);
      }

      console.log('✅ Angel One login successful');

      // Update SmartAPI with authentication token
      (this.smartApi as any).setTokens(
        loginResult.data.jwtToken,
        loginResult.data.refreshToken,
        loginResult.data.feedToken
      );

    } catch (error) {
      const errorMsg = (error as any)?.message || JSON.stringify(error);
      console.error('❌ Angel One login error:', errorMsg);

      // Log full error object for debugging
      if (error instanceof Error) {
        console.error('Error details:', {
          message: error.message,
          name: error.name,
          stack: error.stack?.split('\n')[0],
        });
      }

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
      // Subscribe to Angel One LTP feed
      await (this.smartApi as any).subscribe(symbol, {
        mode: 'LTP', // Last Traded Price only (lightweight)
      });

      this.subscriptions.add(symbol);
      console.log(`✅ Subscribed to ${symbol} (LTP mode)`);
    } catch (error) {
      console.error(`❌ Failed to subscribe to ${symbol}:`, (error as Error).message);
      throw error;
    }
  }

  /**
   * Unsubscribe from LTP stream
   */
  async unsubscribe(symbol: string): Promise<void> {
    if (!this.smartApi) return;

    try {
      await (this.smartApi as any).unsubscribe?.(symbol);
      this.subscriptions.delete(symbol);
      console.log(`✅ Unsubscribed from ${symbol}`);
    } catch (error) {
      console.error(`Failed to unsubscribe from ${symbol}:`, (error as Error).message);
    }
  }

  /**
   * Handle incoming tick from SmartAPI WebSocket
   * Emit 'tick' event for aggregator to process
   */
  onTick(tickData: any): void {
    try {
      // Parse SmartAPI tick data format
      const tick: Tick = {
        symbol: tickData.symbol || tickData.token || tickData.name,
        ltp: parseFloat(tickData.ltp || tickData.lastPrice || 0),
        bid: tickData.bid ? parseFloat(tickData.bid) : undefined,
        ask: tickData.ask ? parseFloat(tickData.ask) : undefined,
        timestamp: new Date(tickData.timestamp || Date.now()),
        volume: tickData.volume ? parseInt(tickData.volume) : undefined,
      };

      // Validate tick
      if (!tick.symbol || !tick.ltp || tick.ltp <= 0) {
        console.warn('⚠️  Invalid tick data received:', tickData);
        return;
      }

      this.emit('tick', tick);
    } catch (error) {
      console.error('Error processing tick:', (error as Error).message);
    }
  }


  /**
   * Disconnect from Angel One
   */
  async disconnect(): Promise<void> {
    if (this.smartApi) {
      try {
        // Unsubscribe from all symbols
        for (const symbol of Array.from(this.subscriptions)) {
          await this.unsubscribe(symbol);
        }

        // Close WebSocket connection
        await (this.smartApi as any).disconnect?.();

        this.connected = false;
        this.smartApi = null;
        console.log('✅ Disconnected from Angel One');
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
