import type { MarketTimeframe, NormalizedFuturesCandle } from "../../types/market";
import { normalizeFuturesCandles } from "./adapter";
import { databentoJson } from "./client";
import type { DatabentoCoreAsset, DatabentoHistoryResponse } from "./types";
import { logTimeframeFetch, validateCandleSpacing } from "../../lib/timeframeDiagnostics";

const historyCache = new Map<string, { cachedAt: number; candles: NormalizedFuturesCandle[] }>();
const historyInFlight = new Map<string, Promise<NormalizedFuturesCandle[]>>();
const HISTORY_CACHE_TTL_MS = 15_000;

export async function fetchDatabentoFuturesHistory(args: {
  asset: DatabentoCoreAsset;
  timeframe: MarketTimeframe;
  start?: string;
  end?: string;
  limit?: number;
}): Promise<NormalizedFuturesCandle[]> {
  const cacheKey = JSON.stringify({
    asset: args.asset,
    timeframe: args.timeframe,
    start: args.start ?? null,
    end: args.end ?? null,
    limit: args.limit ?? null,
  });
  const cached = historyCache.get(cacheKey);
  if (cached && Date.now() - cached.cachedAt <= HISTORY_CACHE_TTL_MS) {
    return cached.candles;
  }

  const existingRequest = historyInFlight.get(cacheKey);
  if (existingRequest) {
    return existingRequest;
  }

  const request = databentoJson<DatabentoHistoryResponse>("/api/databento/futures/history", args)
    .then((payload) => {
      const candles = normalizeFuturesCandles(payload.candles);
      historyCache.set(cacheKey, { cachedAt: Date.now(), candles });
      logTimeframeFetch({
        symbol: args.asset,
        timeframe: args.timeframe,
        requested: args.limit,
        candles,
      });
      validateCandleSpacing(args.asset, args.timeframe, candles);
      return candles;
    })
    .finally(() => {
      historyInFlight.delete(cacheKey);
    });

  historyInFlight.set(cacheKey, request);
  return request;
}
