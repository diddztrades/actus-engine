import { fetchActusDeltaSignal } from "../data/delta/signal";
import type { ActusOpportunityOutput } from "../domain/market/types";
import type { DeltaSignal } from "../types/delta";

type ActusDeltaAsset = "NQ" | "BTC" | "XAU" | "OIL";

function normalizeActusDeltaAsset(symbol: string): ActusDeltaAsset | null {
  const normalized = symbol.toUpperCase();
  if (normalized === "XAU/USD") return "XAU";
  if (normalized === "BTC/USD") return "BTC";
  if (normalized === "CL" || normalized === "OIL") return "OIL";
  if (normalized === "NQ") return "NQ";
  return null;
}

export async function resolveActusDeltaSignal(
  item: Pick<ActusOpportunityOutput, "symbol">,
): Promise<DeltaSignal | null> {
  const asset = normalizeActusDeltaAsset(item.symbol);
  if (!asset) {
    return {
      deltaAvailability: "UNSUPPORTED",
      deltaSupportedAsset: false,
      deltaSourceAvailable: false,
      deltaDirectionalAvailable: false,
      bias: "NEUTRAL",
      strength: 0,
      condition: "NEUTRAL",
      source: null,
      updatedAt: null,
    };
  }

  return fetchActusDeltaSignal(asset);
}
