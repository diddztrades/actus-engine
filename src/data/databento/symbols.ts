import type { DatabentoCoreAsset, DatabentoFutureDefinition } from "./types";

export const DATABENTO_FUTURES_SYMBOLS: Record<DatabentoCoreAsset, DatabentoFutureDefinition> = {
  NQ: { asset: "NQ", symbol: "NQ.c.0", displayName: "Nasdaq", assetClass: "equity-index" },
  GC: { asset: "GC", symbol: "GC.c.0", displayName: "Gold", assetClass: "metal" },
  CL: { asset: "CL", symbol: "CL.c.0", displayName: "Crude Oil", assetClass: "energy" },
};

export const DATABENTO_CORE_ASSETS = Object.keys(DATABENTO_FUTURES_SYMBOLS) as DatabentoCoreAsset[];
