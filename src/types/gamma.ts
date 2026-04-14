export type GammaContractQuality = "true" | "estimated" | "unusable";

export type GammaStrikeExposure = {
  strike: number;
  totalCallGamma: number;
  totalPutGamma: number;
  netGamma: number;
  totalCallExposure: number;
  totalPutExposure: number;
  netExposure: number;
  quality: "true" | "estimated" | "mixed";
};

export type GammaZone = {
  strike: number;
  score: number;
};

export type GammaContractResult = {
  optionSymbol: string;
  strike: number;
  right: "C" | "P";
  quality: GammaContractQuality;
  sigmaUsed: number | null;
  marketPriceUsed: number | null;
  interestWeightUsed: number | null;
  gamma: number | null;
  exposure: number | null;
};

export type GammaSnapshot = {
  underlyingAsset: string;
  underlyingPrice: number;
  nearestCallWall: number | null;
  nearestPutWall: number | null;
  gammaFlip: number | null;
  strongestPositiveGammaStrike: number | null;
  strongestNegativeGammaStrike: number | null;
  zonesAbove: GammaZone[];
  zonesBelow: GammaZone[];
  confidence: "high" | "medium" | "low";
  strikeExposures: GammaStrikeExposure[];
  contractResults: GammaContractResult[];
};
