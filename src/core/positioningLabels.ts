import type { GammaSnapshot } from "../types/gamma";

export type PositioningConfidence = "high" | "medium" | "low";

export function buildPositioningWarnings(gamma: GammaSnapshot): string[] {
  const warnings: string[] = [];
  const trueCount = gamma.contractResults.filter((item) => item.quality === "true").length;
  const estimatedCount = gamma.contractResults.filter((item) => item.quality === "estimated").length;

  if (gamma.confidence === "low") {
    warnings.push("Low-confidence positioning. Treat levels as guidance, not a hard map.");
  }

  if (estimatedCount > 0 && trueCount === 0) {
    warnings.push("Positioning is estimated from sparse option pricing, so reaction levels may drift.");
  }

  if (gamma.nearestCallWall === null && gamma.nearestPutWall === null) {
    warnings.push("No clear positioning ceiling or floor was detected.");
  }

  if (gamma.gammaFlip === null) {
    warnings.push("No stable pressure shift level was detected.");
  }

  return warnings;
}

export function buildExpansionRiskLabel(args: {
  underlyingPrice: number;
  positioningCeiling: number | null;
  positioningFloor: number | null;
  gammaFlip: number | null;
}): string {
  const { underlyingPrice, positioningCeiling, positioningFloor, gammaFlip } = args;

  if (positioningCeiling !== null && underlyingPrice >= positioningCeiling) {
    return "Upside expansion may stall into overhead positioning.";
  }

  if (positioningFloor !== null && underlyingPrice <= positioningFloor) {
    return "Downside expansion risk is elevated below support positioning.";
  }

  if (gammaFlip !== null) {
    if (underlyingPrice > gammaFlip) {
      return "Expansion favors upside follow-through while price holds above the pressure shift.";
    }

    if (underlyingPrice < gammaFlip) {
      return "Expansion risk is higher to the downside while price sits below the pressure shift.";
    }
  }

  if (positioningCeiling !== null && positioningFloor !== null) {
    return "Positioning is balanced. Expect contained movement unless one side gives way.";
  }

  return "Positioning is unclear. Expansion risk should be treated cautiously.";
}

export function buildDealerPressureShiftLabel(args: {
  underlyingPrice: number;
  gammaFlip: number | null;
}): string {
  const { underlyingPrice, gammaFlip } = args;

  if (gammaFlip === null) {
    return "No clear dealer pressure shift is available.";
  }

  const distancePct = Math.abs((underlyingPrice - gammaFlip) / gammaFlip) * 100;
  if (distancePct <= 0.15) {
    return "Price is sitting near a dealer pressure shift.";
  }

  if (underlyingPrice > gammaFlip) {
    return "Dealer pressure is more supportive while price stays above the shift.";
  }

  return "Dealer pressure is less supportive while price stays below the shift.";
}

export function buildSupportLabel(level: number | null): string {
  if (level === null) {
    return "No clear positioning support.";
  }

  return `Positioning support is concentrated near ${level}.`;
}

export function buildResistanceLabel(level: number | null): string {
  if (level === null) {
    return "No clear positioning resistance.";
  }

  return `Positioning resistance is concentrated near ${level}.`;
}
