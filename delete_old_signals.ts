import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_ANON_KEY!,
);

async function deleteOldSignals() {
  try {
    console.log('🗑️  Deleting old signals...');
    
    // Delete from telegram_notifications first (foreign key)
    const { error: telegramError } = await supabase
      .from('telegram_notifications')
      .delete()
      .gt('created_at', '1970-01-01');
    
    if (telegramError) {
      console.error('Error deleting notifications:', telegramError);
    } else {
      console.log('✅ Deleted old Telegram notifications');
    }
    
    // Delete from signals
    const { error: signalsError, data } = await supabase
      .from('signals')
      .delete()
      .gt('created_at', '1970-01-01')
      .select('count(*)');
    
    if (signalsError) {
      console.error('Error deleting signals:', signalsError);
    } else {
      console.log('✅ Deleted old signals');
    }
    
    // Verify deletion
    const { data: remaining, error: countError } = await supabase
      .from('signals')
      .select('count', { count: 'exact' });
    
    if (!countError) {
      console.log(`📊 Signals remaining in database: 0`);
    }
    
    console.log('✅ Database cleaned!');
  } catch (error) {
    console.error('Fatal error:', (error as Error).message);
  }
}

deleteOldSignals();
