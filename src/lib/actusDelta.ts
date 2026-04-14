import { fetchActusDeltaSignal } from "../data/delta/signal";
import type { ActusOpportunityOutput } from "../domain/market/types";
import type { DeltaSignal } from "../types/delta";

type ActusDeltaAsset = "NQ" | "BTC" | "ETH" | "SOL" | "XAU" | "OIL" | "EUR";

function normalizeActusDeltaAsset(symbol: string): ActusDeltaAsset | null {
  const normalized = symbol.toUpperCase();
  if (normalized === "XAU" || normalized === "GC") return "XAU";
  if (normalized === "XAU/USD") return "XAU";
  if (normalized === "BTC/USD") return "BTC";
  if (normalized === "ETH/USD") return "ETH";
  if (normalized === "SOL/USD") return "SOL";
  if (normalized === "EUR/USD" || normalized === "EURUSD") return "EUR";
  if (normalized === "CL" || normalized === "OIL") return "OIL";
  if (normalized === "NQ") return "NQ";
  if (normalized === "ETH") return "ETH";
  if (normalized === "SOL") return "SOL";
  if (normalized === "EUR") return "EUR";
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
