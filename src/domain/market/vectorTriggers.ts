import type { ActusDirection, ActusModuleResult, ActusNormalizedMarketInput } from "./types";

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

export function evaluateVectorTriggers(input: ActusNormalizedMarketInput): {
  direction: ActusDirection;
  result: ActusModuleResult;
} {
  const flags: string[] = [];
  let score = 50;

  if (input.vector.firstGreenAboveEma) {
    score += 24;
    flags.push("A fresh bullish momentum event is aligned with control");
  }

  if (input.vector.firstRedBelowEma) {
    score -= 24;
    flags.push("A fresh bearish momentum event is aligned with control");
  }

  if (input.vector.green && input.structure.aboveEma50) {
    score += 12;
    flags.push("Upside activity is supporting directional control");
  }

  if (input.vector.red && input.structure.belowEma50) {
    score -= 12;
    flags.push("Downside activity is supporting directional control");
  }

  if (input.vector.green && input.vector.red) {
    flags.push("Mixed activity is reducing clarity");
  }

  const normalized = clamp(score, 0, 100);
  const direction: ActusDirection = normalized >= 60 ? "long" : normalized <= 40 ? "short" : "neutral";

  return {
    direction,
    result: {
      score: normalized,
      summary:
        direction === "long"
          ? "Momentum is supporting upside expansion."
          : direction === "short"
            ? "Momentum is supporting downside expansion."
            : "Activity is not decisive enough yet.",
      flags,
    },
  };
}
