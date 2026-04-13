import type { ActusDirection, ActusModuleResult, ActusNormalizedMarketInput, ActusState } from "./types";

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

export function evaluateLiquiditySweeps(input: ActusNormalizedMarketInput): {
  state: ActusState;
  direction: ActusDirection;
  result: ActusModuleResult;
} {
  const flags: string[] = [];
  let score = 50;
  let state: ActusState = "balanced";
  let direction: ActusDirection = "neutral";

  if (input.structure.closedBackAboveAsiaLow) {
    score += 20;
    state = "reclaim";
    direction = "long";
    flags.push("An early range sweep has flipped into recovery");
  }

  if (input.structure.closedBackBelowAsiaHigh) {
    score -= 20;
    state = "rejection";
    direction = "short";
    flags.push("An early range sweep has failed and rolled into rejection");
  }

  if (input.price.low <= input.sessionLevels.asiaLow && input.price.close > input.sessionLevels.asiaLow) {
    flags.push("A session sweep is active below the early range");
  }

  if (input.price.high >= input.sessionLevels.asiaHigh && input.price.close < input.sessionLevels.asiaHigh) {
    flags.push("A session sweep is active above the early range");
  }

  const normalized = clamp(score, 0, 100);

  if (state === "balanced" && normalized >= 58) {
    state = "sweep";
    direction = "long";
  }

  if (state === "balanced" && normalized <= 42) {
    state = "sweep";
    direction = "short";
  }

  return {
    state,
    direction,
    result: {
      score: normalized,
      summary:
        direction === "long"
          ? "Sweep behavior supports recovery potential."
          : direction === "short"
            ? "Sweep behavior supports rejection potential."
            : "No meaningful sweep-and-recovery pattern is active.",
      flags,
    },
  };
}
