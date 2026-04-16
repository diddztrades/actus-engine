import { databentoJson } from "../databento/client";
import type { GammaOverlay } from "../../types/chart";

type GammaOverlayApiResponse = {
  ok: boolean;
  asset: string;
  overlay: GammaOverlay | null;
  error?: string;
};

const gammaOverlayCache = new Map<string, { cachedAt: number; overlay: GammaOverlay | null }>();
const gammaOverlayInFlight = new Map<string, Promise<GammaOverlay | null>>();
const GAMMA_OVERLAY_CACHE_TTL_MS = 20_000;

export function clearActusGammaOverlayCache() {
  gammaOverlayCache.clear();
  gammaOverlayInFlight.clear();
}

export async function fetchActusGammaOverlay(asset: string, spotReference?: number | null): Promise<GammaOverlay | null> {
  const cacheKey = JSON.stringify({
    asset,
    spot:
      typeof spotReference === "number" && Number.isFinite(spotReference)
        ? Number(spotReference.toFixed(4))
        : null,
  });
  const cached = gammaOverlayCache.get(cacheKey);
  if (cached && Date.now() - cached.cachedAt <= GAMMA_OVERLAY_CACHE_TTL_MS) {
    return cached.overlay;
  }

  const existingRequest = gammaOverlayInFlight.get(cacheKey);
  if (existingRequest) {
    return existingRequest;
  }

  const request = databentoJson<GammaOverlayApiResponse>("/api/actus/gamma/overlay", {
    asset,
    spot: typeof spotReference === "number" && Number.isFinite(spotReference) ? spotReference : undefined,
  })
    .then((payload) => {
      const overlay = payload.overlay ?? null;
      gammaOverlayCache.set(cacheKey, { cachedAt: Date.now(), overlay });
      return overlay;
    })
    .finally(() => {
      gammaOverlayInFlight.delete(cacheKey);
    });

  gammaOverlayInFlight.set(cacheKey, request);
  return request;
}
