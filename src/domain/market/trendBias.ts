import type { ActusBias, ActusLocation, ActusModuleResult, ActusNormalizedMarketInput } from "./types";

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

export function evaluateTrendBias(input: ActusNormalizedMarketInput): {
  bias: ActusBias;
  location: ActusLocation;
  result: ActusModuleResult;
} {
  const { price, structure, sessionLevels } = input;
  const flags: string[] = [];
  let score = 50;

  if (structure.aboveEma50) {
    score += 18;
    flags.push("Bullish control is holding above the market baseline");
  }

  if (structure.belowEma50) {
    score -= 18;
    flags.push("Bearish control is holding below the market baseline");
  }

  if (structure.distanceFromEmaPct <= 0.22) {
    score += 6;
    flags.push("Price is trading near the control level, which improves structure quality");
  }

  if (structure.distanceFromEmaPct >= 0.95) {
    score -= 8;
    flags.push("Price is stretched away from the market baseline");
  }

  if (price.close >= sessionLevels.asiaHigh) {
    score += 5;
    flags.push("Price is pressing into the premium zone");
  }

  if (price.close <= sessionLevels.asiaLow) {
    score -= 5;
    flags.push("Price is pressing into the discount zone");
  }

  const normalized = clamp(score, 0, 100);
  const bias: ActusBias =
    normalized >= 62 ? "bullish" : normalized <= 38 ? "bearish" : normalized >= 46 && normalized <= 54 ? "neutral" : "mixed";

  let location: ActusLocation = "mid-range";

  if (structure.distanceFromEmaPct <= 0.22) {
    location = "near-ema";
  } else if (
    typeof sessionLevels.nyOpenRangeHigh === "number" &&
    typeof sessionLevels.nyOpenRangeLow === "number" &&
    price.close >= sessionLevels.nyOpenRangeLow &&
    price.close <= sessionLevels.nyOpenRangeHigh
  ) {
    location = "opening-range";
  } else if (
    typeof sessionLevels.firstHourHigh === "number" &&
    typeof sessionLevels.firstHourLow === "number" &&
    price.close >= sessionLevels.firstHourLow &&
    price.close <= sessionLevels.firstHourHigh
  ) {
    location = "first-hour";
  } else if (price.close >= sessionLevels.asiaHigh) {
    location = "session-high";
  } else if (price.close <= sessionLevels.asiaLow) {
    location = "session-low";
  } else if (structure.distanceFromEmaPct >= 0.95) {
    location = "extended";
  }

  return {
    bias,
    location,
    result: {
      score: normalized,
      summary:
        bias === "bullish"
          ? "Bullish control remains active."
          : bias === "bearish"
            ? "Bearish control remains active."
            : bias === "mixed"
              ? "Conditions are mixed and control is split."
              : "Conditions are balanced inside a neutral zone.",
      flags,
    },
  };
}
