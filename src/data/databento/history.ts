import type { MarketTimeframe, NormalizedFuturesCandle } from "../../types/market";
import { normalizeFuturesCandles } from "./adapter";
import { databentoJson } from "./client";
import type { DatabentoCoreAsset, DatabentoHistoryResponse } from "./types";
import { logTimeframeFetch, validateCandleSpacing } from "../../lib/timeframeDiagnostics";

export async function fetchDatabentoFuturesHistory(args: {
  asset: DatabentoCoreAsset;
  timeframe: MarketTimeframe;
  start?: string;
  end?: string;
  limit?: number;
}): Promise<NormalizedFuturesCandle[]> {
  const payload = await databentoJson<DatabentoHistoryResponse>("/api/databento/futures/history", args);
  const candles = normalizeFuturesCandles(payload.candles);
  logTimeframeFetch({
    symbol: args.asset,
    timeframe: args.timeframe,
    requested: args.limit,
    candles,
  });
  validateCandleSpacing(args.asset, args.timeframe, candles);
  return candles;
}
