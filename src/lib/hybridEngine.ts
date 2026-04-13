export type HybridDirection = "long" | "short" | "none";
export type HybridGrade = "A+" | "A" | "B" | "none";

export type HybridContext = {
  asset: string;
  timeframe: "1m" | "5m" | "15m" | "1h";
  price: {
    open: number;
    high: number;
    low: number;
    close: number;
  };
  ema50: number;
  asiaHigh: number;
  asiaLow: number;
  londonHigh?: number;
  londonLow?: number;
  nyOpenRangeHigh?: number;
  nyOpenRangeLow?: number;
  firstHourHigh?: number;
  firstHourLow?: number;
  isGreenVector: boolean;
  isRedVector: boolean;
  closedBackAboveAsiaLow?: boolean;
  closedBackBelowAsiaHigh?: boolean;
  aboveEma50?: boolean;
  belowEma50?: boolean;
  sparkline?: number[];
  stateAge?: number;
  currentState?: "Waiting" | "Watching" | "Building" | "Execute" | "Exhaustion" | "Invalidated";
  stateConfidence?: number;
  freshnessState?: "fresh" | "aging" | "stale";
  freshnessScore?: number;
  tooLateFlag?: boolean;
  reasons?: string[];
  decayWarning?: string | null;
  invalidationWarning?: string | null;
  stateDebug?: {
    rawStateInputs?: Record<string, string | number | boolean | null>;
    baseScore?: number;
    chosenState?: string;
    stateConfidence?: number;
    freshnessState?: "fresh" | "aging" | "stale";
    freshnessScore?: number;
    tooLateFlag?: boolean;
    topReasons?: string[];
  };
};

export type HybridSignal = {
  signal: HybridDirection;
  grade: HybridGrade;
  title: string;
  reasons: string[];
  invalidation: string;
  regime: string;
  location: string;
  posture: string;
};

type Direction = "long" | "short";

type ScoreBreakdown = {
  score: number;
  reasons: string[];
  gatePassed: boolean;
  reclaimOrReject: boolean;
  vectorAligned: boolean;
  openingRangeBreak: boolean;
  firstHourBreak: boolean;
  trendAligned: boolean;
  momentumStrong: boolean;
  momentumWeakAgainst: boolean;
  continuationPressure: boolean;
  vetoed: boolean;
};

export function evaluateHybridState(context: HybridContext): HybridSignal {
  const above50 =
    typeof context.aboveEma50 === "boolean"
      ? context.aboveEma50
      : context.price.close > context.ema50;

  const below50 =
    typeof context.belowEma50 === "boolean"
      ? context.belowEma50
      : context.price.close < context.ema50;

  const longBreakdown = scoreLongSignal(context, above50);
  const shortBreakdown = scoreShortSignal(context, below50);

  if (
    !longBreakdown.vetoed &&
    longBreakdown.gatePassed &&
    longBreakdown.score > shortBreakdown.score &&
    longBreakdown.score >= 60
  ) {
    return {
      signal: "long",
      grade: getGrade(longBreakdown.score),
      title: buildLongTitle(longBreakdown.score),
      reasons: longBreakdown.reasons,
      invalidation: buildInvalidation(context, "long"),
      regime: buildRegime(context, "long", longBreakdown),
      location: buildLocation(context, "long", longBreakdown),
      posture: buildPosture(longBreakdown.score, "long", longBreakdown),
    };
  }

  if (
    !shortBreakdown.vetoed &&
    shortBreakdown.gatePassed &&
    shortBreakdown.score > longBreakdown.score &&
    shortBreakdown.score >= 60
  ) {
    return {
      signal: "short",
      grade: getGrade(shortBreakdown.score),
      title: buildShortTitle(shortBreakdown.score),
      reasons: shortBreakdown.reasons,
      invalidation: buildInvalidation(context, "short"),
      regime: buildRegime(context, "short", shortBreakdown),
      location: buildLocation(context, "short", shortBreakdown),
      posture: buildPosture(shortBreakdown.score, "short", shortBreakdown),
    };
  }

  return {
    signal: "none",
    grade: "none",
    title: "No valid opportunity",
    reasons: buildNeutralReasons(context, above50, below50),
    invalidation: "Wait for full confluence",
    regime: buildNeutralRegime(context),
    location: buildNeutralLocation(context),
    posture: "Stand aside until conditions align",
  };
}

function scoreLongSignal(context: HybridContext, above50: boolean): ScoreBreakdown {
  const longAsiaSweepReclaim =
    context.price.low <= context.asiaLow && Boolean(context.closedBackAboveAsiaLow);

  const greenVectorAbove50 = context.isGreenVector && above50;

  const nyHighBreak =
    typeof context.nyOpenRangeHigh === "number" && context.price.close > context.nyOpenRangeHigh;

  const firstHourHighBreak =
    typeof context.firstHourHigh === "number" && context.price.close > context.firstHourHigh;

  const londonReclaim =
    typeof context.londonHigh === "number" && context.price.close > context.londonHigh && above50;

  const trendAligned = above50;
  const reclaimOrReject = longAsiaSweepReclaim || londonReclaim;
  const vectorAligned = greenVectorAbove50;
  const openingRangeBreak = Boolean(nyHighBreak);
  const firstHourBreak = Boolean(firstHourHighBreak);

  const closeStrength = getCloseStrength(context, "long");
  const momentumState = getMomentumState(context);
  const momentumStrong = momentumState === "bullish";
  const momentumWeakAgainst = momentumState === "bearish";

  const asiaFreshness = longAsiaSweepReclaim ? getLevelFreshness(context, context.asiaLow, "long") : 0;

  const londonFreshness =
    londonReclaim && typeof context.londonHigh === "number"
      ? getLevelFreshness(context, context.londonHigh, "long")
      : 0;

  const openingRangeFreshness =
    openingRangeBreak && typeof context.nyOpenRangeHigh === "number"
      ? getLevelFreshness(context, context.nyOpenRangeHigh, "long")
      : 0;

  const firstHourFreshness =
    firstHourBreak && typeof context.firstHourHigh === "number"
      ? getLevelFreshness(context, context.firstHourHigh, "long")
      : 0;

  const recencyBias = getRecencyBias(context, "long");
  const continuationPressure = getLongContinuationPressure(context, above50, momentumState);

  const reasons: string[] = [];
  let score = 0;

  if (trendAligned) {
    score += 18;
    reasons.push("Price is above the 50 EMA");
  }

  if (longAsiaSweepReclaim) {
    score += weightedScore(16, asiaFreshness, recencyBias);
    reasons.push("Asia low sweep reclaimed");
  }

  if (londonReclaim) {
    score += weightedScore(12, londonFreshness, recencyBias);
    reasons.push("London structure has been regained");
  }

  if (vectorAligned) {
    score += 24;
    reasons.push("Green vector closed above 50 EMA");
  }

  if (openingRangeBreak) {
    score += weightedScore(16, openingRangeFreshness, recencyBias);
    reasons.push("NY opening range high has broken");
  }

  if (firstHourBreak) {
    score += weightedScore(14, firstHourFreshness, recencyBias);
    reasons.push("First-hour high is clearing");
  }

  if (closeStrength === "strong") {
    score += 10;
    reasons.push("Close is finishing near the high");
  } else if (closeStrength === "weak") {
    score -= 10;
  }

  if (momentumStrong) {
    score += 12;
    reasons.push("Bullish expansion pressure is active");
  }

  if (momentumWeakAgainst) {
    score -= 18;
    reasons.push("Opposing momentum is still active");
  }

  if (continuationPressure) {
    score += 10;
    reasons.push("Continuation pressure remains intact");
  }

  const emaExtension = getEmaExtension(context);
  if (emaExtension === "healthy") {
    score += 6;
    reasons.push("Distance from 50 EMA remains controlled");
  } else if (emaExtension === "stretched") {
    score -= 8;
    reasons.push("Move is extended away from the 50 EMA");
  }

  if (
    longAsiaSweepReclaim &&
    asiaFreshness < 0.45 &&
    !openingRangeBreak &&
    !firstHourBreak &&
    !momentumStrong
  ) {
    score -= 8;
    reasons.push("Older reclaim context is losing influence");
  }

  const vetoed = isLongVetoed(above50, closeStrength, momentumState);

  const gatePassed =
    !vetoed &&
    trendAligned &&
    ((vectorAligned && continuationPressure) ||
      (vectorAligned && openingRangeBreak) ||
      (reclaimOrReject && vectorAligned && recencyBias >= 0.45) ||
      (reclaimOrReject && openingRangeBreak && firstHourBreak));

  return {
    score: Math.max(0, Math.min(100, score)),
    reasons,
    gatePassed,
    reclaimOrReject,
    vectorAligned,
    openingRangeBreak,
    firstHourBreak,
    trendAligned,
    momentumStrong,
    momentumWeakAgainst,
    continuationPressure,
    vetoed,
  };
}

function scoreShortSignal(context: HybridContext, below50: boolean): ScoreBreakdown {
  const shortAsiaSweepReject =
    context.price.high >= context.asiaHigh && Boolean(context.closedBackBelowAsiaHigh);

  const redVectorBelow50 = context.isRedVector && below50;

  const nyLowBreak =
    typeof context.nyOpenRangeLow === "number" && context.price.close < context.nyOpenRangeLow;

  const firstHourLowBreak =
    typeof context.firstHourLow === "number" && context.price.close < context.firstHourLow;

  const londonReject =
    typeof context.londonLow === "number" && context.price.close < context.londonLow && below50;

  const trendAligned = below50;
  const reclaimOrReject = shortAsiaSweepReject || londonReject;
  const vectorAligned = redVectorBelow50;
  const openingRangeBreak = Boolean(nyLowBreak);
  const firstHourBreak = Boolean(firstHourLowBreak);

  const closeStrength = getCloseStrength(context, "short");
  const momentumState = getMomentumState(context);
  const momentumStrong = momentumState === "bearish";
  const momentumWeakAgainst = momentumState === "bullish";

  const asiaFreshness = shortAsiaSweepReject ? getLevelFreshness(context, context.asiaHigh, "short") : 0;

  const londonFreshness =
    londonReject && typeof context.londonLow === "number"
      ? getLevelFreshness(context, context.londonLow, "short")
      : 0;

  const openingRangeFreshness =
    openingRangeBreak && typeof context.nyOpenRangeLow === "number"
      ? getLevelFreshness(context, context.nyOpenRangeLow, "short")
      : 0;

  const firstHourFreshness =
    firstHourBreak && typeof context.firstHourLow === "number"
      ? getLevelFreshness(context, context.firstHourLow, "short")
      : 0;

  const recencyBias = getRecencyBias(context, "short");
  const continuationPressure = getShortContinuationPressure(context, below50, momentumState);

  const reasons: string[] = [];
  let score = 0;

  if (trendAligned) {
    score += 18;
    reasons.push("Price is below the 50 EMA");
  }

  if (shortAsiaSweepReject) {
    score += weightedScore(16, asiaFreshness, recencyBias);
    reasons.push("Asia high sweep rejected");
  }

  if (londonReject) {
    score += weightedScore(12, londonFreshness, recencyBias);
    reasons.push("London structure has failed");
  }

  if (vectorAligned) {
    score += 24;
    reasons.push("Red vector closed below 50 EMA");
  }

  if (openingRangeBreak) {
    score += weightedScore(16, openingRangeFreshness, recencyBias);
    reasons.push("NY opening range low has broken");
  }

  if (firstHourBreak) {
    score += weightedScore(14, firstHourFreshness, recencyBias);
    reasons.push("First-hour low is breaking");
  }

  if (closeStrength === "strong") {
    score += 10;
    reasons.push("Close is finishing near the low");
  } else if (closeStrength === "weak") {
    score -= 10;
  }

  if (momentumStrong) {
    score += 12;
    reasons.push("Bearish expansion pressure is active");
  }

  if (momentumWeakAgainst) {
    score -= 18;
    reasons.push("Opposing momentum is still active");
  }

  if (continuationPressure) {
    score += 10;
    reasons.push("Continuation pressure remains intact");
  }

  const emaExtension = getEmaExtension(context);
  if (emaExtension === "healthy") {
    score += 6;
    reasons.push("Distance from 50 EMA remains controlled");
  } else if (emaExtension === "stretched") {
    score -= 8;
    reasons.push("Move is extended away from the 50 EMA");
  }

  if (
    shortAsiaSweepReject &&
    asiaFreshness < 0.45 &&
    !openingRangeBreak &&
    !firstHourBreak &&
    !momentumStrong
  ) {
    score -= 8;
    reasons.push("Older rejection context is losing influence");
  }

  const vetoed = isShortVetoed(context, below50, closeStrength, momentumState);

  const gatePassed =
    !vetoed &&
    trendAligned &&
    ((vectorAligned && continuationPressure) ||
      (vectorAligned && openingRangeBreak) ||
      (reclaimOrReject && vectorAligned && recencyBias >= 0.45) ||
      (reclaimOrReject && openingRangeBreak && firstHourBreak));

  return {
    score: Math.max(0, Math.min(100, score)),
    reasons,
    gatePassed,
    reclaimOrReject,
    vectorAligned,
    openingRangeBreak,
    firstHourBreak,
    trendAligned,
    momentumStrong,
    momentumWeakAgainst,
    continuationPressure,
    vetoed,
  };
}

function weightedScore(base: number, freshness: number, recencyBias: number) {
  return Math.round(base * Math.max(0.35, Math.min(1, freshness * recencyBias)));
}

function getCloseStrength(context: HybridContext, direction: Direction): "strong" | "neutral" | "weak" {
  const range = Math.max(context.price.high - context.price.low, 0.0000001);

  if (direction === "long") {
    const closeFromHigh = (context.price.high - context.price.close) / range;
    if (closeFromHigh <= 0.2) return "strong";
    if (closeFromHigh >= 0.55) return "weak";
    return "neutral";
  }

  const closeFromLow = (context.price.close - context.price.low) / range;
  if (closeFromLow <= 0.2) return "strong";
  if (closeFromLow >= 0.55) return "weak";
  return "neutral";
}

function getEmaExtension(context: HybridContext): "healthy" | "stretched" | "flat" {
  const distance = Math.abs(context.price.close - context.ema50);
  const range = Math.max(context.price.high - context.price.low, 0.0000001);
  const ratio = distance / range;

  if (ratio <= 1.8) return "healthy";
  if (ratio >= 3.4) return "stretched";
  return "flat";
}

function getBodyRatio(context: HybridContext) {
  const range = Math.max(context.price.high - context.price.low, 0.0000001);
  const body = Math.abs(context.price.close - context.price.open);
  return body / range;
}

function getMomentumState(context: HybridContext): "bullish" | "bearish" | "neutral" {
  const bodyRatio = getBodyRatio(context);
  const closeNearHigh = getCloseStrength(context, "long") === "strong";
  const closeNearLow = getCloseStrength(context, "short") === "strong";
  const above50 =
    typeof context.aboveEma50 === "boolean"
      ? context.aboveEma50
      : context.price.close > context.ema50;
  const below50 =
    typeof context.belowEma50 === "boolean"
      ? context.belowEma50
      : context.price.close < context.ema50;

  if (context.price.close > context.price.open && closeNearHigh && bodyRatio >= 0.55 && above50) {
    return "bullish";
  }

  if (context.price.close < context.price.open && closeNearLow && bodyRatio >= 0.55 && below50) {
    return "bearish";
  }

  return "neutral";
}

function getLevelFreshness(context: HybridContext, level: number, direction: Direction) {
  const range = Math.max(context.price.high - context.price.low, 0.0000001);
  const distance =
    direction === "long" ? Math.abs(context.price.close - level) : Math.abs(level - context.price.close);

  const ratio = distance / range;

  if (ratio <= 0.75) return 1;
  if (ratio <= 1.5) return 0.8;
  if (ratio <= 2.4) return 0.62;
  if (ratio <= 3.4) return 0.45;
  return 0.3;
}

function getRecencyBias(context: HybridContext, direction: Direction) {
  const momentumState = getMomentumState(context);
  const closeStrength = getCloseStrength(context, direction);

  if (
    (direction === "long" && momentumState === "bullish" && closeStrength === "strong") ||
    (direction === "short" && momentumState === "bearish" && closeStrength === "strong")
  ) {
    return 1;
  }

  if (
    (direction === "long" && momentumState === "bearish") ||
    (direction === "short" && momentumState === "bullish")
  ) {
    return 0.55;
  }

  return 0.8;
}

function getLongContinuationPressure(
  context: HybridContext,
  above50: boolean,
  momentumState: "bullish" | "bearish" | "neutral",
) {
  const openingRangeBreak =
    typeof context.nyOpenRangeHigh === "number" && context.price.close > context.nyOpenRangeHigh;

  const firstHourBreak =
    typeof context.firstHourHigh === "number" && context.price.close > context.firstHourHigh;

  return above50 && context.isGreenVector && momentumState === "bullish" && (openingRangeBreak || firstHourBreak);
}

function getShortContinuationPressure(
  context: HybridContext,
  below50: boolean,
  momentumState: "bullish" | "bearish" | "neutral",
) {
  const openingRangeBreak =
    typeof context.nyOpenRangeLow === "number" && context.price.close < context.nyOpenRangeLow;

  const firstHourBreak =
    typeof context.firstHourLow === "number" && context.price.close < context.firstHourLow;

  return below50 && context.isRedVector && momentumState === "bearish" && (openingRangeBreak || firstHourBreak);
}

function isLongVetoed(
  above50: boolean,
  closeStrength: "strong" | "neutral" | "weak",
  momentumState: "bullish" | "bearish" | "neutral",
) {
  if (!above50 && momentumState === "bearish") return true;
  if (closeStrength === "weak" && momentumState === "bearish") return true;
  return false;
}

function isShortVetoed(
  context: HybridContext,
  below50: boolean,
  closeStrength: "strong" | "neutral" | "weak",
  momentumState: "bullish" | "bearish" | "neutral",
) {
  if (!below50 && momentumState === "bullish") return true;
  if (closeStrength === "weak" && momentumState === "bullish") return true;

  const strongBullishClose =
    context.price.close > context.price.open &&
    getCloseStrength(context, "long") === "strong" &&
    getBodyRatio(context) >= 0.6;

  const breakoutPressure =
    context.isGreenVector &&
    typeof context.nyOpenRangeHigh === "number" &&
    context.price.close > context.nyOpenRangeHigh;

  if (strongBullishClose || breakoutPressure) return true;

  return false;
}

function getGrade(score: number): HybridGrade {
  if (score >= 90) return "A+";
  if (score >= 76) return "A";
  if (score >= 60) return "B";
  return "none";
}

function buildLongTitle(score: number) {
  if (score >= 90) return "A+ long trigger";
  if (score >= 76) return "A-grade long";
  return "B-grade long";
}

function buildShortTitle(score: number) {
  if (score >= 90) return "A+ short trigger";
  if (score >= 76) return "A-grade short";
  return "B-grade short";
}

function buildRegime(context: HybridContext, direction: Direction, breakdown: ScoreBreakdown) {
  if (direction === "long") {
    if (
      breakdown.trendAligned &&
      breakdown.vectorAligned &&
      (breakdown.openingRangeBreak || breakdown.continuationPressure)
    ) {
      return "Trend Continuation";
    }

    if (breakdown.reclaimOrReject) {
      return "Expansion";
    }

    if (context.price.close > context.ema50) {
      return "Compression";
    }

    return "Mean Reversion";
  }

  if (
    breakdown.trendAligned &&
    breakdown.vectorAligned &&
    (breakdown.openingRangeBreak || breakdown.continuationPressure)
  ) {
    return "Trend Continuation";
  }

  if (breakdown.reclaimOrReject) {
    return "Expansion";
  }

  if (context.price.close < context.ema50) {
    return "Compression";
  }

  return "Mean Reversion";
}

function buildLocation(context: HybridContext, direction: Direction, breakdown: ScoreBreakdown) {
  if (direction === "long") {
    if (typeof context.nyOpenRangeHigh === "number" && context.price.close > context.nyOpenRangeHigh) {
      return "NY opening range break";
    }

    if (context.price.low <= context.asiaLow && Boolean(context.closedBackAboveAsiaLow)) {
      return "Asia low sweep reclaim";
    }

    if (breakdown.trendAligned) {
      return "Above 50 EMA";
    }

    return "Inside active structure";
  }

  if (typeof context.nyOpenRangeLow === "number" && context.price.close < context.nyOpenRangeLow) {
    return "NY opening range break";
  }

  if (context.price.high >= context.asiaHigh && Boolean(context.closedBackBelowAsiaHigh)) {
    return "Asia high sweep reject";
  }

  if (breakdown.trendAligned) {
    return "Below 50 EMA";
  }

  return "Inside active structure";
}

function buildPosture(score: number, direction: Direction, breakdown: ScoreBreakdown) {
  if (score >= 90) {
    return direction === "long" ? "Attack pullbacks only" : "Sell rallies only";
  }

  if (score >= 76) {
    return direction === "long"
      ? breakdown.openingRangeBreak || breakdown.firstHourBreak
        ? "Buy disciplined pullbacks"
        : "Press only if continuation holds"
      : breakdown.openingRangeBreak || breakdown.firstHourBreak
        ? "Sell disciplined retracements"
        : "Press only if weakness holds";
  }

  return direction === "long" ? "Probe only if confirmation holds" : "Probe only if rejection holds";
}

function buildInvalidation(context: HybridContext, direction: Direction) {
  if (direction === "long") {
    if (context.price.low <= context.asiaLow && Boolean(context.closedBackAboveAsiaLow)) {
      return "Lose reclaim structure / close back below Asia low";
    }

    return "Close back below 50 EMA / lose breakout hold";
  }

  if (context.price.high >= context.asiaHigh && Boolean(context.closedBackBelowAsiaHigh)) {
    return "Lose rejection structure / close back above Asia high";
  }

  return "Close back above 50 EMA / lose breakdown hold";
}

function buildNeutralReasons(context: HybridContext, above50: boolean, below50: boolean) {
  const momentumState = getMomentumState(context);
  const longContinuation = getLongContinuationPressure(context, above50, momentumState);
  const shortContinuation = getShortContinuationPressure(context, below50, momentumState);

  if (longContinuation) {
    return ["Bullish continuation pressure is active but full confirmation is not yet stacked"];
  }

  if (shortContinuation) {
    return ["Bearish continuation pressure is active but full confirmation is not yet stacked"];
  }

  if (momentumState === "bullish" && above50) {
    return ["Bullish momentum is active but full confirmation is not yet stacked"];
  }

  if (momentumState === "bearish" && below50) {
    return ["Bearish momentum is active but full confirmation is not yet stacked"];
  }

  if (above50 && !context.isGreenVector) {
    return ["Bullish structure is present but confirmation quality is incomplete"];
  }

  if (below50 && !context.isRedVector) {
    return ["Bearish structure is present but confirmation quality is incomplete"];
  }

  if (above50) {
    return ["Price is above the 50 EMA but confluence is not yet stacked"];
  }

  if (below50) {
    return ["Price is below the 50 EMA but confluence is not yet stacked"];
  }

  return ["Conditions are incomplete or misaligned"];
}

function buildNeutralRegime(context: HybridContext) {
  if (context.price.close > context.ema50) return "Bullish structure, no trigger";
  if (context.price.close < context.ema50) return "Bearish structure, no trigger";
  return "Compression";
}

function buildNeutralLocation(context: HybridContext) {
  if (context.price.close > context.ema50) return "Above 50 EMA without full confluence";
  if (context.price.close < context.ema50) return "Below 50 EMA without full confluence";
  return "Between key levels";
}
