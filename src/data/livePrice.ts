import { databentoJson } from "./databento/client";

export type ActusLivePriceSnapshot = {
  asset: string;
  supportedAsset: boolean;
  price: number | null;
  updatedAt: string | null;
  source: string | null;
  sourceType: "last-trade" | "quote-mid" | null;
};

type ActusLivePriceResponse = {
  ok: boolean;
  asset: string;
  livePrice: ActusLivePriceSnapshot | null;
  error?: string;
};

const livePriceCache = new Map<string, { cachedAt: number; snapshot: ActusLivePriceSnapshot | null }>();
const livePriceInFlight = new Map<string, Promise<ActusLivePriceSnapshot | null>>();
const LIVE_PRICE_CACHE_TTL_MS = 1_500;

export async function fetchActusLivePrice(asset: string): Promise<ActusLivePriceSnapshot | null> {
  const cacheKey = asset.toUpperCase();
  const cached = livePriceCache.get(cacheKey);
  if (cached && Date.now() - cached.cachedAt <= LIVE_PRICE_CACHE_TTL_MS) {
    return cached.snapshot;
  }

  const existing = livePriceInFlight.get(cacheKey);
  if (existing) {
    return existing;
  }

  const request = databentoJson<ActusLivePriceResponse>("/api/actus/live-price", { asset })
    .then((payload) => {
      const snapshot = payload.livePrice ?? null;
      livePriceCache.set(cacheKey, { cachedAt: Date.now(), snapshot });
      return snapshot;
    })
    .finally(() => {
      livePriceInFlight.delete(cacheKey);
    });

  livePriceInFlight.set(cacheKey, request);
  return request;
}
