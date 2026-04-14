import type { ActusNormalizedMarketInput } from "../domain/market/types";

type PositioningConfidence = NonNullable<ActusNormalizedMarketInput["positioningContext"]>["confidence"];

export type PositioningProxy = {
  upperBoundary?: number | null;
  lowerBoundary?: number | null;
  equilibrium?: number | null;
  regime?: "PIN" | "EXPANSION";
  bias?: "LONG" | "SHORT" | "NEUTRAL";
  confidence?: number;
  condition?: "MEAN_REVERSION" | "BREAKOUT" | "TRAP";
  source: "positioning-proxy";
};

type ProxyContextArgs = {
  digits?: number;
  price: ActusNormalizedMarketInput["price"];
  sessionLevels: ActusNormalizedMarketInput["sessionLevels"];
  baseline: number;
  stretchFromBaseline?: number | null;
  referenceHigh?: number | null;
  referenceLow?: number | null;
};

function validNumber(value: number | null | undefined): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function round(value: number | null, digits = 2) {
  if (!validNumber(value)) {
    return null;
  }

  return Number(value.toFixed(digits));
}

function nearestAbove(price: number, values: Array<number | null | undefined>) {
  const candidates = values.filter(validNumber).filter((value) => value >= price).sort((a, b) => a - b);
  return candidates[0] ?? null;
}

function nearestBelow(price: number, values: Array<number | null | undefined>) {
  const candidates = values.filter(validNumber).filter((value) => value <= price).sort((a, b) => b - a);
  return candidates[0] ?? null;
}

function midpoint(a: number | null, b: number | null) {
  if (!validNumber(a) || !validNumber(b)) {
    return null;
  }

  return (a + b) / 2;
}

function buildBand(anchor: number | null, basisWidth: number, anchorScale: number, digits = 2) {
  if (!validNumber(anchor)) {
    return null;
  }

  const width = Math.max(basisWidth, Math.abs(anchor) * anchorScale);
  return {
    lower: round(anchor - width, digits) ?? anchor,
    upper: round(anchor + width, digits) ?? anchor,
    anchor: round(anchor, digits) ?? anchor,
  };
}

function buildProxyMeta(
  price: number,
  anchor: number | null,
  upper: number | null,
  lower: number | null,
  stretchFromBaseline: number | null | undefined,
): PositioningProxy {
  const rangeWidth = validNumber(upper) && validNumber(lower) ? Math.abs(upper - lower) : null;
  const rangePct = validNumber(rangeWidth) ? (rangeWidth / Math.max(Math.abs(price), 0.0001)) * 100 : null;
  const anchorDistancePct =
    validNumber(anchor) ? (Math.abs(price - anchor) / Math.max(Math.abs(anchor), 0.0001)) * 100 : null;
  const nearAnchor = validNumber(anchorDistancePct) && anchorDistancePct <= 0.3;
  const compressed = validNumber(rangePct) && rangePct <= 1.2;
  const trap = validNumber(stretchFromBaseline) && Math.abs(stretchFromBaseline) >= 1.4;

  const regime: PositioningProxy["regime"] = !trap && (nearAnchor || compressed) ? "PIN" : "EXPANSION";
  const condition: PositioningProxy["condition"] = trap
    ? "TRAP"
    : regime === "PIN"
      ? "MEAN_REVERSION"
      : "BREAKOUT";

  const rawBias: PositioningProxy["bias"] =
    !validNumber(anchor) || Math.abs(price - anchor) <= Math.max(Math.abs(price) * 0.0004, 0.0001)
      ? "NEUTRAL"
      : price > anchor
        ? "LONG"
        : "SHORT";

  const bias: PositioningProxy["bias"] =
    condition === "TRAP" ? "NEUTRAL" : regime === "PIN" ? "NEUTRAL" : rawBias;

  const confidenceBase = compressed ? 0.68 : validNumber(rangePct) && rangePct <= 2.4 ? 0.56 : 0.42;
  const stretchPenalty = validNumber(stretchFromBaseline) ? Math.min(Math.abs(stretchFromBaseline) * 0.12, 0.22) : 0;
  const confidence = Math.max(0, Math.min(1, confidenceBase - (trap ? 0.18 : 0) - stretchPenalty));

  return {
    upperBoundary: upper,
    lowerBoundary: lower,
    equilibrium: anchor,
    regime,
    bias,
    confidence: Number(confidence.toFixed(3)),
    condition,
    source: "positioning-proxy",
  };
}

function confidenceBucket(value: number): PositioningConfidence {
  if (value >= 0.66) return "high";
  if (value >= 0.5) return "medium";
  return "low";
}

export function buildPositioningProxyContext(args: ProxyContextArgs): NonNullable<ActusNormalizedMarketInput["positioningContext"]> {
  const { price, sessionLevels, baseline, stretchFromBaseline, referenceHigh, referenceLow, digits = 2 } = args;
  const currentPrice = price.close;

  const highs = [
    sessionLevels.firstHourHigh,
    sessionLevels.nyOpenRangeHigh,
    sessionLevels.londonHigh,
    sessionLevels.asiaHigh,
    referenceHigh,
    price.high,
  ];
  const lows = [
    sessionLevels.firstHourLow,
    sessionLevels.nyOpenRangeLow,
    sessionLevels.londonLow,
    sessionLevels.asiaLow,
    referenceLow,
    price.low,
  ];

  const upper = round(nearestAbove(currentPrice, highs) ?? Math.max(...highs.filter(validNumber), currentPrice), digits);
  const lower = round(nearestBelow(currentPrice, lows) ?? Math.min(...lows.filter(validNumber), currentPrice), digits);
  const anchor = round(validNumber(baseline) ? baseline : midpoint(upper, lower), digits);

  const proxy = buildProxyMeta(currentPrice, anchor, upper, lower, stretchFromBaseline);
  const rangeWidth = validNumber(upper) && validNumber(lower) ? Math.abs(upper - lower) : Math.abs(currentPrice) * 0.006;
  const pinZone =
    proxy.regime === "PIN"
      ? buildBand(anchor, Math.max(rangeWidth * 0.16, Math.abs(currentPrice) * 0.0012), 0.0008, digits)
      : null;
  const compressionZone =
    validNumber(upper) && validNumber(lower) && Math.abs(upper - lower) / Math.max(Math.abs(currentPrice), 0.0001) <= 0.018
      ? {
          lower,
          upper,
          anchor: round(midpoint(upper, lower), digits) ?? currentPrice,
        }
      : null;

  const confidence = confidenceBucket(proxy.confidence ?? 0);

  const expansionRisk =
    proxy.condition === "TRAP"
      ? "Expansion risk is elevated away from the anchor."
      : proxy.regime === "PIN"
        ? "Range pressure is balanced around the anchor."
        : proxy.bias === "LONG"
          ? "Breakout pressure favors the upper boundary while price holds above the anchor."
          : proxy.bias === "SHORT"
            ? "Breakout pressure favors the lower boundary while price holds below the anchor."
            : "Expansion risk is elevated while positioning remains unresolved.";

  const anchorState =
    !validNumber(anchor) || Math.abs(currentPrice - anchor) <= Math.max(Math.abs(currentPrice) * 0.0005, 0.0001)
      ? "Price is sitting near the anchor."
      : currentPrice > anchor
        ? "Price is holding above the anchor."
        : "Price is holding below the anchor.";

  const warnings =
    confidence === "low"
      ? ["Proxy positioning is broad. Treat levels as guidance, not a fixed map."]
      : [];

  return {
    positioningCeiling: upper,
    positioningFloor: lower,
    pinZone,
    compressionZone,
    expansionRisk,
    dealerPressureShift: anchorState,
    positioningSupport: validNumber(lower) ? `Support is clustering near ${lower}.` : "No clear lower boundary.",
    positioningResistance: validNumber(upper) ? `Resistance is clustering near ${upper}.` : "No clear upper boundary.",
    confidence,
    warnings,
  };
}
