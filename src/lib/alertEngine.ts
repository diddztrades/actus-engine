import type { EngineAlert } from "../types/alerts";
import type { AssetState } from "../types/engine";
import type { MacroSnapshot } from "../types/macro";

export function buildAlerts(assets: AssetState[], macro: MacroSnapshot): EngineAlert[] {
  const alerts: EngineAlert[] = [];

  for (const asset of assets) {
    if (asset.state === "execute" && asset.confidence >= 80) {
      alerts.push({
        id: asset.symbol + "-execute",
        title: "Execute-ready behavior",
        detail: asset.reason,
        level: "high",
        symbol: asset.symbol,
        createdAt: Date.now()
      });
    }

    if (asset.state === "avoid" && asset.riskScore >= 72) {
      alerts.push({
        id: asset.symbol + "-avoid",
        title: "Risk too elevated",
        detail: asset.note,
        level: "medium",
        symbol: asset.symbol,
        createdAt: Date.now()
      });
    }
  }

  if (macro.volatilityRegime === "high") {
    alerts.unshift({
      id: "macro-volatility",
      title: "Macro volatility elevated",
      detail: "Tighter selectivity required across all active opportunities.",
      level: "high",
      createdAt: Date.now()
    });
  }

  return alerts.slice(0, 8);
}