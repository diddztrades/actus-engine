import type { AssetCardData, DecisionState, HeroDecisionData, RankedItem, SignalAge, TradeAction } from "../types/decision";

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

function getMomentum(points: number[]) {
  if (!points || points.length < 5) return 0;
  const recent = points.slice(-5);
  let score = 0;
  for (let i = 1; i < recent.length; i += 1) {
    score += recent[i] - recent[i - 1];
  }
  return score;
}

function getBias(value: number, up = 3, down = -3): "up" | "down" | "flat" {
  if (value >= up) return "up";
  if (value <= down) return "down";
  return "flat";
}

function ageFor(minutesInState: number): SignalAge {
  if (minutesInState <= 2) return "just_entered";
  if (minutesInState <= 12) return "active";
  if (minutesInState <= 25) return "mature";
  return "expiring";
}

function actionFor(state: DecisionState): TradeAction {
  if (state === "execute") return "buy";
  if (state === "avoid") return "sell";
  return "neutral";
}

function buildReason(state: DecisionState, momentum: number, priceChange: number, quality: number, structuralBias: string) {
  if (state === "execute") {
    if (quality >= 80) return "Conditions are aligned with stable momentum and strong structural support.";
    if (momentum > 5) return "Momentum is expanding and the structure is still holding.";
    return "Setup quality is high enough to act while the environment remains supportive.";
  }

  if (state === "avoid") {
    if (structuralBias === "fragile") return "Structure is weakening and conditions are no longer supportive.";
    if (priceChange < -0.25) return "Downside pressure remains dominant and recovery quality is poor.";
    return "Risk conditions outweigh opportunity. Best to stay out.";
  }

  if (momentum > 2) return "Conditions are improving, but confirmation is incomplete.";
  if (momentum < -2) return "Weakness is present, but not decisive enough to block completely.";
  return "Conditions are balanced. Wait for stronger alignment.";
}

export function stabiliseAsset(asset: AssetCardData): AssetCardData {
  const momentum = getMomentum(asset.sparkline);
  const momentumBias = getBias(momentum);

  const structuralScore = clamp(
    Math.round((asset.confidence * 0.45) + (momentum * 2.1) + (asset.changePct * 10)),
    0,
    100
  );

  const structuralBias =
    structuralScore >= 66 ? "supported" :
    structuralScore <= 34 ? "fragile" :
    "neutral";

  const sessionBias =
    asset.minutesInState <= 10 ? "favorable" :
    asset.minutesInState <= 22 ? "mixed" :
    "unfavorable";

  let nextState: DecisionState = asset.state;

  // persistence + hysteresis
  if (asset.state === "execute") {
    nextState = structuralScore < 52 ? "wait" : "execute";
  } else if (asset.state === "avoid") {
    nextState = structuralScore > 46 ? "wait" : "avoid";
  } else {
    if (structuralScore >= 68 && momentumBias === "up") nextState = "execute";
    else if (structuralScore <= 34 && momentumBias === "down") nextState = "avoid";
    else nextState = "wait";
  }

  const confidence = clamp(
    Math.round(asset.confidence * 0.72 + structuralScore * 0.28),
    25,
    95
  );

  const quality = clamp(
    Math.round((confidence * 0.62) + (Math.abs(momentum) * 3.2) + (Math.abs(asset.changePct) * 8)),
    20,
    99
  );

  return {
    ...asset,
    state: nextState,
    action: actionFor(nextState),
    confidence,
    quality,
    momentumBias,
    structuralBias,
    sessionBias,
    reason: buildReason(nextState, momentum, asset.changePct, quality, structuralBias)
  };
}

export function buildDerivedState(assets: AssetCardData[], currentHero: HeroDecisionData, winRate: number) {
  const stabilised = assets.map(stabiliseAsset);

  const ranked = [...stabilised]
    .sort((a, b) => {
      const rank = (x: AssetCardData) => (x.state === "execute" ? 2 : x.state === "wait" ? 1 : 0);
      return rank(b) - rank(a) || (b.quality ?? b.confidence) - (a.quality ?? a.confidence);
    });

  const lead = ranked[0] ?? null;

  const hero: HeroDecisionData = lead
    ? {
        ...currentHero,
        headline:
          lead.state === "execute"
            ? "YOU HAVE AN ACTIVE OPPORTUNITY"
            : lead.state === "avoid"
            ? "HIGH RISK CONDITIONS DETECTED"
            : "WAITING FOR CONFIRMATION",
        asset: lead.name.toUpperCase(),
        action: actionFor(lead.state),
        confidence: lead.confidence,
        minutesInState: lead.minutesInState,
        reason: lead.reason ?? currentHero.reason,
        signalAge: ageFor(lead.minutesInState),
        price: lead.price,
        changePct: lead.changePct,
        chart: [...lead.sparkline, ...lead.sparkline.slice(-6)],
        entry: Number((lead.price * (lead.state === "avoid" ? 0.996 : 1.002)).toFixed(lead.price < 10 ? 4 : 2)),
        invalidation: Number((lead.price * (lead.state === "avoid" ? 1.006 : 0.994)).toFixed(lead.price < 10 ? 4 : 2)),
        winRate
      }
    : currentHero;

  const rankedItems: RankedItem[] = ranked.slice(0, 5).map((item) => ({
    label: item.name.toUpperCase(),
    state: item.state,
    score: item.quality ?? item.confidence
  }));

  return {
    assets: stabilised,
    hero,
    ranked: rankedItems
  };
}
