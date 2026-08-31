import { LocalFileRepository } from './src/historical/local-file-repository';
import { ReplayEngine, ReplayConfig } from './src/historical/replay-engine';

async function test() {
  const repo = new LocalFileRepository('datasets');
  const dataset = await repo.loadDataset('NIFTY-5m-2023-2026');
  if (!dataset) throw new Error('Dataset not found');

  console.log('Loading candles...');
  const candles = await repo.loadAllCandles(dataset.filePath);
  console.log(`Loaded ${candles.length} candles`);

  const replayConfig: ReplayConfig = {
    symbol: 'NIFTY 50',
    timeframes: ['5m'],
    startDateUTC: candles[0].openTimeUTC,
    endDateUTC: candles[candles.length - 1].closeTimeUTC,
  };

  console.log('Testing ReplayEngine...');
  let count = 0;
  for await (const event of ReplayEngine.replay(candles, replayConfig)) {
    count++;
    if (count % 5000 === 0) {
      console.log(`Processed ${count} events, current time: ${event.asOfTimeUTC.toISOString()}`);
    }
    if (count >= 100) break; // Test just first 100 events
  }
  console.log(`Total events replayed: ${count}`);
}

test().catch(e => {
  console.error('Error:', e);
  process.exit(1);
});
