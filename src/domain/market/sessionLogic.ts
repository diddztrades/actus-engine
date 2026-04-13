import type { ActusDirection, ActusModuleResult, ActusNormalizedMarketInput, ActusState } from "./types";

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

export function evaluateSessionLogic(input: ActusNormalizedMarketInput): {
  state: ActusState;
  direction: ActusDirection;
  result: ActusModuleResult;
} {
  const flags: string[] = [];
  let score = 50;
  let state: ActusState = "balanced";
  let direction: ActusDirection = "neutral";

  const { price, sessionLevels } = input;

  if (typeof sessionLevels.nyOpenRangeHigh === "number" && price.close > sessionLevels.nyOpenRangeHigh) {
    score += 16;
    state = "breakout";
    direction = "long";
    flags.push("Price is entering an upside expansion phase");
  }

  if (typeof sessionLevels.nyOpenRangeLow === "number" && price.close < sessionLevels.nyOpenRangeLow) {
    score -= 16;
    state = "breakout";
    direction = "short";
    flags.push("Price is entering a downside expansion phase");
  }

  if (typeof sessionLevels.firstHourHigh === "number" && price.close > sessionLevels.firstHourHigh) {
    score += 12;
    state = "continuation";
    direction = "long";
    flags.push("Directional control is building beyond the opening structure");
  }

  if (typeof sessionLevels.firstHourLow === "number" && price.close < sessionLevels.firstHourLow) {
    score -= 12;
    state = "continuation";
    direction = "short";
    flags.push("Directional control is failing through the opening structure");
  }

  if (
    typeof sessionLevels.nyOpenRangeHigh === "number" &&
    price.high >= sessionLevels.nyOpenRangeHigh &&
    price.close < sessionLevels.nyOpenRangeHigh
  ) {
    state = "failed-breakout";
    direction = "short";
    flags.push("An upside expansion attempt failed to hold");
  }

  if (
    typeof sessionLevels.nyOpenRangeLow === "number" &&
    price.low <= sessionLevels.nyOpenRangeLow &&
    price.close > sessionLevels.nyOpenRangeLow
  ) {
    state = "failed-breakout";
    direction = "long";
    flags.push("A downside expansion attempt failed to hold");
  }

  const normalized = clamp(score, 0, 100);

  return {
    state,
    direction,
    result: {
      score: normalized,
      summary:
        direction === "long"
          ? "Session location supports upside continuation."
          : direction === "short"
            ? "Session location supports downside continuation."
            : "Session structure is not clean enough yet.",
      flags,
    },
  };
}
