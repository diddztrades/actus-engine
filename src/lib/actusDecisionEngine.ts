import type { ActusOpportunityOutput } from "../domain/market/types";
import type { GammaOverlay } from "../types/chart";
import type { DeltaSignal } from "../types/delta";

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

type AlignmentState = "STRONG" | "MIXED" | "WEAK";

type StructuralContext = {
  spot: number | null;
  upper: number | null;
  lower: number | null;
  anchor: number | null;
  insideWalls: boolean;
  normalizedBandDistance: number;
  normalizedAnchorDistance: number;
};

type DeltaFusion = {
  confidenceDelta: number;
  driver: string | null;
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

function orderedDrivers(drivers: string[]) {
  const priority = new Map<string, number>([
    ["delta conflict", 0],
    ["positioning aligned", 1],
    ["market pinned", 2],
    ["delta aligned", 3],
    ["price behavior aligned", 4],
    ["flow present, not directional", 5],
    ["breakout pressure", 6],
    ["range pressure", 7],
    ["reversal pressure", 8],
    ["expansion risk", 9],
    ["positioning proxy active", 10],
    ["no options positioning data", 11],
    ["price behavior only", 12],
  ]);

  return [...new Set(drivers.filter(Boolean))]
    .sort((a, b) => {
      const aPriority = priority.get(a) ?? 100;
      const bPriority = priority.get(b) ?? 100;
      return aPriority - bPriority || a.localeCompare(b);
    })
    .slice(0, 4);
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

function deriveAlignmentState(
  bias: ActusPositioning["bias"],
  priceBias: PriceBehaviorDecision["bias"],
  condition: ActusPositioning["condition"],
): AlignmentState {
  if (condition === "TRAP") return "WEAK";
  if (bias === "NEUTRAL" || priceBias === "NEUTRAL") return "MIXED";
  if (bias === priceBias) return "STRONG";
  return "WEAK";
}

function alignmentStrength(alignment: AlignmentState) {
  if (alignment === "STRONG") return 0.88;
  if (alignment === "MIXED") return 0.44;
  return 0.08;
}

function derivePositioningStrength(
  structure: StructuralContext,
  regime: ActusPositioning["regime"],
  bias: ActusPositioning["bias"],
  directionalAvailable: boolean,
): number {
  const anchorProximity = 1 - structure.normalizedAnchorDistance;
  const bandCenterProximity = 1 - structure.normalizedBandDistance;

  if (regime === "PIN") {
    const pinStrength = structure.insideWalls ? 0.55 : 0.2;
    return round(clamp(pinStrength * 0.55 + anchorProximity * 0.25 + bandCenterProximity * 0.2, 0, 1));
  }

  let wallProximity = 0.25;
  if (bias === "LONG" && isFiniteNumber(structure.upper) && isFiniteNumber(structure.spot) && structure.upper !== 0) {
    wallProximity = 1 - clamp(Math.abs((structure.upper - structure.spot) / structure.upper) / 0.01, 0, 1);
  } else if (bias === "SHORT" && isFiniteNumber(structure.lower) && isFiniteNumber(structure.spot) && structure.lower !== 0) {
    wallProximity = 1 - clamp(Math.abs((structure.spot - structure.lower) / structure.lower) / 0.01, 0, 1);
  }

  const flipDistanceStrength = directionalAvailable ? anchorProximity : 0.42;
  return round(clamp(flipDistanceStrength * 0.55 + wallProximity * 0.45, 0, 1));
}

function regimeStrength(regime: ActusPositioning["regime"]) {
  return regime === "EXPANSION" ? 0.78 : 0.26;
}

function compressConfidenceTopEnd(value: number, ceiling: number) {
  const threshold = 0.74;
  if (value <= threshold) {
    return value;
  }

  const overflow = value - threshold;
  const compressed = threshold + overflow * 0.28;
  return Math.min(compressed, ceiling);
}

function deriveCalibratedConfidence(
  positioningStrength: number,
  alignment: AlignmentState,
  regime: ActusPositioning["regime"],
  condition: ActusPositioning["condition"],
  positioningType: ActusPositioning["positioningType"],
  directionalAvailable: boolean,
): number {
  const alignmentScore = alignmentStrength(alignment);
  const regimeScore = regimeStrength(regime);
  let score = positioningStrength * 0.46 + alignmentScore * 0.36 + regimeScore * 0.18;

  if (condition === "TRAP") score -= 0.34;
  else if (condition === "BREAKOUT") score += 0.035;
  else score -= 0.035;

  if (positioningType === "POSITIONING_PROXY") {
    score -= 0.15;
  } else if (!directionalAvailable) {
    score -= 0.1;
  } else {
    score += 0.03;
  }

  const maxConfidence =
    condition === "TRAP"
      ? 0.22
      : positioningType === "POSITIONING_PROXY"
        ? 0.58
        : directionalAvailable
          ? 0.88
          : 0.64;
  const minConfidence =
    condition === "TRAP" ? 0.03 : positioningType === "POSITIONING_PROXY" ? 0.08 : 0.1;

  const normalized = clamp(score, minConfidence, maxConfidence);
  const compressed =
    condition === "TRAP"
      ? normalized
      : compressConfidenceTopEnd(normalized, maxConfidence);

  return round(clamp(compressed, minConfidence, maxConfidence));
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

function deriveDeltaFusion(
  signal: DeltaSignal | null,
  bias: ActusPositioning["bias"],
  condition: ActusPositioning["condition"],
): DeltaFusion {
  if (!signal || signal.deltaAvailability === "UNAVAILABLE" || signal.deltaAvailability === "UNSUPPORTED") {
    return { confidenceDelta: 0, driver: null };
  }

  if (signal.deltaAvailability === "SOURCE_ONLY") {
    return {
      confidenceDelta: condition === "TRAP" ? 0 : 0.005,
      driver: "flow present, not directional",
    };
  }

  if (!signal.deltaDirectionalAvailable || bias === "NEUTRAL" || condition === "TRAP") {
    return { confidenceDelta: 0, driver: null };
  }

  const deltaBias = signal.bias ?? "NEUTRAL";
  const strength = clamp(signal.strength ?? 0, 0, 1);
  if (deltaBias === "NEUTRAL") {
    return { confidenceDelta: 0, driver: null };
  }

  if (deltaBias === bias) {
    return {
      confidenceDelta: round(0.02 + strength * 0.034, 3),
      driver: "delta aligned",
    };
  }

  return {
    confidenceDelta: round(-(0.05 + strength * 0.055), 3),
    driver: "delta conflict",
  };
}

function deriveProxyPositioning(item: ActusOpportunityOutput, deltaSignal: DeltaSignal | null): ActusPositioning | null {
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
  const alignment = deriveAlignmentState(bias, priceDecision.bias, condition);
  const positioningStrength = derivePositioningStrength(structure, regime, bias, false);

  const drivers = uniqueDrivers([
    "positioning proxy active",
    "no options positioning data",
    regime === "PIN" ? "market pinned" : "breakout pressure",
    condition === "TRAP" ? "expansion risk" : null,
  ].filter(Boolean) as string[]);
  const deltaFusion = deriveDeltaFusion(deltaSignal, bias, condition);

  return {
    positioningAvailable: true,
    positioningType: "POSITIONING_PROXY",
    gammaSourceAvailable: false,
    gammaLevelsAvailable: false,
    gammaDirectionalAvailable: false,
    regime,
    bias,
    confidence: round(
      clamp(
        deriveCalibratedConfidence(positioningStrength, alignment, regime, condition, "POSITIONING_PROXY", false) +
          deltaFusion.confidenceDelta,
        condition === "TRAP" ? 0.03 : 0.08,
        condition === "TRAP" ? 0.22 : 0.58,
      ),
    ),
    condition,
    drivers: orderedDrivers([
      deltaFusion.driver,
      ...drivers,
    ].filter(Boolean) as string[]),
    levels: { upper, lower, anchor },
  };
}

export function deriveActusPositioning(
  item: ActusOpportunityOutput,
  gammaOverlay: GammaOverlay | null,
  deltaSignal: DeltaSignal | null = null,
): ActusPositioning | null {
  const priceDecision = derivePriceBehaviorDecision(item);
  const gammaAvailability = deriveGammaAvailability(gammaOverlay);
  const overlay = gammaOverlay;
  const upper = overlay?.callWall ?? null;
  const lower = overlay?.putWall ?? null;
  const hasWallBand = isFiniteNumber(upper) && isFiniteNumber(lower);
  const spot = isFiniteNumber(item.price) ? item.price : overlay?.spotReference ?? null;

  if (!overlay || !gammaAvailability.sourceAvailable || !gammaAvailability.levelsAvailable) {
    return deriveProxyPositioning(item, deltaSignal);
  }

  const gammaBias = overlay.bias ?? "NEUTRAL";
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

  const alignment = deriveAlignmentState(directionalBias, priceDecision.bias, condition);
  const positioningStrength = derivePositioningStrength(structure, regime, directionalBias, gammaAvailability.directionalAvailable);
  const baseConfidence = deriveCalibratedConfidence(
    positioningStrength,
    alignment,
    regime,
    condition,
    "REAL_GAMMA",
    gammaAvailability.directionalAvailable,
  );
  const deltaFusion = deriveDeltaFusion(deltaSignal, directionalBias, condition);
  const minConfidence = condition === "TRAP" ? 0.03 : 0.1;
  const maxConfidence =
    condition === "TRAP"
      ? 0.22
      : gammaAvailability.directionalAvailable
        ? 0.88
        : 0.64;

  return {
    positioningAvailable: true,
    positioningType: "REAL_GAMMA",
    gammaSourceAvailable: gammaAvailability.sourceAvailable,
    gammaLevelsAvailable: gammaAvailability.levelsAvailable,
    gammaDirectionalAvailable: gammaAvailability.directionalAvailable,
    regime,
    bias: directionalBias,
    confidence: round(clamp(baseConfidence + deltaFusion.confidenceDelta, minConfidence, maxConfidence)),
    condition,
    drivers: orderedDrivers([
      deltaFusion.driver,
      ...drivers,
    ].filter(Boolean) as string[]),
    levels: {
      upper,
      lower,
      anchor,
    },
  };
}
