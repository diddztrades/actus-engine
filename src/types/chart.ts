export type TimeframeFilter = "1m" | "5m" | "15m" | "1h";

export type GammaOverlay = {
  gammaFlip?: number | null;
  callWall?: number | null;
  putWall?: number | null;
  spotReference?: number | null;
  regime?: "PIN" | "EXPANSION" | null;
  bias?: "LONG" | "SHORT" | "NEUTRAL" | null;
  confidence?: number | null;
  condition?: "MEAN_REVERSION" | "BREAKOUT" | "TRAP" | null;
  updatedAt?: string | null;
  source?: string | null;
};
