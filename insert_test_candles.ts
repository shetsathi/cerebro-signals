import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_ANON_KEY!,
);

async function insertTestCandles() {
  console.log('📊 Inserting test candles with CORRECT prices...\n');
  
  const symbolPrices: Record<string, number> = {
    'SENSEX': 78000,
    'BANKNIFTY': 47500,
    'CRUDEOIL': 7200,
    'NIFTY50': 23500,
  };
  
  const now = new Date('2026-09-02T07:40:00Z');
  const candles: any[] = [];
  
  for (const symbol of Object.keys(symbolPrices)) {
    let basePrice = symbolPrices[symbol];
    
    // Generate 6 candles (30 minutes of 5m candles)
    for (let i = 5; i >= 0; i--) {
      const closeTime = new Date(now.getTime() - i * 5 * 60 * 1000);
      const openTime = new Date(closeTime.getTime() - 5 * 60 * 1000);
      
      // Simulate uptrend
      const open = basePrice + (Math.random() - 0.3) * basePrice * 0.001;
      const high = open + Math.random() * basePrice * 0.003;
      const low = Math.min(open, high) - Math.random() * basePrice * 0.001;
      const close = low + Math.random() * (high - low);
      
      basePrice = close;
      
      candles.push({
        id: `${symbol}-5m-${openTime.getTime()}`,
        symbol,
        timeframe: '5m',
        open_time_utc: openTime.toISOString(),
        close_time_utc: closeTime.toISOString(),
        knowledge_time_utc: closeTime.toISOString(),
        open: parseFloat(open.toFixed(2)),
        high: parseFloat(high.toFixed(2)),
        low: parseFloat(low.toFixed(2)),
        close: parseFloat(close.toFixed(2)),
        volume: Math.floor(100000 + Math.random() * 900000),
        status: 'CLOSED',
      });
    }
  }
  
  // Delete old test candles first
  console.log('🗑️  Removing old test candles...');
  await supabase
    .from('candles')
    .delete()
    .neq('id', 'dummy');
  
  console.log(`💾 Inserting ${candles.length} test candles...\n`);
  
  const { error } = await supabase.from('candles').insert(candles);
  
  if (error) {
    console.error('❌ Error:', error);
    process.exit(1);
  }
  
  // Verify
  console.log('✅ Candles inserted! Verifying...\n');
  
  for (const symbol of Object.keys(symbolPrices)) {
    const { data } = await supabase
      .from('candles')
      .select('*')
      .eq('symbol', symbol)
      .order('close_time_utc', { ascending: false })
      .limit(1);
    
    if (data && data.length > 0) {
      const c = data[0];
      const expected = symbolPrices[symbol];
      const diff = Math.abs((c.close - expected) / expected * 100);
      console.log(`✅ ${symbol}: close=${c.close.toFixed(2)} (expected ~${expected}, within ${diff.toFixed(1)}%)`);
    }
  }
  
  console.log('\n✨ Test candles ready! Now restart persistent server...');
}

insertTestCandles();
