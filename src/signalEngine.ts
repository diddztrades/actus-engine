type AssetLike = {
  symbol: string;
  name: string;
  state: "wait" | "execute" | "avoid";
  price: number;
  changePct: number;
  confidence: number;
  minutesInState: number;
  sparkline: number[];
  reason?: string;
  actionText?: string;
  tone?: "buy" | "sell" | "neutral";
  quality?: number;
};

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

function sparkMomentum(points: number[]) {
  if (!points || points.length < 4) return 0;

  const recent = points.slice(-4);
  let score = 0;

  for (let i = 1; i < recent.length; i += 1) {
    score += recent[i] - recent[i - 1];
  }

  return score;
}

function getReason(state: AssetLike["state"], signalScore: number, quality: number, changePct: number) {
  if (state === "execute") {
    if (signalScore >= 72) return "Strong directional alignment with supportive momentum.";
    if (changePct > 0.2) return "Price expansion confirmed with stable participation.";
    return "Conditions aligned enough to act, but still monitor follow-through.";
  }

  if (state === "avoid") {
    if (signalScore <= 34) return "Weak structure and deteriorating momentum.";
    if (changePct < -0.2) return "Price weakness outweighs quality. Risk remains elevated.";
    return "Conditions are unstable and conviction is low.";
  }

  if (quality >= 62) return "Improving conditions, but confirmation is incomplete.";
  return "Setup is forming, but the edge is not clear enough yet.";
}

function getActionText(state: AssetLike["state"]) {
  if (state === "execute") return "BUY";
  if (state === "avoid") return "SELL";
  return "NEUTRAL";
}

function getTone(state: AssetLike["state"]) {
  if (state === "execute") return "buy";
  if (state === "avoid") return "sell";
  return "neutral";
}

export function stabiliseAsset(asset: AssetLike): AssetLike {
  const momentum = sparkMomentum(asset.sparkline);
  const priceBias = asset.changePct * 18;
  const persistenceBoost = Math.min(asset.minutesInState, 20) * 0.7;

  const baseSignalScore = clamp(
    Math.round(
      (asset.confidence * 0.62) +
      (momentum * 2.4) +
      priceBias +
      persistenceBoost
    ),
    0,
    100
  );

  const quality = clamp(
    Math.round(
      (asset.confidence * 0.7) +
      (Math.abs(momentum) * 2.1) +
      (Math.max(asset.changePct, -asset.changePct) * 8)
    ),
    20,
    99
  );

  let nextState: AssetLike["state"] = asset.state;

  // Hysteresis: harder to leave current state than to remain in it
  if (asset.state === "execute") {
    if (baseSignalScore < 54) nextState = "wait";
    else nextState = "execute";
  } else if (asset.state === "avoid") {
    if (baseSignalScore > 48) nextState = "wait";
    else nextState = "avoid";
  } else {
    if (baseSignalScore >= 68) nextState = "execute";
    else if (baseSignalScore <= 36) nextState = "avoid";
    else nextState = "wait";
  }

  const nextConfidence = clamp(
    Math.round((asset.confidence * 0.68) + (baseSignalScore * 0.32)),
    25,
    95
  );

  return {
    ...asset,
    state: nextState,
    confidence: nextConfidence,
    quality,
    actionText: getActionText(nextState),
    tone: getTone(nextState),
    reason: getReason(nextState, baseSignalScore, quality, asset.changePct)
  };
}

export function stabiliseBoard(board: any) {
  const wait = board.wait.map(stabiliseAsset);
  const execute = board.execute.map(stabiliseAsset);
  const avoid = board.avoid.map(stabiliseAsset);

  // Re-bucket after stabilisation
  const all = [...wait, ...execute, ...avoid];

  return {
    wait: all.filter((x) => x.state === "wait").sort((a, b) => b.confidence - a.confidence),
    execute: all.filter((x) => x.state === "execute").sort((a, b) => b.confidence - a.confidence),
    avoid: all.filter((x) => x.state === "avoid").sort((a, b) => b.confidence - a.confidence)
  };
}

export function buildLeadFromBoard(currentHero: any, board: any) {
  const lead =
    board.execute[0] ||
    board.wait[0] ||
    board.avoid[0];

  if (!lead) return currentHero;

  return {
    ...currentHero,
    asset: lead.name === "GOLD" ? "Gold" : lead.name,
    symbol: lead.symbol,
    state: lead.state,
    actionLabel: lead.state === "execute" ? "EXECUTE" : lead.state === "avoid" ? "AVOID" : "WAIT",
    confidence: lead.confidence,
    minutesInState: lead.minutesInState,
    price: lead.price,
    changePct: lead.changePct,
    reason: lead.reason || currentHero.reason
  };
}