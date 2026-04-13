import type { HybridContext } from "../../lib/hybridEngine";
import type { ActusNormalizedMarketInput } from "../../domain/market/types";
import { ACTUS_ASSET_CATALOG } from "./catalog";

function round(value: number, digits = 4) {
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}

function buildSparkline(context: HybridContext) {
  if (context.sparkline?.length) {
    return context.sparkline.map((value) => round(value));
  }

  const { open, high, low, close } = context.price;
  const midpoint = (high + low) / 2;

  return [
    round(open),
    round((open + midpoint) / 2),
    round(midpoint),
    round((midpoint + close) / 2),
    round(close),
    round((close + high) / 2),
    round(high),
  ];
}

function sanitizeDebug(debug: HybridContext["stateDebug"]) {
  if (!debug) {
    return undefined;
  }

  return {
    rawStateInputs: debug.rawStateInputs ?? undefined,
    chosenState: debug.chosenState ?? undefined,
    stateConfidence: debug.stateConfidence ?? undefined,
    freshnessState: debug.freshnessState ?? undefined,
    freshnessScore: debug.freshnessScore ?? undefined,
    tooLateFlag: debug.tooLateFlag ?? undefined,
    topReasons: debug.topReasons ?? undefined,
  };
}

export function normalizeHybridContext(context: HybridContext): ActusNormalizedMarketInput {
  const meta = ACTUS_ASSET_CATALOG[context.asset] ?? {
    displayName: context.asset,
    assetClass: "fx" as const,
  };

  const close = context.price.close;
  const ema50 = context.ema50;
  const distanceFromEmaPct = Math.abs(close - ema50) / Math.max(Math.abs(ema50), 0.0001);

  return {
    symbol: context.asset,
    displayName: meta.displayName,
    assetClass: meta.assetClass,
    timeframe: context.timeframe,
    stateAgeMinutes: context.stateAge ?? 0,
    price: context.price,
    sessionLevels: {
      asiaHigh: context.asiaHigh,
      asiaLow: context.asiaLow,
      londonHigh: context.londonHigh,
      londonLow: context.londonLow,
      nyOpenRangeHigh: context.nyOpenRangeHigh,
      nyOpenRangeLow: context.nyOpenRangeLow,
      firstHourHigh: context.firstHourHigh,
      firstHourLow: context.firstHourLow,
    },
    vector: {
      green: context.isGreenVector,
      red: context.isRedVector,
      firstGreenAboveEma: context.isGreenVector && Boolean(context.aboveEma50),
      firstRedBelowEma: context.isRedVector && Boolean(context.belowEma50),
    },
    structure: {
      ema50,
      aboveEma50: Boolean(context.aboveEma50 ?? close > ema50),
      belowEma50: Boolean(context.belowEma50 ?? close < ema50),
      distanceFromEmaPct,
      closedBackAboveAsiaLow: Boolean(context.closedBackAboveAsiaLow),
      closedBackBelowAsiaHigh: Boolean(context.closedBackBelowAsiaHigh),
    },
    sparkline: buildSparkline(context),
    liveState: context.currentState
      ? {
          currentState: context.currentState,
          action:
            context.currentState === "Invalidated"
              ? "avoid"
              : context.currentState === "Execute"
                ? "execute"
                : "wait",
          stateConfidence: context.stateConfidence ?? context.stateDebug?.stateConfidence ?? 0,
          freshnessState: context.freshnessState ?? context.stateDebug?.freshnessState ?? "fresh",
          freshnessScore: context.freshnessScore ?? context.stateDebug?.freshnessScore ?? 0,
          tooLateFlag: context.tooLateFlag ?? context.stateDebug?.tooLateFlag ?? false,
          reasons: context.reasons ?? context.stateDebug?.topReasons ?? [],
          decayWarning: context.decayWarning ?? null,
          invalidationWarning: context.invalidationWarning ?? null,
          debug: sanitizeDebug(context.stateDebug),
        }
      : undefined,
  };
}
