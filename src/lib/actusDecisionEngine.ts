import type { ActusOpportunityOutput } from "../domain/market/types";
import type { GammaOverlay } from "../types/chart";

export type ActusPositioning = {
  positioningAvailable: boolean;
  positioningType: "REAL_GAMMA" | "POSITIONING_PROXY" | "NONE";
  gammaSourceAvailable: boolean;
  gammaLevelsAvailable: boolean;
  gammaDirectionalAvailable: boolean;
  regime: "PIN" | "EXPANSION";
  bias: "LONG" | "SHORT" | "NEUTRAL";
  confidence: number;
  condition: "MEAN_REVERSION" | "BREAKOUT" | "TRAP";
  drivers: string[];
  levels?: {
    upper?: number | null;
    lower?: number | null;
    anchor?: number | null;
  };
};

type PriceBehaviorDecision = {
  bias: "LONG" | "SHORT" | "NEUTRAL";
  confidence: number;
  condition: "MEAN_REVERSION" | "BREAKOUT" | "TRAP";
  drivers: string[];
};

type GammaAvailability = {
  sourceAvailable: boolean;
  levelsAvailable: boolean;
  directionalAvailable: boolean;
};

type StructuralContext = {
  spot: number | null;
  upper: number | null;
  lower: number | null;
  anchor: number | null;
  insideWalls: boolean;
  normalizedBandDistance: number;
  normalizedAnchorDistance: number;
};

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

function round(value: number, digits = 3) {
  return Number(value.toFixed(digits));
}

function uniqueDrivers(drivers: string[]) {
  return [...new Set(drivers.filter(Boolean))].slice(0, 4);
}

function isFiniteNumber(value: number | null | undefined): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function deriveGammaAvailability(overlay: GammaOverlay | null): GammaAvailability {
  const sourceAvailable = Boolean(overlay?.source);
  const directionalAvailable = isFiniteNumber(overlay?.gammaFlip ?? null);
  const levelsAvailable =
    directionalAvailable ||
    isFiniteNumber(overlay?.callWall ?? null) ||
    isFiniteNumber(overlay?.putWall ?? null);

  return {
    sourceAvailable,
    levelsAvailable,
    directionalAvailable,
  };
}

function deriveStructuralContext(
  spot: number | null,
  upper: number | null,
  lower: number | null,
  anchor: number | null,
): StructuralContext {
  const hasWallBand = isFiniteNumber(upper) && isFiniteNumber(lower);
  const insideWalls =
    hasWallBand &&
    isFiniteNumber(spot) &&
    spot >= Math.min(upper, lower) &&
    spot <= Math.max(upper, lower);

  const bandWidth =
    hasWallBand
      ? Math.abs(upper - lower)
      : null;
  const normalizedBandDistance =
    hasWallBand && isFiniteNumber(spot) && bandWidth && bandWidth > 0
      ? clamp(Math.abs(spot - (upper + lower) / 2) / (bandWidth / 2), 0, 1)
      : 1;
  const normalizedAnchorDistance =
    isFiniteNumber(anchor) && isFiniteNumber(spot) && anchor !== 0
      ? clamp(Math.abs(spot - anchor) / Math.max(Math.abs(anchor) * 0.01, 1e-6), 0, 1)
      : 1;

  return {
    spot,
    upper,
    lower,
    anchor,
    insideWalls,
    normalizedBandDistance,
    normalizedAnchorDistance,
  };
}

function deriveProxyConfidence(
  item: ActusOpportunityOutput,
  regime: ActusPositioning["regime"],
  condition: ActusPositioning["condition"],
  bias: ActusPositioning["bias"],
  structure: StructuralContext,
  priceDecision: PriceBehaviorDecision,
): number {
  let score = 0.24;

  const context = item.positioningContext;
  if (context?.confidence === "high") score += 0.12;
  else if (context?.confidence === "medium") score += 0.07;
  else score += 0.03;

  if (regime === "PIN") {
    score += structure.insideWalls ? 0.14 : 0.06;
    score += (1 - structure.normalizedBandDistance) * 0.08;
  } else {
    score += bias !== "NEUTRAL" ? 0.1 : 0.03;
    score += priceDecision.bias === bias && bias !== "NEUTRAL" ? 0.08 : 0;
  }

  if (condition === "BREAKOUT") score += 0.08;
  if (condition === "MEAN_REVERSION") score += 0.04;
  if (condition === "TRAP") score -= 0.26;

  score += priceDecision.confidence * 0.18;

  if (item.riskState === "unstable") score -= 0.1;
  if (item.riskState === "crowded") score -= 0.08;
  if (item.riskState === "late") score -= 0.16;
  if (item.freshnessState === "stale") score -= 0.1;

  return round(clamp(score, 0.08, 0.72));
}

function deriveRealGammaConfidence(
  gammaAvailability: GammaAvailability,
  regime: ActusPositioning["regime"],
  condition: ActusPositioning["condition"],
  bias: ActusPositioning["bias"],
  structure: StructuralContext,
  priceDecision: PriceBehaviorDecision,
  gammaConfidence: number,
): number {
  let score = gammaAvailability.directionalAvailable ? 0.42 : 0.26;

  if (gammaAvailability.sourceAvailable) score += 0.03;
  if (gammaAvailability.levelsAvailable) score += 0.05;

  if (gammaAvailability.directionalAvailable) {
    score += gammaConfidence * 0.16;
    if (bias !== "NEUTRAL" && priceDecision.bias === bias) score += 0.08;
    else if (bias !== "NEUTRAL" && priceDecision.bias !== "NEUTRAL" && priceDecision.bias !== bias) score -= 0.08;
    score += (1 - structure.normalizedAnchorDistance) * 0.06;
  } else {
    if (regime === "PIN") {
      score += structure.insideWalls ? 0.08 : 0.03;
      score += (1 - structure.normalizedBandDistance) * 0.06;
    } else {
      score += priceDecision.bias !== "NEUTRAL" ? 0.06 : 0.02;
      score += priceDecision.bias === bias && bias !== "NEUTRAL" ? 0.05 : 0;
    }
  }

  if (condition === "BREAKOUT") score += 0.06;
  if (condition === "MEAN_REVERSION") score += 0.02;
  if (condition === "TRAP") score -= 0.28;

  score += priceDecision.confidence * (gammaAvailability.directionalAvailable ? 0.08 : 0.06);

  return round(clamp(score, gammaAvailability.directionalAvailable ? 0.14 : 0.12, gammaAvailability.directionalAvailable ? 0.9 : 0.68));
}

function derivePriceBehaviorDecision(item: ActusOpportunityOutput): PriceBehaviorDecision {
  const baseBias: PriceBehaviorDecision["bias"] =
    item.direction === "long" ? "LONG" : item.direction === "short" ? "SHORT" : "NEUTRAL";

  const condition: PriceBehaviorDecision["condition"] =
    item.tooLateFlag || item.riskState === "late" || item.state === "failed-breakout" || item.state === "invalidated"
      ? "TRAP"
      : item.state === "breakout" || item.state === "continuation" || item.state === "execute"
        ? "BREAKOUT"
        : "MEAN_REVERSION";

  const confidencePenalty =
    (item.riskState === "unstable" ? 0.14 : 0) +
    (item.riskState === "crowded" ? 0.09 : 0) +
    (item.riskState === "late" ? 0.2 : 0) +
    (item.freshnessState === "aging" ? 0.08 : 0) +
    (item.freshnessState === "stale" ? 0.16 : 0) +
    (item.tooLateFlag ? 0.18 : 0);

  const drivers = [
    baseBias !== "NEUTRAL" && item.action !== "avoid" ? "price behavior aligned" : null,
    condition === "BREAKOUT" ? "breakout pressure" : null,
    condition === "MEAN_REVERSION" ? "reversal pressure" : null,
    item.riskState === "crowded" || item.location === "mid-range" ? "range pressure" : null,
    item.positioningContext?.pinZone ? "market pinned" : null,
    item.positioningContext?.compressionZone || item.riskState === "unstable" ? "expansion risk" : null,
  ].filter(Boolean) as string[];

  return {
    bias: condition === "TRAP" ? "NEUTRAL" : baseBias,
    confidence: round(clamp((item.confidenceScore ?? 0) / 100 - confidencePenalty, 0, 1)),
    condition,
    drivers: uniqueDrivers(drivers),
  };
}

function deriveProxyPositioning(item: ActusOpportunityOutput): ActusPositioning | null {
  const context = item.positioningContext;
  if (!context) {
    return {
      positioningAvailable: false,
      positioningType: "NONE",
      gammaSourceAvailable: false,
      gammaLevelsAvailable: false,
      gammaDirectionalAvailable: false,
      regime: "PIN",
      bias: "NEUTRAL",
      confidence: 0,
      condition: "MEAN_REVERSION",
      drivers: uniqueDrivers(["no options positioning data", "price behavior only"]),
      levels: {
        upper: null,
        lower: null,
        anchor: null,
      },
    };
  }

  const upper =
    context.positioningCeiling ??
    context.compressionZone?.upper ??
    context.pinZone?.upper ??
    null;
  const lower =
    context.positioningFloor ??
    context.compressionZone?.lower ??
    context.pinZone?.lower ??
    null;
  const anchor =
    context.pinZone?.anchor ??
    context.compressionZone?.anchor ??
    (typeof upper === "number" && typeof lower === "number" ? (upper + lower) / 2 : null);

  const trap =
    item.tooLateFlag ||
    item.riskState === "late" ||
    item.state === "failed-breakout" ||
    item.state === "invalidated";

  const regime: ActusPositioning["regime"] =
    !trap && context.pinZone && typeof item.price === "number" && item.price >= context.pinZone.lower && item.price <= context.pinZone.upper
      ? "PIN"
      : "EXPANSION";

  const condition: ActusPositioning["condition"] = trap
    ? "TRAP"
    : regime === "PIN"
      ? "MEAN_REVERSION"
      : "BREAKOUT";

  const rawBias: ActusPositioning["bias"] =
    typeof anchor === "number" && Number.isFinite(anchor)
      ? item.price > anchor
        ? "LONG"
        : item.price < anchor
          ? "SHORT"
          : "NEUTRAL"
      : item.direction === "long"
        ? "LONG"
        : item.direction === "short"
          ? "SHORT"
          : "NEUTRAL";

  const bias: ActusPositioning["bias"] =
    condition === "TRAP" ? "NEUTRAL" : regime === "PIN" ? "NEUTRAL" : rawBias;
  const priceDecision = derivePriceBehaviorDecision(item);
  const structure = deriveStructuralContext(item.price, upper, lower, anchor);

  const drivers = uniqueDrivers([
    "positioning proxy active",
    "no options positioning data",
    regime === "PIN" ? "market pinned" : "breakout pressure",
    condition === "TRAP" ? "expansion risk" : null,
  ].filter(Boolean) as string[]);

  return {
    positioningAvailable: true,
    positioningType: "POSITIONING_PROXY",
    gammaSourceAvailable: false,
    gammaLevelsAvailable: false,
    gammaDirectionalAvailable: false,
    regime,
    bias,
    confidence: deriveProxyConfidence(item, regime, condition, bias, structure, priceDecision),
    condition,
    drivers,
    levels: { upper, lower, anchor },
  };
}

export function deriveActusPositioning(item: ActusOpportunityOutput, gammaOverlay: GammaOverlay | null): ActusPositioning | null {
  const priceDecision = derivePriceBehaviorDecision(item);
  const gammaAvailability = deriveGammaAvailability(gammaOverlay);
  const overlay = gammaOverlay;
  const upper = overlay?.callWall ?? null;
  const lower = overlay?.putWall ?? null;
  const hasWallBand = isFiniteNumber(upper) && isFiniteNumber(lower);
  const spot = isFiniteNumber(item.price) ? item.price : overlay?.spotReference ?? null;

  if (!overlay || !gammaAvailability.sourceAvailable || !gammaAvailability.levelsAvailable) {
    return deriveProxyPositioning(item);
  }

  const gammaBias = overlay.bias ?? "NEUTRAL";
  const gammaConfidence = typeof overlay.confidence === "number" ? overlay.confidence : 0;
  const anchor = overlay?.gammaFlip ?? (hasWallBand ? (upper + lower) / 2 : overlay?.spotReference ?? null);
  const structure = deriveStructuralContext(spot, upper, lower, anchor);

  const regime: ActusPositioning["regime"] = gammaAvailability.directionalAvailable
    ? overlay?.regime ?? "PIN"
    : structure.insideWalls
      ? "PIN"
      : "EXPANSION";

  const trap = overlay?.condition === "TRAP" || priceDecision.condition === "TRAP";

  const condition: ActusPositioning["condition"] = trap
    ? "TRAP"
    : regime === "PIN"
      ? "MEAN_REVERSION"
      : "BREAKOUT";

  const directionalBias: ActusPositioning["bias"] =
    condition === "TRAP"
      ? "NEUTRAL"
      : regime === "PIN"
        ? "NEUTRAL"
        : gammaAvailability.directionalAvailable
          ? gammaBias
          : priceDecision.bias !== "NEUTRAL"
            ? priceDecision.bias
            : "NEUTRAL";

  const dominantPressure =
    condition === "TRAP"
      ? "expansion risk"
      : condition === "BREAKOUT"
        ? "breakout pressure"
        : "range pressure";

  const drivers = gammaAvailability.directionalAvailable
    ? uniqueDrivers([
        regime === "PIN" ? "market pinned" : "positioning aligned",
        priceDecision.bias !== "NEUTRAL" && directionalBias === priceDecision.bias ? "price behavior aligned" : null,
        dominantPressure,
      ].filter(Boolean) as string[])
    : uniqueDrivers([
        regime === "PIN" ? "market pinned" : "positioning aligned",
        regime === "EXPANSION" && priceDecision.bias !== "NEUTRAL" ? "price behavior aligned" : null,
        dominantPressure,
      ].filter(Boolean) as string[]);

  return {
    positioningAvailable: true,
    positioningType: "REAL_GAMMA",
    gammaSourceAvailable: gammaAvailability.sourceAvailable,
    gammaLevelsAvailable: gammaAvailability.levelsAvailable,
    gammaDirectionalAvailable: gammaAvailability.directionalAvailable,
    regime,
    bias: directionalBias,
    confidence: deriveRealGammaConfidence(
      gammaAvailability,
      regime,
      condition,
      directionalBias,
      structure,
      priceDecision,
      gammaConfidence,
    ),
    condition,
    drivers,
    levels: {
      upper,
      lower,
      anchor,
    },
  };
}
