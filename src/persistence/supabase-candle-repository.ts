import { SupabaseClient } from '@supabase/supabase-js';
import { Candle, CandleStatus } from '../domain/candle';
import { Timeframe } from '../domain/timeframe';
import { CandleRepository } from './candle-repository.interface';

interface CandleRow {
  id: string;
  symbol: string;
  timeframe: string;
  open_time_utc: string;
  close_time_utc: string;
  knowledge_time_utc: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
  status: string;
  created_at?: string;
  updated_at?: string;
}

export class SupabaseCandleRepository implements CandleRepository {
  constructor(private supabase: SupabaseClient) {}

  async save(candle: Candle): Promise<void> {
    const row = this.candleToRow(candle);

    const { error } = await this.supabase
      .from('candles')
      .upsert([row], { onConflict: 'id' });

    if (error) {
      throw new Error(`Failed to save candle: ${error.message}`);
    }
  }

  async saveBatch(candles: Candle[]): Promise<void> {
    if (candles.length === 0) return;

    const rows = candles.map((c) => this.candleToRow(c));

    const { error } = await this.supabase
      .from('candles')
      .upsert(rows, { onConflict: 'id' });

    if (error) {
      throw new Error(`Failed to save batch: ${error.message}`);
    }
  }

  async getByKey(symbol: string, timeframe: Timeframe, openTimeUTC: Date): Promise<Candle | null> {
    const id = `${symbol}-${timeframe.value}-${openTimeUTC.getTime()}`;

    const { data, error } = await this.supabase
      .from('candles')
      .select('*')
      .eq('id', id)
      .single();

    if (error && error.code !== 'PGRST116') {
      // PGRST116 = no rows found
      throw new Error(`Failed to get candle: ${error.message}`);
    }

    return data ? this.rowToCandle(data as CandleRow) : null;
  }

  async getBySymbolAndTimeframe(symbol: string, timeframe: Timeframe): Promise<Candle[]> {
    const { data, error } = await this.supabase
      .from('candles')
      .select('*')
      .eq('symbol', symbol)
      .eq('timeframe', timeframe.value)
      .order('open_time_utc', { ascending: true });

    if (error) {
      throw new Error(`Failed to get candles: ${error.message}`);
    }

    return (data as CandleRow[]).map((row) => this.rowToCandle(row));
  }

  async getAfter(symbol: string, timeframe: Timeframe, afterTimeUTC: Date): Promise<Candle[]> {
    const { data, error } = await this.supabase
      .from('candles')
      .select('*')
      .eq('symbol', symbol)
      .eq('timeframe', timeframe.value)
      .gt('open_time_utc', afterTimeUTC.toISOString())
      .order('open_time_utc', { ascending: true });

    if (error) {
      throw new Error(`Failed to get candles: ${error.message}`);
    }

    return (data as CandleRow[]).map((row) => this.rowToCandle(row));
  }

  async getBefore(symbol: string, timeframe: Timeframe, beforeTimeUTC: Date): Promise<Candle[]> {
    const { data, error } = await this.supabase
      .from('candles')
      .select('*')
      .eq('symbol', symbol)
      .eq('timeframe', timeframe.value)
      .lt('open_time_utc', beforeTimeUTC.toISOString())
      .order('open_time_utc', { ascending: false });

    if (error) {
      throw new Error(`Failed to get candles: ${error.message}`);
    }

    return (data as CandleRow[]).map((row) => this.rowToCandle(row));
  }

  async getRange(
    symbol: string,
    timeframe: Timeframe,
    fromTimeUTC: Date,
    toTimeUTC: Date,
  ): Promise<Candle[]> {
    const { data, error } = await this.supabase
      .from('candles')
      .select('*')
      .eq('symbol', symbol)
      .eq('timeframe', timeframe.value)
      .gte('open_time_utc', fromTimeUTC.toISOString())
      .lte('open_time_utc', toTimeUTC.toISOString())
      .order('open_time_utc', { ascending: true });

    if (error) {
      throw new Error(`Failed to get candles: ${error.message}`);
    }

    return (data as CandleRow[]).map((row) => this.rowToCandle(row));
  }

  async delete(symbol: string, timeframe: Timeframe, openTimeUTC: Date): Promise<void> {
    const id = `${symbol}-${timeframe.value}-${openTimeUTC.getTime()}`;

    const { error } = await this.supabase.from('candles').delete().eq('id', id);

    if (error) {
      throw new Error(`Failed to delete candle: ${error.message}`);
    }
  }

  async deleteAll(symbol: string, timeframe: Timeframe): Promise<void> {
    const { error } = await this.supabase
      .from('candles')
      .delete()
      .eq('symbol', symbol)
      .eq('timeframe', timeframe.value);

    if (error) {
      throw new Error(`Failed to delete candles: ${error.message}`);
    }
  }

  async count(symbol: string, timeframe: Timeframe): Promise<number> {
    const { count, error } = await this.supabase
      .from('candles')
      .select('*', { count: 'exact', head: true })
      .eq('symbol', symbol)
      .eq('timeframe', timeframe.value);

    if (error) {
      throw new Error(`Failed to count candles: ${error.message}`);
    }

    return count || 0;
  }

  private candleToRow(candle: Candle): CandleRow {
    return {
      id: candle.id,
      symbol: candle.symbol,
      timeframe: candle.timeframe.value,
      open_time_utc: candle.openTimeUTC.toISOString(),
      close_time_utc: candle.closeTimeUTC.toISOString(),
      knowledge_time_utc: candle.knowledgeTimeUTC.toISOString(),
      open: candle.ohlc.open,
      high: candle.ohlc.high,
      low: candle.ohlc.low,
      close: candle.ohlc.close,
      volume: candle.ohlc.volume,
      status: candle.status,
    };
  }

  private rowToCandle(row: CandleRow): Candle {
    return new Candle(
      row.symbol,
      Timeframe.from(row.timeframe),
      new Date(row.open_time_utc),
      new Date(row.close_time_utc),
      {
        open: row.open,
        high: row.high,
        low: row.low,
        close: row.close,
        volume: row.volume,
      },
      row.status as CandleStatus,
      new Date(row.knowledge_time_utc),
    );
  }
}
