import { databentoJson } from "../databento/client";
import type { GammaOverlay } from "../../types/chart";

type GammaOverlayApiResponse = {
  ok: boolean;
  asset: string;
  overlay: GammaOverlay | null;
  error?: string;
};

export async function fetchActusGammaOverlay(asset: string, spotReference?: number | null): Promise<GammaOverlay | null> {
  const payload = await databentoJson<GammaOverlayApiResponse>("/api/actus/gamma/overlay", {
    asset,
    spot: typeof spotReference === "number" && Number.isFinite(spotReference) ? spotReference : undefined,
  });

  return payload.overlay ?? null;
}
