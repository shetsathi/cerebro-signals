export interface BrokerCandle {
  symbol: string;
  timeframe: string;
  openTime: Date;
  closeTime: Date;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

export interface BrokerAdapter {
  getCandles(symbol: string, timeframe: string, limit?: number): Promise<BrokerCandle[]>;
  subscribeToCandles(
    symbol: string,
    timeframe: string,
    onCandle: (candle: BrokerCandle) => void,
  ): void;
  unsubscribe(symbol: string, timeframe: string): void;
}
