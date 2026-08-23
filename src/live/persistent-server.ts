/**
 * Persistent Server — Live Signal Pipeline
 *
 * Orchestrates:
 * 1. Angel One WebSocket (live LTP stream)
 * 2. Tick-to-candle aggregation
 * 3. Candle persistence (Part 1)
 * 4. V1 Parts 1–9 invocation (LiveOrchestrator)
 * 5. Signal persistence
 * 6. Telegram notifications
 *
 * This is a long-running Node.js process (NOT serverless).
 * Deploy to Railway, Render, or self-hosted container.
 */

import { createClient } from '@supabase/supabase-js';
import { Candle } from '../domain/candle';
import { SupabaseCandleRepository } from '../persistence/supabase-candle-repository';
import { SupabaseSignalRepository } from '../persistence/supabase-signal-repository';
import { AngelOneLiveClient } from './angel-one-live-client';
import { TickAggregator } from './tick-aggregator';
import { LiveOrchestrator, LiveOrchestratorConfig } from './live-orchestrator';
import { SignalPersistenceService } from './signal-persistence-service';
import { TelegramService } from './telegram-service';
import { TimeframeValue } from '../domain/timeframe';
import { StructureConfig } from '../domain/structure-config';

interface ServerConfig {
  supabaseUrl: string;
  supabaseAnonKey: string;
  supabaseServiceRoleKey: string;
  telegramBotToken?: string;
  telegramChatId?: string;
  symbols: string[];
  timeframes?: TimeframeValue[];
}

export class PersistentServer {
  private angelOneClient: AngelOneLiveClient | null = null;
  private tickAggregators: Map<string, TickAggregator> = new Map();
  private liveOrchestrators: Map<string, LiveOrchestrator> = new Map();
  private signalPersistence: SignalPersistenceService | null = null;
  private telegramService: TelegramService | null = null;
  private candleRepository: SupabaseCandleRepository | null = null;
  private allCandles: Map<string, Candle[]> = new Map(); // In-memory candle buffer

  constructor(private config: ServerConfig) {}

  /**
   * Start the persistent server
   */
  async start(): Promise<void> {
    try {
      console.log('Starting Cerebro Signals persistent server...');

      // Initialize Supabase
      const supabase = createClient(this.config.supabaseUrl, this.config.supabaseAnonKey);
      const supabaseAdmin = createClient(
        this.config.supabaseUrl,
        this.config.supabaseServiceRoleKey, // For Vault access
      );

      // Initialize repositories
      this.candleRepository = new SupabaseCandleRepository(supabase);
      const signalRepository = new SupabaseSignalRepository(supabase);

      // Initialize services
      this.signalPersistence = new SignalPersistenceService(signalRepository);

      if (this.config.telegramBotToken && this.config.telegramChatId) {
        this.telegramService = new TelegramService(
          this.config.telegramBotToken,
          this.config.telegramChatId,
        );

        // Test Telegram connection
        const telegramOk = await this.telegramService.testConnection();
        if (!telegramOk) {
          console.warn('Telegram connection failed. Signals will persist but alerts won\'t send.');
        }
      }

      // Initialize Angel One WebSocket
      this.angelOneClient = new AngelOneLiveClient(supabaseAdmin);

      // Set up event handlers
      this.setupAngelOneEventHandlers();

      // Initialize tick aggregators and orchestrators for each symbol
      for (const symbol of this.config.symbols) {
        const timeframes = this.config.timeframes || [TimeframeValue.FIVE_MIN];

        // Load historical candles
        await this.loadHistoricalCandles(symbol);

        // Create tick aggregator
        const tickAggregator = new TickAggregator(symbol, timeframes);
        this.tickAggregators.set(symbol, tickAggregator);
        this.setupTickAggregatorHandlers(symbol, tickAggregator);

        // Create live orchestrator
        const orchestratorConfig = this.buildOrchestratorConfig();
        const orchestrator = new LiveOrchestrator(symbol, orchestratorConfig);
        this.liveOrchestrators.set(symbol, orchestrator);
        this.setupOrchestratorHandlers(orchestrator);
      }

      // Connect to Angel One
      await this.angelOneClient.connect();

      // Subscribe to symbols
      for (const symbol of this.config.symbols) {
        await this.angelOneClient.subscribe(symbol);
      }

      console.log('Persistent server started successfully');
      console.log(`Monitoring symbols: ${this.config.symbols.join(', ')}`);
    } catch (error) {
      console.error('Failed to start persistent server:', (error as Error).message);
      throw error;
    }
  }

  /**
   * Load historical candles for a symbol (needed by LiveOrchestrator)
   */
  private async loadHistoricalCandles(symbol: string): Promise<void> {
    try {
      if (!this.candleRepository) return;

      // Load candles from database for 5m timeframe
      // For now, load last 100 candles (sufficient for structure/regime analysis)
      // TODO: Make this configurable
      console.log(`Loading historical candles for ${symbol}...`);

      // Note: CandleRepository doesn't have a date-range query yet
      // For MVP, assume candles are loaded on-demand in LiveOrchestrator
      // or pre-loaded from a data source

      this.allCandles.set(symbol, []);
    } catch (error) {
      console.error(`Failed to load historical candles for ${symbol}:`, (error as Error).message);
    }
  }

  /**
   * Set up Angel One event handlers
   */
  private setupAngelOneEventHandlers(): void {
    if (!this.angelOneClient) return;

    this.angelOneClient.on('connected', () => {
      console.log('Angel One connected');
    });

    this.angelOneClient.on('tick', (tick) => {
      // Forward tick to appropriate aggregator
      const aggregator = this.tickAggregators.get(tick.symbol);
      if (aggregator) {
        aggregator.onTick(tick);
      }
    });

    this.angelOneClient.on('error', (error) => {
      console.error('Angel One error:', error.message);
    });
  }

  /**
   * Set up tick aggregator event handlers
   */
  private setupTickAggregatorHandlers(symbol: string, aggregator: TickAggregator): void {
    aggregator.on('candleClosed', async (candle: Candle) => {
      // 1. Persist candle
      if (this.candleRepository) {
        try {
          await this.candleRepository.save(candle);

          // Add to in-memory buffer
          const candles = this.allCandles.get(symbol) || [];
          candles.push(candle);
          this.allCandles.set(symbol, candles);

          console.log(`Candle saved: ${symbol} @ ${candle.closeTimeUTC.toISOString()}`);
        } catch (error) {
          console.error('Failed to save candle:', (error as Error).message);
          return;
        }
      }

      // 2. Invoke LiveOrchestrator
      const orchestrator = this.liveOrchestrators.get(symbol);
      if (orchestrator) {
        const allCandles = this.allCandles.get(symbol) || [];
        await orchestrator.evaluate(allCandles, candle);
      }
    });
  }

  /**
   * Set up orchestrator event handlers
   */
  private setupOrchestratorHandlers(orchestrator: LiveOrchestrator): void {
    orchestrator.on('decision', async (signal) => {
      console.log(`Signal generated: ${signal.symbol} ${signal.action}`);

      // 1. Persist signal
      if (this.signalPersistence) {
        try {
          const signalId = await this.signalPersistence.persistSignal(signal);
          if (!signalId) {
            console.log('Signal already persisted (duplicate)');
            return;
          }
        } catch (error) {
          console.error('Failed to persist signal:', (error as Error).message);
          return;
        }
      }

      // 2. Send Telegram alert (non-blocking)
      if (this.telegramService) {
        this.telegramService
          .sendSignalAlert(signal)
          .then((success) => {
            if (success) {
              console.log('Telegram alert sent');
            }
          })
          .catch((error) => {
            console.error('Telegram alert failed:', (error as Error).message);
          });
      }
    });

    orchestrator.on('error', (error) => {
      console.error('Orchestrator error:', error.message);
    });
  }

  /**
   * Build LiveOrchestrator configuration
   */
  private buildOrchestratorConfig(): LiveOrchestratorConfig {
    return {
      decisionConfig: {
        rulesetVersion: 'V1',
        configHash: 'v1_default_hash',
      },
      riskConfig: {
        minimumRR: 2.0,
        rulesetVersion: 'V1',
        configHash: 'v1_risk_hash',
      },
      triggerConfig: {
        rulesetVersion: 'V1',
        configHash: 'v1_trigger_hash',
      },
      setupConfig: {
        k: 3,
        maxBarsFailedBreak: 10,
        maxBarsAfterBreak: 20,
        rulesetVersion: 'V1',
        configHash: 'v1_setup_hash',
      },
      levelConfig: {
        k: 3,
        maxBarsFailedBreak: 10,
        maxBarsAfterBreak: 20,
        rulesetVersion: 'V1',
        configHash: 'v1_level_hash',
      },
      structureConfig: new StructureConfig(2, 2),
    };
  }

  /**
   * Stop the persistent server
   */
  async stop(): Promise<void> {
    console.log('Stopping persistent server...');

    if (this.angelOneClient) {
      await this.angelOneClient.disconnect();
    }

    console.log('Persistent server stopped');
  }
}

/**
 * Main entry point
 */
async function main() {
  const config: ServerConfig = {
    supabaseUrl: process.env.SUPABASE_URL || '',
    supabaseAnonKey: process.env.SUPABASE_ANON_KEY || '',
    supabaseServiceRoleKey: process.env.SUPABASE_SERVICE_ROLE_KEY || '',
    telegramBotToken: process.env.TELEGRAM_BOT_TOKEN,
    telegramChatId: process.env.TELEGRAM_CHAT_ID,
    symbols: (process.env.MONITOR_SYMBOLS || 'NIFTY50').split(','),
    timeframes: [TimeframeValue.FIVE_MIN],
  };

  if (!config.supabaseUrl || !config.supabaseAnonKey || !config.supabaseServiceRoleKey) {
    console.error('Missing required environment variables: SUPABASE_URL, SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY');
    process.exit(1);
  }

  const server = new PersistentServer(config);

  // Handle graceful shutdown
  process.on('SIGINT', async () => {
    console.log('Received SIGINT, shutting down gracefully...');
    await server.stop();
    process.exit(0);
  });

  try {
    await server.start();
  } catch (error) {
    console.error('Server startup failed:', (error as Error).message);
    process.exit(1);
  }
}

// Only run if this is the entry point
if (require.main === module) {
  main();
}
