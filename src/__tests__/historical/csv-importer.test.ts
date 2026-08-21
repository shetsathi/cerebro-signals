import { importFromCSV, parseCSV } from '../../historical/csv-importer';
import { HistoricalImportConfig } from '../../historical/data-contracts';

describe('Historical Data — CSV Importer', () => {
  describe('CSV Parser', () => {
    it('should parse simple CSV without quotes', () => {
      const csv = 'a,b,c\n1,2,3\n4,5,6';
      const rows = parseCSV(csv);
      expect(rows).toEqual([
        ['a', 'b', 'c'],
        ['1', '2', '3'],
        ['4', '5', '6'],
      ]);
    });

    it('should handle quoted fields with commas', () => {
      const csv = 'name,description\n"John Doe","Hello, world"\n"Jane","Goodbye"';
      const rows = parseCSV(csv);
      expect(rows[1][0]).toBe('John Doe');
      expect(rows[1][1]).toBe('Hello, world');
    });

    it('should skip empty lines', () => {
      const csv = 'a,b\n1,2\n\n3,4';
      const rows = parseCSV(csv);
      expect(rows.length).toBe(3); // header + 2 data rows
    });
  });

  describe('CSV Import', () => {
    const config: HistoricalImportConfig = {
      source: 'test',
      timezone: 'UTC',
      assumeKnowledgeTime: 'closeTime',
      strictValidation: false,
      allowGaps: true,
    };

    it('should import valid NIFTY candles', async () => {
      const csv = `symbol,timeframe,openTime,closeTime,open,high,low,close,volume
NIFTY,5m,2024-01-15T09:15:00Z,2024-01-15T09:20:00Z,22500.0,22520.5,22495.0,22515.0,1250000
NIFTY,5m,2024-01-15T09:20:00Z,2024-01-15T09:25:00Z,22515.0,22530.0,22510.0,22525.0,1300000`;

      const result = await importFromCSV(csv, config);

      expect(result.rowsValid).toBe(2);
      expect(result.rowsSkipped).toBe(0);
      expect(result.candles.length).toBe(2);
      expect(result.candles[0].symbol).toBe('NIFTY');
      expect(result.candles[0].ohlc.close).toBe(22515.0);
    });

    it('should reject invalid OHLC (high < low)', async () => {
      const csv = `symbol,timeframe,openTime,closeTime,open,high,low,close,volume
NIFTY,5m,2024-01-15T09:15:00Z,2024-01-15T09:20:00Z,22500.0,22495.0,22520.5,22515.0,1250000`;

      const result = await importFromCSV(csv, { ...config, strictValidation: false });

      expect(result.rowsSkipped).toBeGreaterThan(0);
      expect(result.errors.length).toBeGreaterThan(0);
    });

    it('should reject zero prices', async () => {
      const csv = `symbol,timeframe,openTime,closeTime,open,high,low,close,volume
NIFTY,5m,2024-01-15T09:15:00Z,2024-01-15T09:20:00Z,0,22520.5,22495.0,22515.0,1250000`;

      const result = await importFromCSV(csv, { ...config, strictValidation: false });

      expect(result.rowsSkipped).toBeGreaterThan(0);
    });

    it('should handle missing volume gracefully', async () => {
      const csv = `symbol,timeframe,openTime,closeTime,open,high,low,close
NIFTY,5m,2024-01-15T09:15:00Z,2024-01-15T09:20:00Z,22500.0,22520.5,22495.0,22515.0`;

      const result = await importFromCSV(csv, config);

      expect(result.candles.length).toBe(1);
      expect(result.candles[0].ohlc.volume).toBe(0);
    });

    it('should reject missing required columns', async () => {
      const csv = `symbol,timeframe,open,high,low,close
NIFTY,5m,22500.0,22520.5,22495.0,22515.0`;

      const result = await importFromCSV(csv, config);

      expect(result.errors.length).toBeGreaterThan(0);
      expect(result.candles.length).toBe(0);
    });

    it('should stop on first error in strict mode', async () => {
      const csv = `symbol,timeframe,openTime,closeTime,open,high,low,close,volume
NIFTY,5m,2024-01-15T09:15:00Z,2024-01-15T09:20:00Z,22500.0,22520.5,22495.0,22515.0,1250000
NIFTY,5m,invalid,invalid,0,0,0,0,0`;

      const result = await importFromCSV(csv, { ...config, strictValidation: true });

      expect(result.errors.length).toBeGreaterThan(0);
      expect(result.candles.length).toBe(1);
    });
  });
});
