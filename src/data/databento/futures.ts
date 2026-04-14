import type { MarketTimeframe } from "../../types/market";
import { DATABENTO_CORE_ASSETS } from "./symbols";
import { fetchDatabentoFuturesHistory } from "./history";
import { subscribeDatabentoFuturesLive } from "./live";
import type { DatabentoCoreAsset } from "./types";

export async function backfillCoreFutures(timeframe: MarketTimeframe) {
  const entries = await Promise.all(
    DATABENTO_CORE_ASSETS.map(async (asset) => [asset, await fetchDatabentoFuturesHistory({ asset, timeframe })] as const),
  );

  return Object.fromEntries(entries) as Record<DatabentoCoreAsset, Awaited<ReturnType<typeof fetchDatabentoFuturesHistory>>>;
}

export function streamCoreFutures(
  timeframe: MarketTimeframe,
  handlers: {
    onCandles: Parameters<typeof subscribeDatabentoFuturesLive>[0]["onCandles"];
    onStatus?: Parameters<typeof subscribeDatabentoFuturesLive>[0]["onStatus"];
    onError?: Parameters<typeof subscribeDatabentoFuturesLive>[0]["onError"];
  },
) {
  return subscribeDatabentoFuturesLive({
    assets: DATABENTO_CORE_ASSETS,
    timeframe,
    onCandles: handlers.onCandles,
    onStatus: handlers.onStatus,
    onError: handlers.onError,
  });
}
