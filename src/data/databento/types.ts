import type { MarketTimeframe, NormalizedFuturesCandle } from "../../types/market";

export type DatabentoCoreAsset = "NQ" | "GC" | "CL";

export type DatabentoFutureDefinition = {
  asset: DatabentoCoreAsset;
  symbol: string;
  displayName: string;
  assetClass: "equity-index" | "metal" | "energy";
};

export type DatabentoHistoryResponse = {
  ok: boolean;
  asset: DatabentoCoreAsset;
  timeframe: MarketTimeframe;
  candles: NormalizedFuturesCandle[];
};

export type DatabentoLiveEvent =
  | { type: "ready"; payload: { ok: true; assets: DatabentoCoreAsset[]; timeframe: MarketTimeframe } }
  | { type: "candles"; payload: NormalizedFuturesCandle[] }
  | { type: "heartbeat"; payload: { ts: string; assets: DatabentoCoreAsset[]; timeframe: MarketTimeframe } }
  | { type: "error"; payload: { ok: false; error: string } };
