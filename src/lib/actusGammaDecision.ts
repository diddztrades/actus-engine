import type { GammaOverlay } from "../types/chart";

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

function round(value: number, digits = 3) {
  return Number(value.toFixed(digits));
}

export function classifyGammaRegime(overlay: GammaOverlay | null, spotReference: number | null | undefined): GammaOverlay["regime"] {
  if (!overlay || typeof spotReference !== "number" || !Number.isFinite(spotReference)) {
    return null;
  }

  const gammaFlip = overlay.gammaFlip ?? null;
  if (typeof gammaFlip !== "number" || !Number.isFinite(gammaFlip) || gammaFlip === 0) {
    return "PIN";
  }

  const callWall = overlay.callWall ?? null;
  const putWall = overlay.putWall ?? null;
  const distanceToFlipPct =
    Math.abs((spotReference - gammaFlip) / gammaFlip);
  const insideWalls =
    typeof callWall === "number" &&
    Number.isFinite(callWall) &&
    typeof putWall === "number" &&
    Number.isFinite(putWall) &&
    spotReference >= Math.min(callWall, putWall) &&
    spotReference <= Math.max(callWall, putWall);

  if (insideWalls && distanceToFlipPct <= 0.0035) {
    return "PIN";
  }

  return "EXPANSION";
}

export function deriveGammaDecisionFields(
  overlay: GammaOverlay | null,
  spotReference: number | null | undefined,
): Pick<GammaOverlay, "regime" | "bias" | "confidence" | "condition"> {
  const regime = classifyGammaRegime(overlay, spotReference);
  if (!overlay || typeof spotReference !== "number" || !Number.isFinite(spotReference) || !regime) {
    return {
      regime: regime ?? null,
      bias: null,
      confidence: null,
      condition: null,
    };
  }

  if (regime === "PIN") {
    return {
      regime,
      bias: "NEUTRAL",
      confidence: 0,
      condition: "MEAN_REVERSION",
    };
  }

  const gammaFlip = overlay.gammaFlip ?? null;
  if (typeof gammaFlip !== "number" || !Number.isFinite(gammaFlip) || gammaFlip === 0) {
    return {
      regime: "PIN",
      bias: "NEUTRAL",
      confidence: 0,
      condition: "MEAN_REVERSION",
    };
  }

  const bias: GammaOverlay["bias"] = spotReference > gammaFlip ? "LONG" : spotReference < gammaFlip ? "SHORT" : "NEUTRAL";
  const distanceToFlipPct = Math.abs((spotReference - gammaFlip) / gammaFlip);
  const distanceScore = clamp(distanceToFlipPct / 0.008, 0, 1);

  const relevantWall = bias === "LONG" ? overlay.callWall ?? null : bias === "SHORT" ? overlay.putWall ?? null : null;
  const opposingWall = bias === "LONG" ? overlay.putWall ?? null : bias === "SHORT" ? overlay.callWall ?? null : null;

  const relevantWallDistancePct =
    typeof relevantWall === "number" && Number.isFinite(relevantWall) && relevantWall !== 0
      ? Math.abs((relevantWall - spotReference) / relevantWall)
      : Number.POSITIVE_INFINITY;
  const opposingWallDistancePct =
    typeof opposingWall === "number" && Number.isFinite(opposingWall) && opposingWall !== 0
      ? Math.abs((opposingWall - spotReference) / opposingWall)
      : Number.POSITIVE_INFINITY;

  const wallApproachScore = Number.isFinite(relevantWallDistancePct) ? 1 - clamp(relevantWallDistancePct / 0.006, 0, 1) : 0;
  const opposingPressureScore = Number.isFinite(opposingWallDistancePct) ? 1 - clamp(opposingWallDistancePct / 0.004, 0, 1) : 0;

  const trap =
    bias !== "NEUTRAL" &&
    opposingPressureScore > wallApproachScore &&
    opposingPressureScore >= 0.45;

  const condition: GammaOverlay["condition"] = bias === "NEUTRAL" ? "MEAN_REVERSION" : trap ? "TRAP" : "BREAKOUT";
  const normalizedBias: GammaOverlay["bias"] = trap ? "NEUTRAL" : bias;
  const baseConfidence = 0.38 + distanceScore * 0.24 + wallApproachScore * 0.28 - opposingPressureScore * 0.18;

  return {
    regime,
    bias: normalizedBias,
    confidence: round(clamp(baseConfidence, trap ? 0.22 : 0.18, trap ? 0.58 : 0.96)),
    condition,
  };
}
