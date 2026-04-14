import type { MarketTimeframe, NormalizedFuturesCandle } from "../../types/market";
import { databentoUrl } from "./client";
import type { DatabentoCoreAsset, DatabentoLiveEvent } from "./types";

export function subscribeDatabentoFuturesLive(args: {
  assets: DatabentoCoreAsset[];
  timeframe: MarketTimeframe;
  onCandles: (candles: NormalizedFuturesCandle[]) => void;
  onStatus?: (event: DatabentoLiveEvent) => void;
  onError?: (message: string) => void;
}) {
  const source = new EventSource(
    databentoUrl("/api/databento/futures/live", {
      assets: args.assets.join(","),
      timeframe: args.timeframe,
    }),
  );

  source.addEventListener("ready", (event) => {
    args.onStatus?.({ type: "ready", payload: JSON.parse((event as MessageEvent).data) });
  });

  source.addEventListener("candles", (event) => {
    const payload = JSON.parse((event as MessageEvent).data) as NormalizedFuturesCandle[];
    args.onCandles(payload);
  });

  source.addEventListener("heartbeat", (event) => {
    args.onStatus?.({ type: "heartbeat", payload: JSON.parse((event as MessageEvent).data) });
  });

  source.addEventListener("error", (event) => {
    const data = (event as MessageEvent).data;
    if (data) {
      const payload = JSON.parse(data) as { ok: false; error: string };
      args.onError?.(payload.error);
      args.onStatus?.({ type: "error", payload });
    } else {
      args.onError?.("Databento live stream disconnected.");
    }
  });

  return () => source.close();
}
