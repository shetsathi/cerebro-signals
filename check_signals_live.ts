import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_ANON_KEY!,
);

async function checkSignals() {
  console.log('📊 Checking live signals in database...\n');
  
  const { data: signals, error } = await supabase
    .from('signals')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(10);
  
  if (error) {
    console.error('Error:', error);
    process.exit(1);
  }
  
  if (!signals || signals.length === 0) {
    console.log('⏳ No signals yet (servers just started)');
    console.log('   Signals generate after structure forms (~20+ candles)');
    process.exit(0);
  }
  
  console.log(`✅ Found ${signals.length} signal(s)\n`);
  
  for (const signal of signals) {
    const action = signal.decision_action === 'LONG' ? '🟢 BUY' : '🔴 SELL';
    console.log(`${action} ${signal.symbol}`);
    console.log(`  Entry:  ${signal.entry_price?.toFixed(2) || 'N/A'}`);
    console.log(`  Stop:   ${signal.stop_loss_price?.toFixed(2) || 'N/A'}`);
    console.log(`  Target: ${signal.target_price?.toFixed(2) || 'N/A'}`);
    console.log(`  R:R:    ${signal.risk_reward_ratio?.toFixed(2) || 'N/A'}`);
    console.log(`  Status: ${signal.status}`);
    console.log(`  Time:   ${new Date(signal.created_at).toLocaleString('en-US', {timeZone: 'UTC'})}\n`);
  }
}

checkSignals();
