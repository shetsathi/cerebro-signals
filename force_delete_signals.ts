import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_ANON_KEY!,
);

async function forceDelete() {
  try {
    console.log('🗑️  Force deleting all signals...');
    
    // Delete all signals (no condition, just delete all)
    const { error } = await supabase
      .from('signals')
      .delete()
      .neq('signal_id', '00000000-0000-0000-0000-000000000000'); // Always true condition
    
    if (error) {
      console.error('❌ Delete error:', error);
      return;
    }
    
    console.log('✅ Signals deleted');
    
    // Verify
    const { data, error: checkError } = await supabase
      .from('signals')
      .select('*');
    
    if (checkError) {
      console.error('Error checking:', checkError);
    } else {
      console.log(`\n✅ Verification: ${data?.length || 0} signals remaining`);
      if (data && data.length === 0) {
        console.log('🎉 Database is completely clean!');
      }
    }
  } catch (error) {
    console.error('Error:', (error as Error).message);
  }
}

forceDelete();
