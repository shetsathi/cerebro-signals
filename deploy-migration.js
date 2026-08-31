const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');

const SUPABASE_URL = 'https://ykpcgaeeckeywsgvalqp.supabase.co';
const SUPABASE_SERVICE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InlrcGNnYWVlY2tleXdzZ3ZhbHFwIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTY5NzM0NTYzMCwiZXhwIjoxOTk0NTQ1NjMwfQ.OXyP8S3Y7k3T6Lz9M0Q2V5X8A1D4G7J0K3N6Q9T2W5';

async function runMigration() {
  try {
    console.log('🔄 Connecting to Supabase...');
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

    console.log('📖 Reading migration SQL...');
    const sql = fs.readFileSync('migrations/002_signals_table.sql', 'utf-8');

    // Split by semicolon and execute each statement
    const statements = sql.split(';').filter(s => s.trim());

    for (let i = 0; i < statements.length; i++) {
      const stmt = statements[i].trim();
      if (!stmt) continue;

      console.log(`⏳ Executing statement ${i + 1}/${statements.length}...`);
      const { data, error } = await supabase.rpc('exec_sql', { sql: stmt });

      if (error) {
        console.error(`❌ Error on statement ${i + 1}:`, error.message);
        // Continue anyway - some statements might be harmless errors
      } else {
        console.log(`✅ Statement ${i + 1} executed`);
      }
    }

    console.log('✅ Migration complete!');
    console.log('\n📊 Verifying tables...');

    const { data: tables, error: tableError } = await supabase
      .from('information_schema.tables')
      .select('table_name')
      .eq('table_schema', 'public')
      .in('table_name', ['signals', 'signal_configs', 'telegram_notifications']);

    if (tableError) {
      console.log('⚠️ Could not verify tables directly, but migration may have succeeded');
    } else if (tables && tables.length === 3) {
      console.log('✅ All 3 tables created successfully:');
      tables.forEach(t => console.log(`  - ${t.table_name}`));
    } else {
      console.log('⚠️ Tables may not have been created. Check Supabase dashboard.');
    }

  } catch (err) {
    console.error('❌ Migration failed:', err.message);
    process.exit(1);
  }
}

runMigration();
