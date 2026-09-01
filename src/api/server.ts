/**
 * Express API Server
 *
 * Minimal API for dashboard to query signals.
 * Deploy to Vercel as serverless function.
 *
 * Routes:
 * GET /api/health — Health check
 * GET /api/signals — List signals
 * GET /api/signals/:id — Get signal details
 */

import 'dotenv/config';
import express, { Express, Request, Response, NextFunction } from 'express';
import cors from 'cors';
import { createClient } from '@supabase/supabase-js';
import { SupabaseSignalRepository } from '../persistence/supabase-signal-repository';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app: Express = express();
const port = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json());

// Serve static files (dashboard)
const publicPath = path.join(__dirname, '../../public');
app.use(express.static(publicPath));

// Error handling middleware
app.use((err: any, req: Request, res: Response, next: NextFunction) => {
  console.error('Error:', err.message);
  res.status(500).json({ error: err.message || 'Internal server error' });
});

// Initialize Supabase
const supabaseUrl = process.env.SUPABASE_URL;
const supabaseAnonKey = process.env.SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  console.error('Missing SUPABASE_URL or SUPABASE_ANON_KEY');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseAnonKey);
const signalRepository = new SupabaseSignalRepository(supabase);

// Routes

/**
 * Health check
 */
app.get('/api/health', (req: Request, res: Response) => {
  res.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    version: '1.0.0',
  });
});

/**
 * List signals
 * Query params: symbol, limit
 */
app.get('/api/signals', async (req: Request, res: Response) => {
  try {
    const symbol = (req.query.symbol as string) || 'NIFTY50';
    const limit = parseInt((req.query.limit as string) || '50');

    const signals = await signalRepository.getBySymbol(symbol, limit);

    res.json({
      symbol,
      count: signals.length,
      signals: signals.map((s) => ({
        signal_id: s.signal_id,
        symbol: s.symbol,
        decision_action: s.decision_action,
        entry_price: s.entry_price,
        stop_loss_price: s.stop_loss_price,
        target_price: s.target_price,
        risk_reward_ratio: s.risk_reward_ratio,
        status: s.status,
        evaluation_time_utc: s.evaluation_time_utc.toISOString(),
        created_at: s.created_at.toISOString(),
      })),
    });
  } catch (error) {
    res.status(500).json({
      error: (error as Error).message,
    });
  }
});

/**
 * Get signal by ID
 */
app.get('/api/signals/:id', async (req: Request, res: Response) => {
  try {
    const signal = await signalRepository.getById(req.params.id);

    if (!signal) {
      return res.status(404).json({ error: 'Signal not found' });
    }

    res.json({
      signal_id: signal.signal_id,
      symbol: signal.symbol,
      decision_action: signal.decision_action,
      decision_id: signal.decision_id,
      entry_price: signal.entry_price,
      stop_loss_price: signal.stop_loss_price,
      target_price: signal.target_price,
      risk_amount: signal.risk_amount,
      reward_amount: signal.reward_amount,
      risk_reward_ratio: signal.risk_reward_ratio,
      status: signal.status,
      evaluation_time_utc: signal.evaluation_time_utc.toISOString(),
      knowledge_time_utc: signal.knowledge_time_utc.toISOString(),
      ruleset_version: signal.ruleset_version,
      created_at: signal.created_at.toISOString(),
    });
  } catch (error) {
    res.status(500).json({
      error: (error as Error).message,
    });
  }
});

/**
 * Get active signals for a symbol
 */
app.get('/api/signals-active/:symbol', async (req: Request, res: Response) => {
  try {
    const signals = await signalRepository.getActive(req.params.symbol);

    res.json({
      symbol: req.params.symbol,
      active_count: signals.length,
      signals: signals.map((s) => ({
        signal_id: s.signal_id,
        symbol: s.symbol,
        decision_action: s.decision_action,
        entry_price: s.entry_price,
        stop_loss_price: s.stop_loss_price,
        target_price: s.target_price,
        risk_reward_ratio: s.risk_reward_ratio,
        evaluation_time_utc: s.evaluation_time_utc.toISOString(),
      })),
    });
  } catch (error) {
    res.status(500).json({
      error: (error as Error).message,
    });
  }
});

/**
 * Serve dashboard at root
 */
app.get('/', (req: Request, res: Response) => {
  res.sendFile(path.join(publicPath, 'dashboard', 'index.html'));
});

// Start server (if not in serverless environment)
if (process.env.NODE_ENV !== 'production') {
  app.listen(port, () => {
    console.log(`API server running on port ${port}`);
  });
}

export default app;
