import type { MarketTimeframe, NormalizedFuturesCandle } from "../types/market";

const EXPECTED_SPACING_SECONDS: Record<MarketTimeframe, number> = {
  "1m": 60,
  "5m": 300,
  "15m": 900,
  "1h": 3600,
};

type FetchDiagnostic = {
  symbol: string;
  timeframe: MarketTimeframe;
  requested?: number;
  candles: Pick<NormalizedFuturesCandle, "timestamp">[];
};

export function logTimeframeFetch({ symbol, timeframe, requested, candles }: FetchDiagnostic) {
  console.log("[ACTUS][TF CHECK]", {
    symbol,
    timeframe,
    requested: requested ?? null,
    received: candles.length,
    first: candles[0]?.timestamp ?? null,
    last: candles[candles.length - 1]?.timestamp ?? null,
  });
}

export function validateCandleSpacing(symbol: string, timeframe: MarketTimeframe, candles: Pick<NormalizedFuturesCandle, "timestamp">[]) {
  const expected = EXPECTED_SPACING_SECONDS[timeframe];
  if (!expected || candles.length < 2) {
    return;
  }

  for (let index = 1; index < candles.length; index += 1) {
    const current = Math.floor(new Date(candles[index].timestamp).getTime() / 1000);
    const previous = Math.floor(new Date(candles[index - 1].timestamp).getTime() / 1000);
    const diff = current - previous;

    if (diff !== expected) {
      console.warn("[ACTUS][TF GAP]", {
        symbol,
        timeframe,
        index,
        expected,
        actual: diff,
        previous: candles[index - 1].timestamp,
        current: candles[index].timestamp,
      });
    }
  }
}
