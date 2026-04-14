import type { NormalizedFuturesCandle } from "../../types/market";

export function normalizeFuturesCandles(candles: NormalizedFuturesCandle[]) {
  return candles
    .slice()
    .sort((a, b) => Date.parse(a.timestamp) - Date.parse(b.timestamp))
    .map((candle) => ({
      ...candle,
      open: Number(candle.open),
      high: Number(candle.high),
      low: Number(candle.low),
      close: Number(candle.close),
      volume: Number(candle.volume),
    }));
}
