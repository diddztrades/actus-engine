type EngineAsset = {
  state: string;
  confidence: number;
  changePct: number;
  [key: string]: unknown;
};

export function enhanceAsset<T extends EngineAsset>(asset: T) {
  let status = "BUILDING";
  let action = "WAIT";
  let reason = "Awaiting alignment";

  if (asset.state === "execute") {
    status = "CONFIRMED";
    action = "EXECUTE";
    reason = "Momentum + structure aligned";
  }

  if (asset.state === "avoid") {
    status = "FAILING";
    action = "AVOID";
    reason = "Breakdown / instability detected";
  }

  const quality = Math.min(100, Math.max(20, asset.confidence + asset.changePct * 5));

  return {
    ...asset,
    status,
    action,
    quality,
    reason
  };
}
