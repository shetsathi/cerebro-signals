/**
 * DATASET MANIFEST & PROVENANCE
 *
 * Tracks metadata about imported historical datasets
 * Enables reproducibility and auditability
 */

import { createHash } from 'crypto';
import { Candle } from '../domain/candle';
import { DatasetManifest, DataValidationError } from './data-contracts';

export class ManifestBuilder {
  /**
   * Generate manifest for a validated historical dataset
   */
  static generate(
    datasetId: string,
    source: string,
    instrument: string,
    timeframe: string,
    candles: Candle[],
    timezone: string,
    validationErrors: DataValidationError[],
    validationWarnings: DataValidationError[],
    rawDataChecksum: string,
    normalizationVersion: string = '1.0',
  ): DatasetManifest {
    if (candles.length === 0) {
      throw new Error('Cannot generate manifest for empty dataset');
    }

    const sorted = [...candles].sort((a, b) => a.openTimeUTC.getTime() - b.openTimeUTC.getTime());
    const first = sorted[0];
    const last = sorted[sorted.length - 1];

    const manifest: DatasetManifest = {
      datasetId,
      source,
      instrument,
      timeframe,
      dateRange: {
        fromDateUTC: first.openTimeUTC,
        toDateUTC: last.closeTimeUTC,
      },
      candleCount: candles.length,
      timezone,
      schema: {
        version: '1.0',
        fields: ['symbol', 'timeframe', 'openTimeUTC', 'closeTimeUTC', 'ohlc', 'status', 'knowledgeTimeUTC'],
      },
      validation: {
        status: validationErrors.length === 0 ? (validationWarnings.length === 0 ? 'PASSED' : 'WARNINGS') : 'FAILED',
        errorCount: validationErrors.length,
        warningCount: validationWarnings.length,
        errors: validationErrors,
      },
      checksumSHA256: rawDataChecksum,
      importedAtUTC: new Date(),
      normalizationVersion,
    };

    return manifest;
  }

  /**
   * Generate SHA256 checksum of raw data
   */
  static checksumData(data: string): string {
    return createHash('sha256').update(data).digest('hex');
  }

  /**
   * Serialize manifest to JSON for storage
   */
  static toJSON(manifest: DatasetManifest): string {
    return JSON.stringify(
      {
        ...manifest,
        dateRange: {
          fromDateUTC: manifest.dateRange.fromDateUTC.toISOString(),
          toDateUTC: manifest.dateRange.toDateUTC.toISOString(),
        },
        importedAtUTC: manifest.importedAtUTC.toISOString(),
      },
      null,
      2,
    );
  }

  /**
   * Deserialize manifest from JSON
   */
  static fromJSON(json: string): DatasetManifest {
    const data = JSON.parse(json);
    return {
      ...data,
      dateRange: {
        fromDateUTC: new Date(data.dateRange.fromDateUTC),
        toDateUTC: new Date(data.dateRange.toDateUTC),
      },
      importedAtUTC: new Date(data.importedAtUTC),
    };
  }
}
