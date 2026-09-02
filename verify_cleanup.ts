import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_ANON_KEY!,
);

async function verifyCleanup() {
  try {
    // Check signals
    const { data: signals, error: signalsError } = await supabase
      .from('signals')
      .select('*');
    
    if (signalsError) {
      console.error('Error querying signals:', signalsError);
    } else {
      console.log(`📊 Signals in DB: ${signals?.length || 0}`);
      if (signals && signals.length > 0) {
        console.log('Remaining signals:');
        signals.forEach(s => {
          console.log(`  - ${s.symbol} ${s.decision_action} @ ${s.evaluation_time_utc}`);
        });
      }
    }
    
    // Check notifications
    const { data: notifications, error: notifError } = await supabase
      .from('telegram_notifications')
      .select('*');
    
    if (notifError) {
      console.error('Error querying notifications:', notifError);
    } else {
      console.log(`📱 Telegram notifications in DB: ${notifications?.length || 0}`);
    }
    
    if (!signals || signals.length === 0) {
      console.log('\n✅ Database is clean! Ready to restart with new signals.');
    }
  } catch (error) {
    console.error('Error:', (error as Error).message);
  }
}

verifyCleanup();
