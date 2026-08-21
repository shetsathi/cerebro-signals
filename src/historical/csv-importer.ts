/**
 * CSV IMPORTER FOR HISTORICAL DATA
 *
 * Converts CSV exports to Candle objects
 * Source-agnostic CSV parser
 */

import { RawHistoricalCandle, HistoricalImportConfig, rawToCandleModel } from './data-contracts';
import { Candle } from '../domain/candle';

export interface CSVImportResult {
  candles: Candle[];
  rowsProcessed: number;
  rowsValid: number;
  rowsSkipped: number;
  errors: { rowNumber: number; message: string }[];
}

/**
 * Simple CSV parser (no external dependencies)
 * Assumes header row + data rows
 * Handles quoted fields with embedded commas
 */
export function parseCSV(csvContent: string): string[][] {
  const lines = csvContent.split('\n');
  const rows: string[][] = [];

  for (const line of lines) {
    if (!line.trim()) continue; // skip empty lines

    const row: string[] = [];
    let current = '';
    let inQuotes = false;

    for (let i = 0; i < line.length; i++) {
      const char = line[i];
      const nextChar = line[i + 1];

      if (char === '"') {
        if (inQuotes && nextChar === '"') {
          current += '"';
          i++; // skip next quote
        } else {
          inQuotes = !inQuotes;
        }
      } else if (char === ',' && !inQuotes) {
        row.push(current.trim());
        current = '';
      } else {
        current += char;
      }
    }
    row.push(current.trim());
    rows.push(row);
  }

  return rows;
}

/**
 * Import NIFTY candles from CSV
 *
 * Expected CSV columns (order-insensitive):
 * symbol, timeframe, openTime, closeTime, open, high, low, close, volume
 *
 * Example:
 * symbol,timeframe,openTime,closeTime,open,high,low,close,volume
 * NIFTY,5m,2024-01-15T09:15:00Z,2024-01-15T09:20:00Z,22500.0,22520.5,22495.0,22515.0,1250000
 */
export async function importFromCSV(
  csvContent: string,
  config: HistoricalImportConfig,
): Promise<CSVImportResult> {
  const result: CSVImportResult = {
    candles: [],
    rowsProcessed: 0,
    rowsValid: 0,
    rowsSkipped: 0,
    errors: [],
  };

  const rows = parseCSV(csvContent);

  if (rows.length < 2) {
    result.errors.push({ rowNumber: 0, message: 'CSV must have header + data rows' });
    return result;
  }

  // Parse header
  const headerRow = rows[0];
  const header = headerRow.map(h => h.toLowerCase());

  const columnMap: { [key: string]: number | undefined } = {
    symbol: header.indexOf('symbol'),
    timeframe: header.indexOf('timeframe'),
    openTime: header.indexOf('opentime'),
    closeTime: header.indexOf('closetime'),
    open: header.indexOf('open'),
    high: header.indexOf('high'),
    low: header.indexOf('low'),
    close: header.indexOf('close'),
    volume: header.indexOf('volume'),
  };

  // Validate required columns (check both -1 and undefined)
  const required = ['symbol', 'timeframe', 'openTime', 'closeTime', 'open', 'high', 'low', 'close'];
  for (const col of required) {
    if (columnMap[col] === undefined || columnMap[col] === -1) {
      result.errors.push({ rowNumber: 0, message: `Missing required column: ${col}` });
      return result;
    }
  }

  // Process data rows
  for (let i = 1; i < rows.length; i++) {
    const row = rows[i];
    result.rowsProcessed++;

    try {
      const raw: RawHistoricalCandle = {
        symbol: row[columnMap.symbol!],
        timeframe: row[columnMap.timeframe!],
        openTime: row[columnMap.openTime!],
        closeTime: row[columnMap.closeTime!],
        open: parseFloat(row[columnMap.open!]),
        high: parseFloat(row[columnMap.high!]),
        low: parseFloat(row[columnMap.low!]),
        close: parseFloat(row[columnMap.close!]),
        volume: columnMap.volume !== -1 ? parseFloat(row[columnMap.volume!]) : undefined,
        timezone: config.timezone,
      };

      const { candle, errors } = rawToCandleModel(raw, config);

      if (errors.length > 0) {
        const errorMessages = errors.map(e => e.message).join('; ');
        result.errors.push({ rowNumber: i + 1, message: errorMessages });
        result.rowsSkipped++;

        if (config.strictValidation) {
          return result;
        }
      } else if (candle) {
        result.candles.push(candle);
        result.rowsValid++;
      }
    } catch (e) {
      result.errors.push({ rowNumber: i + 1, message: `Parse error: ${e}` });
      result.rowsSkipped++;

      if (config.strictValidation) {
        return result;
      }
    }
  }

  return result;
}
