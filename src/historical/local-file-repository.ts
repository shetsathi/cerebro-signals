/**
 * LOCAL FILE-BASED HISTORICAL DATASET STORAGE
 *
 * Stores validated candles in JSON Lines format (local, no network required)
 * One JSON object per line for streaming compatibility
 */

import { Candle, CandleStatus, CandleOHLC } from '../domain/candle';
import { Timeframe } from '../domain/timeframe';
import { DatasetManifest } from './data-contracts';
import { ManifestBuilder } from './dataset-manifest';
import * as fs from 'fs';
import * as path from 'path';

export interface LocalDataset {
  manifest: DatasetManifest;
  filePath: string;
}

export class LocalFileRepository {
  private readonly datasetDir: string;

  constructor(datasetRootDir: string = 'datasets') {
    this.datasetDir = datasetRootDir;
    this.ensureDirectoryExists(datasetRootDir);
  }

  /**
   * Save dataset to local files
   * Returns: { manifest.json, candles.jsonl }
   */
  async saveDataset(
    manifest: DatasetManifest,
    candles: Candle[],
  ): Promise<{ manifestPath: string; candlesPath: string }> {
    const datasetPath = path.join(this.datasetDir, manifest.datasetId);
    this.ensureDirectoryExists(datasetPath);

    // Save manifest
    const manifestPath = path.join(datasetPath, 'manifest.json');
    fs.writeFileSync(manifestPath, ManifestBuilder.toJSON(manifest), 'utf8');

    // Save candles as JSONL (one JSON per line)
    const candlesPath = path.join(datasetPath, 'candles.jsonl');
    const candlesStream = fs.createWriteStream(candlesPath, { flags: 'w', encoding: 'utf8' });

    const sorted = [...candles].sort((a, b) => a.openTimeUTC.getTime() - b.openTimeUTC.getTime());

    for (const candle of sorted) {
      const candleJSON = this.serializeCandle(candle);
      candlesStream.write(candleJSON + '\n');
    }

    return new Promise((resolve, reject) => {
      candlesStream.end(() => resolve({ manifestPath, candlesPath }));
      candlesStream.on('error', reject);
    });
  }

  /**
   * Load dataset from local files
   */
  async loadDataset(datasetId: string): Promise<LocalDataset | null> {
    const datasetPath = path.join(this.datasetDir, datasetId);

    if (!fs.existsSync(datasetPath)) {
      return null;
    }

    const manifestPath = path.join(datasetPath, 'manifest.json');
    if (!fs.existsSync(manifestPath)) {
      return null;
    }

    try {
      const manifestJSON = fs.readFileSync(manifestPath, 'utf8');
      const manifest = ManifestBuilder.fromJSON(manifestJSON);

      const candlesPath = path.join(datasetPath, 'candles.jsonl');

      return {
        manifest,
        filePath: candlesPath,
      };
    } catch (e) {
      console.error(`Failed to load dataset ${datasetId}:`, e);
      return null;
    }
  }

  /**
   * Stream candles from local file deterministically
   * Yields candles in chronological order
   */
  async *streamCandles(filePath: string): AsyncGenerator<Candle> {
    if (!fs.existsSync(filePath)) {
      throw new Error(`File not found: ${filePath}`);
    }

    const lines = fs.readFileSync(filePath, 'utf8').split('\n');

    for (const line of lines) {
      if (!line.trim()) continue;

      try {
        const candle = this.deserializeCandle(line);
        yield candle;
      } catch (e) {
        console.error(`Failed to deserialize candle: ${e}`);
        throw e;
      }
    }
  }

  /**
   * Load all candles from dataset into memory
   * Use for replay operations
   */
  async loadAllCandles(filePath: string): Promise<Candle[]> {
    const candles: Candle[] = [];

    for await (const candle of this.streamCandles(filePath)) {
      candles.push(candle);
    }

    return candles;
  }

  /**
   * List all available datasets
   */
  listDatasets(): string[] {
    if (!fs.existsSync(this.datasetDir)) {
      return [];
    }

    return fs.readdirSync(this.datasetDir).filter(name => {
      const fullPath = path.join(this.datasetDir, name);
      return fs.statSync(fullPath).isDirectory();
    });
  }

  /**
   * Delete dataset from local storage
   */
  async deleteDataset(datasetId: string): Promise<void> {
    const datasetPath = path.join(this.datasetDir, datasetId);

    if (!fs.existsSync(datasetPath)) {
      return;
    }

    // Simple recursive delete
    const rm = (dir: string) => {
      if (fs.existsSync(dir)) {
        fs.readdirSync(dir).forEach(file => {
          const fullPath = path.join(dir, file);
          if (fs.statSync(fullPath).isDirectory()) {
            rm(fullPath);
          } else {
            fs.unlinkSync(fullPath);
          }
        });
        fs.rmdirSync(dir);
      }
    };

    rm(datasetPath);
  }

  /**
   * Serialize Candle to JSON (removing unprintable dates)
   */
  private serializeCandle(candle: Candle): string {
    return JSON.stringify({
      symbol: candle.symbol,
      timeframe: candle.timeframe.value,
      openTimeUTC: candle.openTimeUTC.toISOString(),
      closeTimeUTC: candle.closeTimeUTC.toISOString(),
      ohlc: candle.ohlc,
      status: candle.status,
      knowledgeTimeUTC: candle.knowledgeTimeUTC.toISOString(),
    });
  }

  /**
   * Deserialize JSON to Candle
   */
  private deserializeCandle(json: string): Candle {
    const data = JSON.parse(json);

    const ohlc: CandleOHLC = {
      open: data.ohlc.open,
      high: data.ohlc.high,
      low: data.ohlc.low,
      close: data.ohlc.close,
      volume: data.ohlc.volume,
    };

    const timeframe = Timeframe.from(data.timeframe);

    return new Candle(
      data.symbol,
      timeframe,
      new Date(data.openTimeUTC),
      new Date(data.closeTimeUTC),
      ohlc,
      data.status as CandleStatus,
      new Date(data.knowledgeTimeUTC),
    );
  }

  private ensureDirectoryExists(dir: string): void {
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
  }
}
