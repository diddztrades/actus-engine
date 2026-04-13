export type MarketTimeframe = "1m" | "5m" | "15m" | "1h";

export type NormalizedFuturesCandle = {
  asset: string;
  symbol: string;
  timeframe: MarketTimeframe;
  timestamp: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
};
