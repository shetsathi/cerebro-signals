/**
 * Vercel Serverless Function — Express API
 * Routes: /api/*, /dashboard/*, /
 */

import express, { Express, Request, Response, NextFunction } from 'express';
import cors from 'cors';
import { createClient } from '@supabase/supabase-js';
import { SupabaseSignalRepository } from '../src/persistence/supabase-signal-repository';

const app: Express = express();

// Middleware
app.use(cors());
app.use(express.json());

// Error handling
app.use((err: any, req: Request, res: Response, next: NextFunction) => {
  console.error('Error:', err.message);
  res.status(500).json({ error: err.message || 'Internal server error' });
});

// Initialize Supabase
const supabaseUrl = process.env.SUPABASE_URL;
const supabaseAnonKey = process.env.SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  console.error('Missing SUPABASE_URL or SUPABASE_ANON_KEY');
}

const supabase = createClient(supabaseUrl || '', supabaseAnonKey || '');
const signalRepository = new SupabaseSignalRepository(supabase);

// Health check
app.get('/api/health', (req: Request, res: Response) => {
  res.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
  });
});

// Get all signals
app.get('/api/signals', async (req: Request, res: Response) => {
  try {
    const signals = await signalRepository.getAll();
    res.json(signals);
  } catch (error) {
    res.status(500).json({ error: (error as Error).message });
  }
});

// Get signal by ID
app.get('/api/signals/:id', async (req: Request, res: Response) => {
  try {
    const signal = await signalRepository.getById(req.params.id);
    if (!signal) {
      res.status(404).json({ error: 'Signal not found' });
      return;
    }
    res.json(signal);
  } catch (error) {
    res.status(500).json({ error: (error as Error).message });
  }
});

// Get active signals for symbol
app.get('/api/signals-active/:symbol', async (req: Request, res: Response) => {
  try {
    const signals = await signalRepository.getBySymbol(req.params.symbol);
    const active = signals.filter(s => s.status === 'ACTIVE' || s.status === 'GENERATED');
    res.json(active);
  } catch (error) {
    res.status(500).json({ error: (error as Error).message });
  }
});

export default app;
