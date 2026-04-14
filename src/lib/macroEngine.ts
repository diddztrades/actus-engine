import type { MacroSnapshot } from "../types/macro";

export function normalizeMacroSnapshot(input?: Partial<MacroSnapshot>): MacroSnapshot {
  return {
    session: input?.session ?? "London",
    primaryRead: input?.primaryRead ?? "Selective risk deployment with stronger focus on clean momentum leaders.",
    summary: input?.summary ?? "Macro backdrop is stable enough for movement, but not broad enough for indiscriminate participation.",
    sessionSummary: input?.sessionSummary ?? "Expect rotation, fake-outs, and cleaner continuation only in the strongest names.",
    disciplineTitle: input?.disciplineTitle ?? "Fewer trades, cleaner execution",
    disciplineText: input?.disciplineText ?? "Protect quality. Let weaker structures fail without participation.",
    volatilityRegime: input?.volatilityRegime ?? "normal",
    usdBias: input?.usdBias ?? "neutral",
    energyPressure: input?.energyPressure ?? "normal",
    equityTone: input?.equityTone ?? "mixed",
    cryptoTone: input?.cryptoTone ?? "risk-on"
  };
}