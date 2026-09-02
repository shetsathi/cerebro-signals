import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';
import { Candle, CandleStatus } from './src/domain/candle';
import { Timeframe, TimeframeValue } from './src/domain/timeframe';
import { LiveOrchestrator, LiveOrchestratorConfig } from './src/live/live-orchestrator';
import { StructureConfig } from './src/domain/structure-config';
import { SetupEngineConfig } from './src/domain/setup-engine';
import { LevelEngineConfig } from './src/domain/level-engine';
import { TriggerEngineConfig } from './src/domain/trigger-engine';
import { RiskEngineConfig } from './src/domain/risk-engine';
import { DecisionEngineConfig } from './src/domain/decision-engine';

const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_ANON_KEY!,
);

async function testSignalGeneration() {
  console.log('🧪 Testing signal generation with test candles...\n');
  
  const symbols = ['SENSEX', 'BANKNIFTY', 'CRUDEOIL', 'NIFTY50'];
  
  for (const symbol of symbols) {
    console.log(`\n${'═'.repeat(60)}`);
    console.log(`📊 Testing ${symbol}...`);
    console.log('═'.repeat(60));
    
    // Load test candles
    const { data: candlesData, error } = await supabase
      .from('candles')
      .select('*')
      .eq('symbol', symbol)
      .order('close_time_utc', { ascending: true });
    
    if (error || !candlesData || candlesData.length === 0) {
      console.error('❌ Failed to load candles:', error);
      continue;
    }
    
    console.log(`✅ Loaded ${candlesData.length} candles`);
    
    // Convert to Candle objects
    const candles = candlesData.map(c => new Candle(
      c.symbol,
      Timeframe.from(c.timeframe as TimeframeValue),
      new Date(c.open_time_utc),
      new Date(c.close_time_utc),
      { open: c.open, high: c.high, low: c.low, close: c.close, volume: c.volume },
      CandleStatus.CLOSED,
      new Date(c.knowledge_time_utc),
      c.id
    ));
    
    // Show price range
    const prices = candles.map(c => c.ohlc.close);
    const minPrice = Math.min(...prices);
    const maxPrice = Math.max(...prices);
    console.log(`📈 Price range: ${minPrice.toFixed(2)} - ${maxPrice.toFixed(2)}`);
    console.log(`💰 Latest close: ${prices[prices.length - 1].toFixed(2)}`);
    
    // Create orchestrator and evaluate
    const config: LiveOrchestratorConfig = {
      decisionConfig: { rulesetVersion: 'V1', configHash: 'TEST' },
      riskConfig: { minimumRR: 2.0, rulesetVersion: 'V1', configHash: 'TEST' },
      triggerConfig: { rulesetVersion: 'V1', configHash: 'TEST' },
      setupConfig: { rulesetVersion: 'V1', configHash: 'TEST' },
      levelConfig: { k: 3, maxBarsFailedBreak: 3, maxBarsAfterBreak: 10, rulesetVersion: 'V1', configHash: 'TEST' },
      structureConfig: { rulesetVersion: 'V1', configHash: 'TEST' },
    };
    
    const orchestrator = new LiveOrchestrator(symbol, config);
    
    let signalGenerated = false;
    orchestrator.on('signal', (signal: any) => {
      signalGenerated = true;
      console.log(`\n✅ SIGNAL GENERATED!`);
      console.log(`   Action: ${signal.action}`);
      console.log(`   Entry: ${signal.entryPrice.toFixed(2)}`);
      console.log(`   Stop: ${signal.stopPrice.toFixed(2)}`);
      console.log(`   Target: ${signal.targetPrice?.toFixed(2) || 'N/A'}`);
      console.log(`   R:R: ${signal.riskRewardRatio?.toFixed(2) || 'N/A'}`);
    });
    
    orchestrator.on('error', (err: Error) => {
      console.error('❌ Error:', err.message);
    });
    
    // Evaluate last candle
    const lastCandle = candles[candles.length - 1];
    await orchestrator.evaluate(candles, lastCandle);
    
    if (!signalGenerated) {
      console.log('⏳ No signal (needs more structure or different conditions)');
    }
  }
  
  console.log(`\n${'═'.repeat(60)}`);
  console.log('✅ Test complete!');
}

testSignalGeneration();
