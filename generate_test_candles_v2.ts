import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_ANON_KEY!,
);

async function generateTestCandles() {
  console.log('📊 Generating test candles with correct prices...\n');
  
  // Define realistic base prices for each symbol
  const symbolPrices: Record<string, number> = {
    'SENSEX': 78000,
    'BANKNIFTY': 47500,
    'CRUDEOIL': 7200,
    'NIFTY50': 23500,
  };
  
  // Generate candles every 5 minutes for the last 30 minutes (6 candles each)
  const now = new Date('2026-09-02T07:40:00Z'); // 13:10 IST
  const candles: any[] = [];
  
  for (const symbol of Object.keys(symbolPrices)) {
    let basePrice = symbolPrices[symbol];
    
    console.log(`🔄 Generating candles for ${symbol}...`);
    
    for (let i = 5; i >= 0; i--) {
      const closeTime = new Date(now.getTime() - i * 5 * 60 * 1000);
      const openTime = new Date(closeTime.getTime() - 5 * 60 * 1000);
      
      // Simulate uptrend with small variations
      const open = basePrice + (Math.random() - 0.3) * basePrice * 0.001;
      const high = open + Math.random() * basePrice * 0.003;
      const low = Math.min(open, high) - Math.random() * basePrice * 0.001;
      const close = low + Math.random() * (high - low);
      
      basePrice = close; // Price continues from previous candle
      
      // Generate deterministic ID
      const id = `${symbol}-5m-${openTime.getTime()}`;
      
      candles.push({
        id,
        symbol,
        timeframe: '5m',
        open_time_utc: openTime.toISOString(),
        close_time_utc: closeTime.toISOString(),
        open: parseFloat(open.toFixed(2)),
        high: parseFloat(high.toFixed(2)),
        low: parseFloat(low.toFixed(2)),
        close: parseFloat(close.toFixed(2)),
        volume: Math.floor(100000 + Math.random() * 900000),
        status: 'CLOSED',
      });
    }
  }
  
  console.log(`\n💾 Inserting ${candles.length} test candles into database...`);
  
  const { error } = await supabase.from('candles').insert(candles);
  
  if (error) {
    console.error('❌ Error inserting candles:', error);
    process.exit(1);
  }
  
  console.log('✅ Test candles inserted!\n');
  
  // Verify insertion
  for (const symbol of Object.keys(symbolPrices)) {
    const { data, error: queryError } = await supabase
      .from('candles')
      .select('*')
      .eq('symbol', symbol)
      .order('close_time_utc', { ascending: false })
      .limit(1);
    
    if (!queryError && data && data.length > 0) {
      const latest = data[0];
      console.log(`✅ ${symbol}: Latest close=${latest.close} (expected ~${symbolPrices[symbol]})`);
    }
  }
  
  console.log('\n🎯 Test candles ready with CORRECT prices!');
}

generateTestCandles();
