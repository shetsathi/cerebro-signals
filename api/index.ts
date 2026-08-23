/**
 * Vercel Serverless Function — API Handler
 */

import { VercelRequest, VercelResponse } from '@vercel/node';
import { createClient } from '@supabase/supabase-js';
import { SupabaseSignalRepository } from '../src/persistence/supabase-signal-repository';

export default async (req: VercelRequest, res: VercelResponse) => {
  // CORS headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return;
  }

  const { pathname } = new URL(req.url || '', `http://${req.headers.host}`);

  try {
    // Health check
    if (pathname === '/api/health') {
      res.status(200).json({
        status: 'ok',
        timestamp: new Date().toISOString(),
      });
      return;
    }

    // Initialize Supabase
    const supabaseUrl = process.env.SUPABASE_URL;
    const supabaseAnonKey = process.env.SUPABASE_ANON_KEY;

    if (!supabaseUrl || !supabaseAnonKey) {
      res.status(500).json({ error: 'Supabase not configured' });
      return;
    }

    const supabase = createClient(supabaseUrl, supabaseAnonKey);
    const signalRepository = new SupabaseSignalRepository(supabase);

    // Get all signals
    if (pathname === '/api/signals') {
      const signals = await signalRepository.getAll();
      res.status(200).json(signals);
      return;
    }

    // Get signal by ID
    if (pathname.match(/^\/api\/signals\/[a-z0-9-]+$/)) {
      const id = pathname.split('/')[3];
      const signal = await signalRepository.getById(id);
      if (!signal) {
        res.status(404).json({ error: 'Signal not found' });
        return;
      }
      res.status(200).json(signal);
      return;
    }

    // Get active signals for symbol
    if (pathname.match(/^\/api\/signals-active\/[A-Z0-9]+$/)) {
      const symbol = pathname.split('/')[3];
      const signals = await signalRepository.getBySymbol(symbol);
      const active = signals.filter(s => s.status === 'ACTIVE' || s.status === 'GENERATED');
      res.status(200).json(active);
      return;
    }

    // Dashboard
    if (pathname === '/' || pathname === '/dashboard/index.html' || pathname.startsWith('/dashboard')) {
      res.status(200).sendFile(require('path').join(process.cwd(), 'public/dashboard/index.html'));
      return;
    }

    res.status(404).json({ error: 'Not found' });
  } catch (error) {
    console.error('Error:', error);
    res.status(500).json({ error: (error as Error).message || 'Internal server error' });
  }
};
