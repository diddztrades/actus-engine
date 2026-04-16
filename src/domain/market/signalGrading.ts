import { evaluateHybridState } from "../../lib/hybridEngine";
import type { HybridContext } from "../../lib/hybridEngine";
import { evaluateLiquiditySweeps } from "./liquiditySweeps";
import { evaluateMacroConfirmation } from "./macroConfirmation";
import { evaluateSessionLogic } from "./sessionLogic";
import { evaluateTrendBias } from "./trendBias";
import type {
  ActusAction,
  ActusBias,
  ActusConviction,
  ActusDirection,
  ActusFreshnessState,
  ActusMacroInput,
  ActusNormalizedMarketInput,
  ActusOpportunityOutput,
  ActusRegime,
  ActusRiskState,
  ActusSetupType,
  ActusState,
  ActusTriggerQuality,
} from "./types";
import { evaluateVectorTriggers } from "./vectorTriggers";

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

function sanitizeVisibleLanguage(value: string) {
  return value
    .replace(/50 EMA/gi, "market baseline")
    .replace(/EMA 50/gi, "market baseline")
    .replace(/Above 50 EMA/gi, "Above the market baseline")
    .replace(/Below 50 EMA/gi, "Below the market baseline")
    .replace(/trend line/gi, "control level")
    .replace(/vector/gi, "momentum event")
    .replace(/mean reversion/gi, "reversion")
    .replace(/opening range/gi, "opening structure")
    .replace(/first-hour/gi, "opening")
    .replace(/first hour/gi, "opening")
    .replace(/near ema/gi, "near fair value");
}

function toHybridContext(input: ActusNormalizedMarketInput): HybridContext {
  return {
    asset: input.symbol,
    timeframe: input.timeframe,
    price: input.price,
    ema50: input.structure.ema50,
    asiaHigh: input.sessionLevels.asiaHigh,
    asiaLow: input.sessionLevels.asiaLow,
    londonHigh: input.sessionLevels.londonHigh,
    londonLow: input.sessionLevels.londonLow,
    nyOpenRangeHigh: input.sessionLevels.nyOpenRangeHigh,
    nyOpenRangeLow: input.sessionLevels.nyOpenRangeLow,
    firstHourHigh: input.sessionLevels.firstHourHigh,
    firstHourLow: input.sessionLevels.firstHourLow,
    isGreenVector: input.vector.green,
    isRedVector: input.vector.red,
    closedBackAboveAsiaLow: input.structure.closedBackAboveAsiaLow,
    closedBackBelowAsiaHigh: input.structure.closedBackBelowAsiaHigh,
    aboveEma50: input.structure.aboveEma50,
    belowEma50: input.structure.belowEma50,
  };
}

function mapRegime(value: string): ActusRegime {
  if (value === "Trend Continuation") return "trend";
  if (value === "Expansion") return "expansion";
  if (value === "Compression") return "compression";
  if (value === "Mean Reversion") return "mean-reversion";
  return "reversal";
}

function mapState(direction: ActusDirection, liquidityState: ActusState, sessionState: ActusState): ActusState {
  if (liquidityState !== "balanced") return liquidityState;
  if (sessionState !== "balanced") return sessionState;
  if (direction === "long" || direction === "short") return "continuation";
  return "balanced";
}

function mapLiveCurrentState(value: NonNullable<ActusNormalizedMarketInput["liveState"]>["currentState"]): ActusState {
  if (value === "Execute") return "execute";
  if (value === "Exhaustion") return "exhaustion";
  if (value === "Invalidated") return "invalidated";
  if (value === "Building") return "building";
  if (value === "Watching") return "watching";
  return "waiting";
}

function mapConviction(score: number): ActusConviction {
  if (score >= 76) return "high";
  if (score >= 58) return "medium";
  return "low";
}

function getFreshnessLimit(timeframe: ActusNormalizedMarketInput["timeframe"]) {
  if (timeframe === "1m") return 10;
  if (timeframe === "5m") return 30;
  if (timeframe === "15m") return 90;
  return 240;
}

function mapRiskState(
  distanceFromEmaPct: number,
  grade: ActusTriggerQuality,
  macroScore: number,
  stateAgeMinutes: number,
  timeframe: ActusNormalizedMarketInput["timeframe"],
): ActusRiskState {
  if (stateAgeMinutes > getFreshnessLimit(timeframe)) return "late";
  if (distanceFromEmaPct >= 0.95) return "late";
  if (macroScore <= 40) return "unstable";
  if (grade === "B") return "crowded";
  return "clean";
}

function mapAction(
  direction: ActusDirection,
  quality: ActusTriggerQuality,
  riskState: ActusRiskState,
  confidenceScore: number,
): ActusAction {
  if (direction === "neutral" || quality === "none") return "wait";
  if (confidenceScore < 78) return "wait";
  if (riskState === "unstable" || riskState === "late") return "avoid";
  return quality === "B" ? "wait" : "execute";
}

function directionMatchesTrend(direction: ActusDirection, bias: ActusBias) {
  if (direction === "neutral" || bias === "neutral" || bias === "mixed") {
    return true;
  }
  return (direction === "long" && bias === "bullish") || (direction === "short" && bias === "bearish");
}

function qualifiesForContinuationRelief(args: {
  regime: ActusRegime;
  direction: ActusDirection;
  trendAligned: boolean;
  state: ActusState;
  adjustedConfidence: number;
  adjustedOpportunity?: number;
  quality: ActusTriggerQuality;
  macroScore: number;
  sessionScore: number;
  vectorScore: number;
  liquidityScore: number;
  tooLateFlag?: boolean;
  freshnessState?: ActusFreshnessState;
}) {
  if (args.direction === "neutral" || !args.trendAligned || args.tooLateFlag) {
    return false;
  }
  if (args.freshnessState === "stale") {
    return false;
  }
  if (args.regime !== "trend" && args.regime !== "expansion") {
    return false;
  }
  if (args.state !== "continuation" && args.state !== "execute" && args.state !== "building") {
    return false;
  }
  return args.adjustedConfidence >= 66 && args.vectorScore >= 62 && args.liquidityScore >= 58;
}

function qualifiesForContinuationPriority(args: {
  regime: ActusRegime;
  direction: ActusDirection;
  trendAligned: boolean;
  state: ActusState;
  adjustedConfidence: number;
  adjustedOpportunity: number;
  quality: ActusTriggerQuality;
  macroScore: number;
  sessionScore: number;
  vectorScore: number;
  liquidityScore: number;
  tooLateFlag?: boolean;
  freshnessState?: ActusFreshnessState;
  moduleConflictCount: number;
  positioningConfidence?: "high" | "medium" | "low";
}) {
  if (
    !qualifiesForContinuationRelief({
      regime: args.regime,
      direction: args.direction,
      trendAligned: args.trendAligned,
      state: args.state,
      adjustedConfidence: args.adjustedConfidence,
      adjustedOpportunity: args.adjustedOpportunity,
      quality: args.quality,
      macroScore: args.macroScore,
      sessionScore: args.sessionScore,
      vectorScore: args.vectorScore,
      liquidityScore: args.liquidityScore,
      tooLateFlag: args.tooLateFlag,
      freshnessState: args.freshnessState,
    })
  ) {
    return false;
  }

  if (args.moduleConflictCount > 0 || args.positioningConfidence === "low") {
    return false;
  }
  if (args.freshnessState === "aging" || args.freshnessState === "stale") {
    return false;
  }

  return (
    args.adjustedConfidence >= 74 &&
    args.adjustedOpportunity >= 68 &&
    args.vectorScore >= 66 &&
    args.liquidityScore >= 60 &&
    args.macroScore >= 48 &&
    args.sessionScore >= 52 &&
    (args.quality === "A+" || args.quality === "A" || args.quality === "B")
  );
}

function countModuleConflicts(scores: number[]) {
  return scores.reduce((count, score) => count + (score < 55 ? 1 : 0), 0);
}

function tightenScoresForEliteFiltering(args: {
  adjustedConfidence: number;
  adjustedOpportunity: number;
  freshnessState?: ActusFreshnessState;
  stateAgeMinutes: number;
  freshnessLimit: number;
  riskState: ActusRiskState;
  positioningConfidence?: "high" | "medium" | "low";
  state: ActusState;
  moduleConflictCount: number;
  trendAligned: boolean;
  continuationPriority?: boolean;
}) {
  let nextConfidence = args.adjustedConfidence;
  let nextOpportunity = args.adjustedOpportunity;

  if (args.freshnessState === "aging") {
    nextConfidence -= 4;
    nextOpportunity -= 3;
  }
  if (args.freshnessState === "stale") {
    nextConfidence -= 8;
    nextOpportunity -= 6;
  }
  if (args.stateAgeMinutes > Math.round(args.freshnessLimit * 0.7)) {
    nextConfidence -= 3;
    nextOpportunity -= 2;
  }
  if (args.riskState === "crowded" || args.positioningConfidence === "low") {
    if (args.continuationPriority && args.riskState === "crowded" && args.positioningConfidence !== "low") {
      nextConfidence -= 1;
      nextOpportunity -= 1;
    } else {
      nextConfidence -= 4;
      nextOpportunity -= 3;
    }
  }
  if (args.state === "building" || args.state === "watching" || args.state === "balanced" || args.state === "waiting") {
    if (args.continuationPriority && args.state === "building") {
      nextConfidence -= 1;
      nextOpportunity -= 1;
    } else {
      nextConfidence -= 3;
      nextOpportunity -= 2;
    }
  }
  if (args.moduleConflictCount >= 2) {
    nextConfidence -= 6;
    nextOpportunity -= 4;
  } else if (args.moduleConflictCount === 1) {
    nextConfidence -= 2;
    nextOpportunity -= 1;
  }
  if (!args.trendAligned) {
    nextConfidence -= 4;
    nextOpportunity -= 3;
  }

  return {
    confidence: clamp(nextConfidence, 0, 100),
    opportunity: clamp(nextOpportunity, 0, 100),
  };
}

function classifyEliteAction(args: {
  direction: ActusDirection;
  quality: ActusTriggerQuality;
  riskState: ActusRiskState;
  confidence: number;
  opportunity: number;
  state: ActusState;
  tooLateFlag?: boolean;
  freshnessState?: ActusFreshnessState;
  moduleConflictCount: number;
  trendAligned: boolean;
  macroScore: number;
  vectorScore: number;
  liquidityScore: number;
  sessionScore: number;
  positioningConfidence?: "high" | "medium" | "low";
  continuationPriority?: boolean;
}) : ActusAction {
  const clearlyAvoid =
    args.tooLateFlag ||
    args.riskState === "late" ||
    args.state === "failed-breakout" ||
    args.state === "invalidated";

  const unstableAvoid =
    args.riskState === "unstable" &&
    (args.confidence < 64 || args.opportunity < 60 || args.state === "exhaustion");

  const severeConflict =
    args.moduleConflictCount >= 3 ||
    (args.moduleConflictCount >= 2 && args.confidence < 62 && args.opportunity < 58) ||
    (!args.trendAligned && args.confidence < 64 && args.opportunity < 60);

  if (
    clearlyAvoid ||
    unstableAvoid ||
    severeConflict ||
    (args.state === "exhaustion" && args.confidence < 64) ||
    (args.riskState === "crowded" && args.confidence < 58 && args.opportunity < 54)
  ) {
    return "avoid";
  }

  const eliteExecute =
    args.direction !== "neutral" &&
    (args.state === "execute" || args.state === "breakout" || args.state === "continuation") &&
    (args.quality === "A+" || args.quality === "A") &&
    args.riskState === "clean" &&
    args.confidence >= 80 &&
    args.opportunity >= 72 &&
    args.moduleConflictCount === 0 &&
    args.trendAligned &&
    args.macroScore >= 52 &&
    args.vectorScore >= 64 &&
    args.liquidityScore >= 60 &&
    args.sessionScore >= 56 &&
    args.freshnessState !== "aging" &&
    args.freshnessState !== "stale" &&
    args.positioningConfidence !== "low";

  const exceptionalBExecute =
    args.direction !== "neutral" &&
    (args.state === "execute" || args.state === "breakout" || args.state === "continuation") &&
    args.quality === "B" &&
    (args.riskState === "clean" || args.riskState === "crowded") &&
    args.confidence >= 84 &&
    args.opportunity >= 78 &&
    args.moduleConflictCount === 0 &&
    args.trendAligned &&
    args.macroScore >= 58 &&
    args.vectorScore >= 70 &&
    args.liquidityScore >= 66 &&
    args.sessionScore >= 60 &&
    args.freshnessState !== "aging" &&
    args.freshnessState !== "stale" &&
    args.positioningConfidence !== "low";

  const continuationExecute =
    Boolean(args.continuationPriority) &&
    args.direction !== "neutral" &&
    (args.state === "execute" || args.state === "breakout" || args.state === "continuation" || args.state === "building") &&
    (args.quality === "A+" || args.quality === "A" || args.quality === "B") &&
    (args.riskState === "clean" || args.riskState === "crowded") &&
    args.confidence >= 78 &&
    args.opportunity >= 70 &&
    args.moduleConflictCount === 0 &&
    args.trendAligned &&
    args.macroScore >= 50 &&
    args.vectorScore >= 66 &&
    args.liquidityScore >= 60 &&
    args.sessionScore >= 54 &&
    args.freshnessState !== "aging" &&
    args.freshnessState !== "stale" &&
    args.positioningConfidence !== "low";

  const confirmedLiveContinuationExecute =
    args.direction !== "neutral" &&
    args.state === "execute" &&
    args.quality === "B" &&
    (args.riskState === "clean" || args.riskState === "crowded") &&
    args.confidence >= 76 &&
    args.opportunity >= 74 &&
    args.moduleConflictCount <= 1 &&
    args.trendAligned &&
    args.macroScore >= 48 &&
    args.vectorScore >= 66 &&
    args.liquidityScore >= 60 &&
    args.sessionScore >= 50 &&
    args.freshnessState !== "aging" &&
    args.freshnessState !== "stale" &&
    args.positioningConfidence !== "low";

  if (eliteExecute || exceptionalBExecute || continuationExecute || confirmedLiveContinuationExecute) {
    return "execute";
  }

  return "wait";
}

function shouldPreserveQualifiedLiveExecute(args: {
  liveAction?: ActusAction;
  liveState?: ActusState;
  freshnessState?: ActusFreshnessState;
  tooLateFlag?: boolean;
  invalidationWarning?: string | null;
}) {
  if (args.liveAction !== "execute" || args.liveState !== "execute") {
    return false;
  }
  if (args.tooLateFlag || args.invalidationWarning) {
    return false;
  }
  if (args.freshnessState === "stale") {
    return false;
  }
  return true;
}

function actionRank(action: ActusAction) {
  if (action === "execute") return 2;
  if (action === "wait") return 1;
  return 0;
}

function demoteLiveAction(
  liveAction: ActusAction,
  computedAction: ActusAction,
  options?: {
    liveState?: ActusState;
    stateConfidence?: number;
    freshnessState?: ActusFreshnessState;
    trendContinuation?: boolean;
    tooLateFlag?: boolean;
    invalidationWarning?: string | null;
  },
) {
  if (
    liveAction === "execute" &&
    computedAction === "wait" &&
    options?.liveState === "execute" &&
    !options.tooLateFlag &&
    !options.invalidationWarning &&
    options.freshnessState !== "aging" &&
    options.freshnessState !== "stale" &&
    options.stateConfidence !== undefined &&
    (options.stateConfidence >= 80 || (options.stateConfidence >= 90 && options.trendContinuation))
  ) {
    return liveAction;
  }
  return actionRank(computedAction) < actionRank(liveAction) ? computedAction : liveAction;
}

function canRecoverFromLateState(args: {
  computedAction: ActusAction;
  computedState: ActusState;
  adjustedConfidence: number;
  riskState: ActusRiskState;
  tooLateFlag?: boolean;
  invalidationWarning?: string | null;
  direction: ActusDirection;
}) {
  if (args.tooLateFlag || args.invalidationWarning) {
    return false;
  }
  if (args.direction === "neutral") {
    return false;
  }
  if (args.riskState === "late" || args.riskState === "unstable") {
    return false;
  }
  if (args.computedAction === "avoid") {
    return false;
  }
  if (args.computedAction === "execute") {
    return args.adjustedConfidence >= 82;
  }
  return (
    args.adjustedConfidence >= 64 &&
    (args.computedState === "building" || args.computedState === "watching" || args.computedState === "continuation")
  );
}

function recoverLiveAction(
  liveAction: ActusAction,
  computedAction: ActusAction,
  canRecover: boolean,
) {
  if (!canRecover) {
    return liveAction;
  }
  return actionRank(computedAction) > actionRank(liveAction) ? computedAction : liveAction;
}

function demoteLiveState(
  state: ActusState,
  action: ActusAction,
  riskState: ActusRiskState,
  tooLateFlag?: boolean,
  invalidationWarning?: string | null,
): ActusState {
  if (state !== "execute") {
    return state;
  }

  if (action === "execute") {
    return state;
  }

  if (action === "avoid" || tooLateFlag || riskState === "late" || riskState === "unstable" || invalidationWarning) {
    return "exhaustion";
  }

  return "watching";
}

function recoverLiveState(
  state: ActusState,
  computedState: ActusState,
  action: ActusAction,
  canRecover: boolean,
): ActusState {
  if (!canRecover) {
    return state;
  }

  if (action === "execute") {
    return state === "execute" || computedState === "continuation" || computedState === "breakout"
      ? "execute"
      : "building";
  }

  if (computedState === "continuation") {
    return "building";
  }

  if (computedState === "balanced") {
    return "watching";
  }

  return computedState;
}

function actionLabel(action: ActusAction) {
  if (action === "execute") return "Act with discipline";
  if (action === "avoid") return "Stand aside";
  return "Wait for confirmation";
}

function buildLiveSummary(
  action: ActusAction,
  currentState: ActusState,
  displayName: string,
) {
  if (action === "execute") {
    return `${displayName} has moved into an actionable window.`;
  }
  if (currentState === "building" || currentState === "watching") {
    return `${displayName} is active, but still building toward cleaner confirmation.`;
  }
  if (currentState === "exhaustion") {
    return `${displayName} is active, but the move is getting late.`;
  }
  if (currentState === "invalidated") {
    return `${displayName} lost its structure and should not be forced.`;
  }
  if (action === "avoid") {
    return `${displayName} is active, but the current conditions are not worth forcing.`;
  }
  return `${displayName} is interesting, but control is not clean enough to press yet.`;
}

function buildStateAgeLabel(minutes: number) {
  if (minutes <= 0) return "fresh";
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  const remainder = minutes % 60;
  return remainder === 0 ? `${hours}h` : `${hours}h ${remainder}m`;
}

function formatLevel(value: number) {
  return Number.isFinite(value) ? value.toLocaleString(undefined, { maximumFractionDigits: 2 }) : "level";
}

function describeDirection(direction: ActusDirection) {
  if (direction === "long") return "above";
  if (direction === "short") return "below";
  return "through";
}

function displaySessionName(session: NonNullable<ActusNormalizedMarketInput["sessionContext"]>["currentSession"]) {
  if (session === "overnight") return "Asia";
  if (session === "new-york") return "New York";
  if (session === "london") return "London";
  return "Asia";
}

function buildActionLine(
  state: ActusState,
  action: ActusAction,
  direction: ActusDirection,
  entry: number,
) {
  const level = formatLevel(entry);

  if (state === "execute") {
    if (direction === "short") {
      return `Short below ${level} on continuation or break-and-hold.`;
    }
    return `Long above ${level} on continuation or break-and-hold.`;
  }
  if (state === "building") {
    return `Wait for break ${describeDirection(direction)} ${level}.`;
  }
  if (state === "watching") {
    return `Watch only. Needs acceptance ${describeDirection(direction)} ${level}.`;
  }
  if (state === "invalidated") {
    return "Avoid. Structure failed.";
  }
  if (state === "exhaustion" || action === "avoid") {
    return "Stand aside. Move is late or compromised.";
  }
  return "Stand aside. No clean edge.";
}

function buildInvalidationLine(
  direction: ActusDirection,
  invalidation: number,
  input: ActusNormalizedMarketInput,
) {
  const level = formatLevel(invalidation);

  if (direction === "long") {
    if (invalidation === Number(input.sessionLevels.asiaLow.toFixed(2))) {
      return `Invalid below Asia low ${level}.`;
    }
    return `Invalid below ${level}.`;
  }
  if (direction === "short") {
    if (invalidation === Number(input.sessionLevels.asiaHigh.toFixed(2))) {
      return `Invalid above Asia high ${level}.`;
    }
    return `Invalid above ${level}.`;
  }
  return `Invalid through ${level}.`;
}

function buildContextLine(
  input: ActusNormalizedMarketInput,
  price: number,
  tooLateFlag?: boolean,
) {
  const context: string[] = [];
  const session = input.sessionContext;
  if (session) {
    let sessionPart = displaySessionName(session.currentSession);
    if (typeof session.stretchFromBaseline === "number") {
      const stretch = Math.abs(session.stretchFromBaseline);
      if (stretch >= 1.2) {
        sessionPart += ` | ${stretch.toFixed(1)}% stretched`;
      } else if (stretch <= 0.35) {
        sessionPart += " | near baseline";
      }
    }
    context.push(sessionPart);
  }

  const positioning = input.positioningContext;
  if (positioning) {
    const floor = positioning.positioningFloor;
    const ceiling = positioning.positioningCeiling;
    const range = typeof floor === "number" && typeof ceiling === "number" ? Math.abs(ceiling - floor) : null;
    const nearThreshold = range && range > 0 ? range * 0.12 : null;

    if (typeof floor === "number" && nearThreshold !== null && Math.abs(price - floor) <= nearThreshold) {
      context.push(`floor ${formatLevel(floor)}`);
    } else if (typeof ceiling === "number" && nearThreshold !== null && Math.abs(price - ceiling) <= nearThreshold) {
      context.push(`ceiling ${formatLevel(ceiling)}`);
    } else {
      context.push(`positioning ${positioning.confidence}`);
    }
  }

  if (tooLateFlag) {
    context.push("late");
  }

  return context.length ? sanitizeVisibleLanguage(context.join(" | ")) : undefined;
}

function resolveExecuteDirection(
  direction: ActusDirection,
  state: ActusState,
  action: ActusAction,
  input: ActusNormalizedMarketInput,
  hybrid: ReturnType<typeof evaluateHybridState>,
  vectorDirection: ActusDirection,
): ActusDirection {
  if ((state !== "execute" && action !== "execute") || direction !== "neutral") {
    return direction;
  }

  if (hybrid.signal === "long" || hybrid.signal === "short") {
    return hybrid.signal;
  }
  if (vectorDirection === "long" || vectorDirection === "short") {
    return vectorDirection;
  }
  if (input.vector.green && !input.vector.red) {
    return "long";
  }
  if (input.vector.red && !input.vector.green) {
    return "short";
  }
  if (input.structure.closedBackAboveAsiaLow && !input.structure.closedBackBelowAsiaHigh) {
    return "long";
  }
  if (input.structure.closedBackBelowAsiaHigh && !input.structure.closedBackAboveAsiaLow) {
    return "short";
  }
  return input.price.close >= input.structure.ema50 ? "long" : "short";
}

function deriveSetupType(
  input: ActusNormalizedMarketInput,
  state: ActusState,
  regime: ActusRegime,
  direction: ActusDirection,
  action: ActusAction,
): ActusSetupType {
  const sessionStretch = Math.abs(input.sessionContext?.stretchFromBaseline ?? 0);
  const hasCompressionZone = Boolean(input.positioningContext?.compressionZone || input.positioningContext?.pinZone);
  const hasReclaimStructure = input.structure.closedBackAboveAsiaLow || input.structure.closedBackBelowAsiaHigh;
  const directional = direction === "long" || direction === "short";

  if (state === "invalidated" || state === "exhaustion" || regime === "reversal") {
    return "Reversal";
  }
  if (hasReclaimStructure) {
    return "Reclaim";
  }
  if (regime === "compression" || (hasCompressionZone && sessionStretch <= 0.45)) {
    return "Compression";
  }
  if (regime === "expansion" || (directional && sessionStretch >= 1.15 && action !== "wait")) {
    return "Expansion";
  }
  if (state === "execute" && directional && input.structure.distanceFromEmaPct >= 0.45) {
    return "Breakout";
  }
  if (
    directional &&
    (state === "execute" || state === "building" || state === "watching" || state === "continuation")
  ) {
    return "Continuation";
  }
  return "No Setup";
}

export function buildActusOpportunity(
  input: ActusNormalizedMarketInput,
  macro: ActusMacroInput,
): ActusOpportunityOutput {
  const trend = evaluateTrendBias(input);
  const vector = evaluateVectorTriggers(input);
  const liquidity = evaluateLiquiditySweeps(input);
  const session = evaluateSessionLogic(input);
  const macroCheck = evaluateMacroConfirmation(macro, vector.direction);
  const hybrid = evaluateHybridState(toHybridContext(input));

  const quality = hybrid.grade;
  const initialDirection: ActusDirection =
    hybrid.signal === "long" ? "long" : hybrid.signal === "short" ? "short" : vector.direction;
  const regime = mapRegime(hybrid.regime);

  const opportunityScore = clamp(
    Math.round(
      trend.result.score * 0.2 +
        vector.result.score * 0.22 +
        liquidity.result.score * 0.2 +
        session.result.score * 0.18 +
        macroCheck.result.score * 0.2,
    ),
    0,
    100,
  );

  const confidenceScore = clamp(
    Math.round(opportunityScore + (quality === "A+" ? 12 : quality === "A" ? 6 : quality === "B" ? 0 : -10)),
    0,
    100,
  );

  const stateAgeMinutes = input.stateAgeMinutes ?? 0;
  const freshnessLimit = getFreshnessLimit(input.timeframe);
  const freshnessPenalty =
    stateAgeMinutes > freshnessLimit ? Math.min(18, Math.round((stateAgeMinutes - freshnessLimit) / 3)) : 0;
  let adjustedConfidence = clamp(confidenceScore - freshnessPenalty, 0, 100);
  let adjustedOpportunity = clamp(opportunityScore - Math.round(freshnessPenalty * 0.7), 0, 100);
  let adjustedConviction = mapConviction(adjustedConfidence);
  let riskState = mapRiskState(
    input.structure.distanceFromEmaPct,
    quality,
    macroCheck.result.score,
    stateAgeMinutes,
    input.timeframe,
  );
  let action = mapAction(initialDirection, quality, riskState, adjustedConfidence);
  let state = mapState(initialDirection, liquidity.state, session.state);
  let direction = initialDirection;

  const liveWarnings = [input.liveState?.decayWarning, input.liveState?.invalidationWarning, ...(input.positioningContext?.warnings ?? [])].filter(
    Boolean,
  ) as string[];
  const activeInvalidationWarning =
    input.liveState?.currentState === "Invalidated"
      ? input.liveState.invalidationWarning
      : null;

  if (input.liveState) {
    adjustedConfidence = clamp(Math.round(adjustedConfidence * 0.4 + input.liveState.stateConfidence * 0.6), 0, 100);
    adjustedOpportunity = clamp(
      Math.round(adjustedOpportunity * 0.55 + input.liveState.freshnessScore * 0.2 + input.liveState.stateConfidence * 0.25),
      0,
      100,
    );
    adjustedConviction = mapConviction(adjustedConfidence);
    action = input.liveState.action;
    state = mapLiveCurrentState(input.liveState.currentState);

    if (input.liveState.tooLateFlag) {
      riskState = "late";
    } else if (activeInvalidationWarning) {
      riskState = "unstable";
    } else if (input.positioningContext?.confidence === "low" && action !== "execute") {
      riskState = "crowded";
    }
  }

  const computedState = mapState(initialDirection, liquidity.state, session.state);
  const computedAction = mapAction(initialDirection, quality, riskState, adjustedConfidence);
  if (input.liveState) {
    const canRecover = canRecoverFromLateState({
      computedAction,
      computedState,
        adjustedConfidence,
        riskState,
        tooLateFlag: input.liveState.tooLateFlag,
        invalidationWarning: activeInvalidationWarning,
        direction: initialDirection,
      });
    action = recoverLiveAction(action, computedAction, canRecover);
    action = demoteLiveAction(action, computedAction, {
      liveState: mapLiveCurrentState(input.liveState.currentState),
      stateConfidence: input.liveState.stateConfidence,
      freshnessState: input.liveState.freshnessState,
      trendContinuation: Boolean(input.liveState.debug?.rawStateInputs?.trendContinuation),
      tooLateFlag: input.liveState.tooLateFlag,
      invalidationWarning: activeInvalidationWarning,
    });
    state = recoverLiveState(state, computedState, action, canRecover);
    state = demoteLiveState(
      state,
      action,
      riskState,
      input.liveState.tooLateFlag,
      activeInvalidationWarning,
    );
  } else {
    action = computedAction;
  }

  const moduleConflictCount = countModuleConflicts([
    trend.result.score,
    vector.result.score,
    liquidity.result.score,
    session.result.score,
    macroCheck.result.score,
  ]);
  const trendAligned = directionMatchesTrend(initialDirection, trend.bias);
  const continuationRelief = qualifiesForContinuationRelief({
    regime,
    direction: initialDirection,
    trendAligned,
    state,
    adjustedConfidence,
    adjustedOpportunity,
    quality,
    macroScore: macroCheck.result.score,
    sessionScore: session.result.score,
    vectorScore: vector.result.score,
    liquidityScore: liquidity.result.score,
    tooLateFlag: input.liveState?.tooLateFlag,
    freshnessState: input.liveState?.freshnessState,
  });
  const continuationPriority = qualifiesForContinuationPriority({
    regime,
    direction: initialDirection,
    trendAligned,
    state,
    adjustedConfidence,
    adjustedOpportunity,
    quality,
    macroScore: macroCheck.result.score,
    sessionScore: session.result.score,
    vectorScore: vector.result.score,
    liquidityScore: liquidity.result.score,
    tooLateFlag: input.liveState?.tooLateFlag,
    freshnessState: input.liveState?.freshnessState,
    moduleConflictCount,
    positioningConfidence: input.positioningContext?.confidence,
  });
  if (continuationRelief) {
    if (riskState === "late") {
      riskState = "clean";
    } else if (riskState === "crowded" && (quality !== "B" || continuationPriority)) {
      riskState = "clean";
    }
  }
  const tightenedScores = tightenScoresForEliteFiltering({
    adjustedConfidence,
    adjustedOpportunity,
    freshnessState: input.liveState?.freshnessState,
    stateAgeMinutes,
    freshnessLimit,
    riskState,
    positioningConfidence: input.positioningContext?.confidence,
    state,
    moduleConflictCount,
    trendAligned,
    continuationPriority,
  });
  adjustedConfidence = tightenedScores.confidence;
  adjustedOpportunity = tightenedScores.opportunity;
  adjustedConviction = mapConviction(adjustedConfidence);
  action = classifyEliteAction({
    direction,
    quality,
    riskState,
    confidence: adjustedConfidence,
    opportunity: adjustedOpportunity,
    state,
    tooLateFlag: input.liveState?.tooLateFlag,
    freshnessState: input.liveState?.freshnessState,
    moduleConflictCount,
    trendAligned,
    macroScore: macroCheck.result.score,
    vectorScore: vector.result.score,
    liquidityScore: liquidity.result.score,
    sessionScore: session.result.score,
    positioningConfidence: input.positioningContext?.confidence,
    continuationPriority,
  });
  if (
    shouldPreserveQualifiedLiveExecute({
      liveAction: input.liveState?.action,
      liveState: mapLiveCurrentState(input.liveState?.currentState ?? "Waiting"),
      freshnessState: input.liveState?.freshnessState,
      tooLateFlag: input.liveState?.tooLateFlag,
      invalidationWarning: activeInvalidationWarning,
    })
  ) {
    action = "execute";
    state = "execute";
  }
  if (action === "execute" && continuationPriority && state === "building") {
    state = "execute";
  }

  direction = resolveExecuteDirection(direction, state, action, input, hybrid, vector.direction);

  const changePct = Number((((input.price.close - input.price.open) / Math.max(input.price.open, 0.0001)) * 100).toFixed(2));
  const entry = Number(input.price.close.toFixed(2));
  const invalidation =
    direction === "long"
      ? Number(Math.min(input.structure.ema50, input.sessionLevels.asiaLow).toFixed(2))
      : direction === "short"
        ? Number(Math.max(input.structure.ema50, input.sessionLevels.asiaHigh).toFixed(2))
        : Number(input.structure.ema50.toFixed(2));

  const whyItMatters = [
    ...(input.liveState?.reasons?.slice(0, 2) ?? []).map(sanitizeVisibleLanguage),
    ...hybrid.reasons.slice(0, input.liveState?.reasons?.length ? 1 : 2).map(sanitizeVisibleLanguage),
    ...session.result.flags.slice(0, 1).map(sanitizeVisibleLanguage),
    ...(input.sessionContext
      ? [
          `Current session: ${displaySessionName(input.sessionContext.currentSession)}.`,
          input.sessionContext.stretchFromBaseline !== null
            ? `Stretch from baseline: ${input.sessionContext.stretchFromBaseline}%`
            : "",
        ]
      : []),
    ...(input.positioningContext
      ? [
          input.positioningContext.expansionRisk,
          input.positioningContext.dealerPressureShift,
        ]
      : []),
    ...macroCheck.result.flags.slice(0, 1).map(sanitizeVisibleLanguage),
  ].filter(Boolean);

  const setupType = deriveSetupType(input, state, regime, direction, action);
  const actionLine = sanitizeVisibleLanguage(buildActionLine(state, action, direction, entry));
  const invalidationLine = sanitizeVisibleLanguage(buildInvalidationLine(direction, invalidation, input));
  const contextLine = buildContextLine(input, entry, input.liveState?.tooLateFlag);

  return {
    symbol: input.symbol,
    displayName: input.displayName,
    assetClass: input.assetClass,
    timeframe: input.timeframe,
    action,
    direction,
    bias: trend.bias,
    regime,
    location: trend.location,
    state,
    conviction: adjustedConviction,
    triggerQuality: quality,
    setupType,
    riskState,
    opportunityScore: adjustedOpportunity,
    confidenceScore: adjustedConfidence,
    stateAgeMinutes,
    stateAgeLabel: buildStateAgeLabel(stateAgeMinutes),
    freshnessState: input.liveState?.freshnessState,
    freshnessScore: input.liveState?.freshnessScore,
    tooLateFlag: input.liveState?.tooLateFlag,
    price: Number(input.price.close.toFixed(2)),
    changePct,
    entry,
    invalidation,
    whyItMatters,
    summary: input.liveState ? buildLiveSummary(action, state, input.displayName) : action === "execute"
      ? `${input.displayName} is the clearest active opportunity right now.`
      : action === "avoid"
        ? `${input.displayName} is active, but the current conditions are not worth forcing.`
        : `${input.displayName} is interesting, but control is not clean enough to press yet.`,
    actionLabel: actionLabel(action),
    actionLine,
    invalidationLine,
    contextLine,
    macroNote: sanitizeVisibleLanguage(macroCheck.result.summary),
    warnings: liveWarnings,
    debugState: input.liveState?.debug,
    sessionContext: input.sessionContext,
    positioningContext: input.positioningContext,
    telemetry: {
      trend: {
        ...trend.result,
        flags: trend.result.flags.map(sanitizeVisibleLanguage),
        summary: sanitizeVisibleLanguage(trend.result.summary),
      },
      vector: {
        ...vector.result,
        flags: vector.result.flags.map(sanitizeVisibleLanguage),
        summary: sanitizeVisibleLanguage(vector.result.summary),
      },
      liquidity: {
        ...liquidity.result,
        flags: liquidity.result.flags.map(sanitizeVisibleLanguage),
        summary: sanitizeVisibleLanguage(liquidity.result.summary),
      },
      session: {
        ...session.result,
        flags: session.result.flags.map(sanitizeVisibleLanguage),
        summary: sanitizeVisibleLanguage(session.result.summary),
      },
      macro: {
        ...macroCheck.result,
        flags: macroCheck.result.flags.map(sanitizeVisibleLanguage),
        summary: sanitizeVisibleLanguage(macroCheck.result.summary),
      },
    },
    sparkline: input.sparkline,
  };
}
