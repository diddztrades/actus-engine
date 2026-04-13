import type { ActusAction, ActusDirection, ActusMacroInput, ActusModuleResult } from "./types";

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

export function evaluateMacroConfirmation(
  macro: ActusMacroInput,
  direction: ActusDirection,
): {
  actionTilt: ActusAction;
  result: ActusModuleResult;
} {
  const flags: string[] = [];
  let score = 50;

  if (macro.riskTone === "risk-on") {
    score += direction === "long" ? 10 : -4;
    flags.push("Macro tone supports selective risk deployment");
  }

  if (macro.riskTone === "risk-off") {
    score += direction === "short" ? 10 : -4;
    flags.push("Macro tone supports defensive positioning");
  }

  if (macro.usdTilt === "supportive" && direction === "short") {
    score += 6;
    flags.push("Dollar tone supports downside pressure in risk assets");
  }

  if (macro.volatility === "elevated") {
    score -= 8;
    flags.push("Elevated volatility reduces execution cleanliness");
  }

  if (macro.breadth === "thin") {
    score -= 6;
    flags.push("Thin breadth raises false-break risk");
  }

  if (macro.headlineRisk === "high") {
    score -= 10;
    flags.push("Headline risk is elevated");
  }

  const normalized = clamp(score, 0, 100);
  const actionTilt: ActusAction =
    normalized >= 62 ? "execute" : normalized <= 40 ? "avoid" : "wait";

  return {
    actionTilt,
    result: {
      score: normalized,
      summary:
        actionTilt === "execute"
          ? "Macro backdrop is supportive."
          : actionTilt === "avoid"
            ? "Macro backdrop is hostile."
            : "Macro backdrop is usable but selective.",
      flags,
    },
  };
}
