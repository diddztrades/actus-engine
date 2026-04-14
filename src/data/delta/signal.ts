import { databentoJson } from "../databento/client";
import type { DeltaSignal } from "../../types/delta";

type DeltaSignalApiResponse = {
  ok: boolean;
  asset: string;
  signal: DeltaSignal | null;
  error?: string;
};

const deltaSignalCache = new Map<string, { cachedAt: number; signal: DeltaSignal | null }>();
const deltaSignalInFlight = new Map<string, Promise<DeltaSignal | null>>();
const DELTA_SIGNAL_CACHE_TTL_MS = 10_000;

export async function fetchActusDeltaSignal(asset: string): Promise<DeltaSignal | null> {
  const cacheKey = asset.toUpperCase();
  const cached = deltaSignalCache.get(cacheKey);
  if (cached && Date.now() - cached.cachedAt <= DELTA_SIGNAL_CACHE_TTL_MS) {
    return cached.signal;
  }

  const existingRequest = deltaSignalInFlight.get(cacheKey);
  if (existingRequest) {
    return existingRequest;
  }

  const request = databentoJson<DeltaSignalApiResponse>("/api/actus/delta/signal", {
    asset,
  })
    .then((payload) => {
      const signal = payload.signal ?? null;
      deltaSignalCache.set(cacheKey, { cachedAt: Date.now(), signal });
      return signal;
    })
    .finally(() => {
      deltaSignalInFlight.delete(cacheKey);
    });

  deltaSignalInFlight.set(cacheKey, request);
  return request;
}
