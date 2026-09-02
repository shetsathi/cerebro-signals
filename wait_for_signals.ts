import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_ANON_KEY!,
);

async function checkSignals() {
  let attempt = 0;
  const maxAttempts = 36; // 3 minutes (5 second intervals)
  
  console.log('⏳ Waiting for candle close and signal generation (max 3 min)...\n');
  
  while (attempt < maxAttempts) {
    attempt++;
    
    const { data: signals, error } = await supabase
      .from('signals')
      .select('*')
      .order('created_at', { ascending: false });
    
    if (error) {
      console.error('Error querying signals:', error);
      process.exit(1);
    }
    
    if (signals && signals.length > 0) {
      console.log(`\n✅ NEW SIGNALS FOUND! (Attempt ${attempt})\n`);
      console.log('═══════════════════════════════════════════════════');
      
      for (const signal of signals) {
        const action = signal.decision_action === 'LONG' ? '🟢 BUY' : '🔴 SELL';
        console.log(`\n${action} ${signal.symbol}`);
        console.log(`  Entry:  ${signal.entry_price?.toFixed(2) || 'N/A'}`);
        console.log(`  Stop:   ${signal.stop_loss_price?.toFixed(2) || 'N/A'}`);
        console.log(`  Target: ${signal.target_price?.toFixed(2) || 'N/A'}`);
        console.log(`  R:R:    ${signal.risk_reward_ratio?.toFixed(2) || 'N/A'}:1`);
        console.log(`  Generated: ${new Date(signal.evaluation_time_utc).toLocaleString('en-US', {hour: '2-digit', minute:'2-digit', second:'2-digit', timeZone: 'UTC'})} UTC`);
      }
      
      console.log('\n═══════════════════════════════════════════════════');
      console.log('\n✨ VERIFICATION RESULTS:');
      console.log('');
      
      // Check if prices are in correct ranges
      const expectedRanges: Record<string, [number, number]> = {
        'NIFTY50': [22325, 24675],    // 23500 ± 5%
        'BANKNIFTY': [45125, 49875],  // 47500 ± 5%
        'CRUDEOIL': [6840, 7560],     // 7200 ± 5%
        'SENSEX': [74100, 81900],     // 78000 ± 5%
      };
      
      for (const signal of signals) {
        const range = expectedRanges[signal.symbol];
        if (!range) continue;
        
        const entry = signal.entry_price || 0;
        const inRange = entry >= range[0] && entry <= range[1];
        
        const status = inRange ? '✅' : '❌';
        console.log(`${status} ${signal.symbol}: Entry ${entry.toFixed(2)} (expected ${range[0].toFixed(0)}-${range[1].toFixed(0)})`);
      }
      
      process.exit(0);
    }
    
    process.stdout.write(`⏳ Waiting... attempt ${attempt}/${maxAttempts}\r`);
    await new Promise(resolve => setTimeout(resolve, 5000));
  }
  
  console.log('\n\n⏰ No signals generated within 3 minutes.');
  console.log('📊 Check persistent server logs:');
  console.log('   tail -50 /tmp/persistent.log | grep -E "(Candle|Signal|Decision)"\n');
  process.exit(1);
}

checkSignals();
