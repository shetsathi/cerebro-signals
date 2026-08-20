import { BrokerAdapter, BrokerCandle } from './broker-adapter.interface';

export class AngelOneAdapter implements BrokerAdapter {
  constructor(
    private apiKey?: string,
    private clientCode?: string,
  ) {}

  async getCandles(symbol: string, timeframe: string, limit?: number): Promise<BrokerCandle[]> {
    throw new Error(
      'Angel One adapter not yet implemented. This is a placeholder for market data integration.',
    );
  }

  subscribeToCandles(
    symbol: string,
    timeframe: string,
    onCandle: (candle: BrokerCandle) => void,
  ): void {
    throw new Error(
      'Angel One WebSocket subscription not yet implemented. This is a placeholder for live market data.',
    );
  }

  unsubscribe(symbol: string, timeframe: string): void {
    throw new Error(
      'Angel One unsubscribe not yet implemented. This is a placeholder for live market data.',
    );
  }
}
