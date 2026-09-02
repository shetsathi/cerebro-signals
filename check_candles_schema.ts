import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_ANON_KEY!,
);

async function checkSchema() {
  const { data, error } = await supabase
    .from('candles')
    .select('*')
    .limit(1);
  
  if (data && data.length > 0) {
    console.log('✅ Sample candle row:');
    console.log(JSON.stringify(data[0], null, 2));
  } else {
    console.log('No candles found, checking table structure via query...');
  }
}

checkSchema();
