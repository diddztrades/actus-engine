import type { GammaSnapshot, GammaZone } from "../types/gamma";
import {
  buildDealerPressureShiftLabel,
  buildExpansionRiskLabel,
  buildPositioningWarnings,
  buildResistanceLabel,
  buildSupportLabel,
  type PositioningConfidence,
} from "./positioningLabels";

export type PositioningBand = {
  lower: number;
  upper: number;
  anchor: number;
};

export type ActusPositioningSnapshot = {
  underlyingAsset: string;
  underlyingPrice: number;
  positioningCeiling: number | null;
  positioningFloor: number | null;
  pinZone: PositioningBand | null;
  compressionZone: PositioningBand | null;
  expansionRisk: string;
  dealerPressureShift: string;
  positioningSupport: string;
  positioningResistance: string;
  confidence: PositioningConfidence;
  warnings: string[];
};

function round(value: number | null, digits = 2) {
  if (value === null || !Number.isFinite(value)) {
    return null;
  }

  return Number(value.toFixed(digits));
}

function nearestZone(zones: GammaZone[]) {
  return zones[0]?.strike ?? null;
}

function computeCeiling(gamma: GammaSnapshot) {
  return gamma.nearestCallWall ?? gamma.strongestPositiveGammaStrike ?? nearestZone(gamma.zonesAbove);
}

function computeFloor(gamma: GammaSnapshot) {
  return gamma.nearestPutWall ?? gamma.strongestNegativeGammaStrike ?? nearestZone(gamma.zonesBelow);
}

function buildBand(anchor: number | null, underlyingPrice: number, widthPct = 0.0015): PositioningBand | null {
  if (anchor === null) {
    return null;
  }

  const width = Math.max(Math.abs(anchor) * widthPct, Math.abs(underlyingPrice) * 0.0005);
  return {
    lower: round(anchor - width) ?? anchor,
    upper: round(anchor + width) ?? anchor,
    anchor: round(anchor) ?? anchor,
  };
}

function buildPinZone(gamma: GammaSnapshot) {
  if (gamma.gammaFlip !== null) {
    return buildBand(gamma.gammaFlip, gamma.underlyingPrice, 0.0012);
  }

  const ceiling = computeCeiling(gamma);
  const floor = computeFloor(gamma);
  if (ceiling === null || floor === null) {
    return null;
  }

  const midpoint = (ceiling + floor) / 2;
  return buildBand(midpoint, gamma.underlyingPrice, 0.0012);
}

function buildCompressionZone(gamma: GammaSnapshot) {
  const floor = computeFloor(gamma);
  const ceiling = computeCeiling(gamma);

  if (floor === null || ceiling === null || floor >= ceiling) {
    return null;
  }

  const widthPct = ((ceiling - floor) / gamma.underlyingPrice) * 100;
  if (widthPct > 2.5) {
    return null;
  }

  return {
    lower: round(floor) ?? floor,
    upper: round(ceiling) ?? ceiling,
    anchor: round((floor + ceiling) / 2) ?? (floor + ceiling) / 2,
  };
}

export function buildNqPositioningSnapshot(gamma: GammaSnapshot): ActusPositioningSnapshot {
  const positioningCeiling = round(computeCeiling(gamma));
  const positioningFloor = round(computeFloor(gamma));
  const pinZone = buildPinZone(gamma);
  const compressionZone = buildCompressionZone(gamma);

  return {
    underlyingAsset: gamma.underlyingAsset,
    underlyingPrice: round(gamma.underlyingPrice) ?? gamma.underlyingPrice,
    positioningCeiling,
    positioningFloor,
    pinZone,
    compressionZone,
    expansionRisk: buildExpansionRiskLabel({
      underlyingPrice: gamma.underlyingPrice,
      positioningCeiling,
      positioningFloor,
      gammaFlip: gamma.gammaFlip,
    }),
    dealerPressureShift: buildDealerPressureShiftLabel({
      underlyingPrice: gamma.underlyingPrice,
      gammaFlip: gamma.gammaFlip,
    }),
    positioningSupport: buildSupportLabel(positioningFloor),
    positioningResistance: buildResistanceLabel(positioningCeiling),
    confidence: gamma.confidence,
    warnings: buildPositioningWarnings(gamma),
  };
}
