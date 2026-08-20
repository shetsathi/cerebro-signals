import { Candle } from '../domain/candle';
import { Timeframe } from '../domain/timeframe';

export interface CandleRepository {
  save(candle: Candle): Promise<void>;
  saveBatch(candles: Candle[]): Promise<void>;
  getByKey(symbol: string, timeframe: Timeframe, openTimeUTC: Date): Promise<Candle | null>;
  getBySymbolAndTimeframe(symbol: string, timeframe: Timeframe): Promise<Candle[]>;
  getAfter(symbol: string, timeframe: Timeframe, afterTimeUTC: Date): Promise<Candle[]>;
  getBefore(symbol: string, timeframe: Timeframe, beforeTimeUTC: Date): Promise<Candle[]>;
  getRange(
    symbol: string,
    timeframe: Timeframe,
    fromTimeUTC: Date,
    toTimeUTC: Date,
  ): Promise<Candle[]>;
  delete(symbol: string, timeframe: Timeframe, openTimeUTC: Date): Promise<void>;
  deleteAll(symbol: string, timeframe: Timeframe): Promise<void>;
  count(symbol: string, timeframe: Timeframe): Promise<number>;
}
