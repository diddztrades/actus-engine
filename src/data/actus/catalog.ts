import type { ActusAssetClass } from "../../domain/market/types";

export const ACTUS_ASSET_CATALOG: Record<
  string,
  { displayName: string; assetClass: ActusAssetClass }
> = {
  EURUSD: { displayName: "Euro / Dollar", assetClass: "fx" },
  XAU: { displayName: "Gold", assetClass: "metal" },
  NQ: { displayName: "Nasdaq", assetClass: "equity-index" },
  BTC: { displayName: "Bitcoin", assetClass: "crypto" },
  ETH: { displayName: "Ethereum", assetClass: "crypto" },
  SOL: { displayName: "Solana", assetClass: "crypto" },
  OIL: { displayName: "Crude Oil", assetClass: "energy" },
};
