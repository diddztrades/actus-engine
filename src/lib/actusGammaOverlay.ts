import { buildNqGammaSnapshot } from "../core/gammaEngine";
import { CME_OPTIONS_CONFIG, fetchCmeOptionChain } from "../data/databento/options";
import type { DatabentoCoreAsset } from "../data/databento/types";
import { fetchActusGammaOverlay } from "../data/gamma/overlay";
import type { ActusOpportunityOutput } from "../domain/market/types";
import type { GammaOverlay } from "../types/chart";
import { deriveGammaDecisionFields } from "./actusGammaDecision";

type ActusGammaSymbol = "NQ" | "BTC" | "XAU" | "OIL";
type GammaProvider = (item: Pick<ActusOpportunityOutput, "symbol" | "price">) => Promise<GammaOverlay | null>;
type CmeGammaAsset = Extract<DatabentoCoreAsset, "NQ" | "GC" | "CL">;

function normalizeActusSymbol(symbol: string): ActusGammaSymbol | null {
  const normalized = symbol.toUpperCase();
  if (normalized === "XAU/USD") return "XAU";
  if (normalized === "BTC/USD") return "BTC";
  if (normalized === "CL") return "OIL";
  if (normalized === "OIL") return "OIL";
  if (normalized === "NQ") return "NQ";
  return null;
}

async function cmeGammaProvider(
  asset: CmeGammaAsset,
  item: Pick<ActusOpportunityOutput, "symbol" | "price">,
): Promise<GammaOverlay | null> {
  try {
    const snapshot = buildNqGammaSnapshot(await fetchCmeOptionChain(asset));
    return {
      gammaFlip: snapshot.gammaFlip,
      callWall: snapshot.nearestCallWall,
      putWall: snapshot.nearestPutWall,
      spotReference: item.price ?? snapshot.underlyingPrice,
      updatedAt: new Date().toISOString(),
      source: CME_OPTIONS_CONFIG[asset].source,
    };
  } catch {
    return null;
  }
}

async function backendGammaProvider(
  asset: "BTC" | "XAU",
  item: Pick<ActusOpportunityOutput, "symbol" | "price">,
): Promise<GammaOverlay | null> {
  return fetchActusGammaOverlay(asset, item.price ?? null);
}

export const GAMMA_PROVIDERS: Partial<Record<ActusGammaSymbol, GammaProvider>> = {
  NQ: (item) => cmeGammaProvider("NQ", item),
  BTC: (item) => backendGammaProvider("BTC", item),
  XAU: (item) => cmeGammaProvider("GC", item),
  OIL: (item) => cmeGammaProvider("CL", item),
};

export function withActusGammaSpot(
  overlay: GammaOverlay | null,
  spotReference: number | null | undefined,
): GammaOverlay | null {
  if (!overlay) {
    return null;
  }

  const resolvedSpot =
    typeof spotReference === "number" && Number.isFinite(spotReference)
      ? spotReference
      : overlay.spotReference ?? null;

  return {
    ...overlay,
    spotReference: resolvedSpot,
    ...deriveGammaDecisionFields(overlay, resolvedSpot),
  };
}

export async function resolveActusGammaOverlay(
  item: Pick<ActusOpportunityOutput, "symbol" | "price">,
): Promise<GammaOverlay | null> {
  const symbol = normalizeActusSymbol(item.symbol);
  const provider = symbol ? GAMMA_PROVIDERS[symbol] : null;
  if (!provider) {
    return null;
  }

  return withActusGammaSpot(await provider(item), item.price ?? null);
}
