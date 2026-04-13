import type { Asset } from "../types/asset";

export type ActusConviction = "Prime" | "Strong" | "Developing" | "Unconfirmed";
export type ActusState =
  | "Continuation"
  | "Expansion"
  | "Compression"
  | "Reversal Risk"
  | "Disorder";
export type ActusReadiness = "Ready" | "Building" | "Stand By";
export type ActusCaution = "Low" | "Moderate" | "High";

export type ActusAssetView = Asset & {
  conviction: ActusConviction;
  stateLabel: ActusState;
  readiness: ActusReadiness;
  caution: ActusCaution;
  summaryLabel: string;
  actionLabel: string;
};

function mapConviction(grade?: "A+" | "A" | "B" | "none"): ActusConviction {
  if (grade === "A+") return "Prime";
  if (grade === "A") return "Strong";
  if (grade === "B") return "Developing";
  return "Unconfirmed";
}

function mapState(regime: Asset["regime"]): ActusState {
  if (regime === "Trend Continuation") return "Continuation";
  if (regime === "Expansion") return "Expansion";
  if (regime === "Compression") return "Compression";
  if (regime === "Mean Reversion") return "Reversal Risk";
  return "Disorder";
}

function mapReadiness(asset: Asset): ActusReadiness {
  if (
    (asset.grade === "A+" || asset.grade === "A") &&
    (asset.bias === "Bullish" || asset.bias === "Bearish")
  ) {
    return "Ready";
  }

  if (asset.grade === "B" || asset.setup >= 70) {
    return "Building";
  }

  return "Stand By";
}

function mapCaution(asset: Asset): ActusCaution {
  const risk = asset.risk.toLowerCase();

  if (risk.includes("low")) return "Low";
  if (risk.includes("moderate")) return "Moderate";
  return "High";
}

function mapAction(asset: Asset): string {
  const posture = asset.posture.toLowerCase();

  if (posture.includes("attack")) return "Engage on pullbacks";
  if (posture.includes("buy")) return "Lean with strength";
  if (posture.includes("sell")) return "Lean with weakness";
  if (posture.includes("probe")) return "Probe only on confirmation";
  if (posture.includes("wait")) return "Wait for confirmation";
  if (posture.includes("avoid")) return "Avoid aggressive entries";

  if (asset.grade === "A+" || asset.grade === "A") return "Engage selectively";
  if (asset.grade === "B") return "Wait for confirmation";
  return "Stand aside";
}

function buildSummary(asset: Asset): string {
  const conviction = mapConviction(asset.grade);
  const stateLabel = mapState(asset.regime);

  if (conviction === "Prime") {
    return `${stateLabel} conditions are clean and aligned.`;
  }

  if (conviction === "Strong") {
    return `${stateLabel} conditions are constructive but still require discipline.`;
  }

  if (conviction === "Developing") {
    return `${stateLabel} structure is forming but not fully confirmed.`;
  }

  return `Conditions remain incomplete and require patience.`;
}

export function presentActusAsset(asset: Asset): ActusAssetView {
  const conviction = mapConviction(asset.grade);
  const stateLabel = mapState(asset.regime);
  const readiness = mapReadiness(asset);
  const caution = mapCaution(asset);
  const summaryLabel = buildSummary(asset);
  const actionLabel = mapAction(asset);

  return {
    ...asset,
    conviction,
    stateLabel,
    readiness,
    caution,
    summaryLabel,
    actionLabel,
  };
}

export function presentActusAssets(list: Asset[]): ActusAssetView[] {
  return list.map(presentActusAsset);
}