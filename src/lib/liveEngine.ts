import type { AlertItem, DashboardData, InsightItem, MacroItem } from "../types/decision";
import { buildDerivedState } from "./signalEngine";

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

function evolveSparkline(points: number[]) {
  const last = points[points.length - 1] ?? 30;
  const next = clamp(last + Math.round((Math.random() - 0.5) * 4), 8, 72);
  return [...points, next].slice(-12);
}

function evolveAsset(asset: any) {
  const drift = (Math.random() - 0.5) * 0.18;
  const precision = asset.price < 10 ? 4 : 2;

  return {
    ...asset,
    price: Number((asset.price * (1 + drift / 100)).toFixed(precision)),
    changePct: Number((asset.changePct + drift * 0.22).toFixed(2)),
    minutesInState: asset.minutesInState + 1,
    sparkline: evolveSparkline(asset.sparkline)
  };
}

function buildMacro(assets: any[], cqValue: number | null): MacroItem[] {
  const execute = assets.filter((x) => x.state === "execute").length;
  const avoid = assets.filter((x) => x.state === "avoid").length;

  return [
    { label: "RISK", value: execute >= avoid ? "ON" : "OFF" },
    { label: "USD", value: assets.find((x) => x.symbol === "EURUSD")?.changePct < 0 ? "↑" : "→" },
    { label: "ENERGY", value: assets.find((x) => x.symbol === "CL")?.changePct > 0 ? "↑" : "→" },
    { label: "EQUITIES", value: assets.find((x) => x.symbol === "NQ")?.state === "avoid" ? "CAUTIOUS" : "STABLE" },
    { label: "CRYPTO", value: cqValue != null ? (cqValue >= 0 ? "FLOW+" : "FLOW-") : "MIXED" }
  ];
}

function buildAlerts(previous: any[], current: any[]): AlertItem[] {
  const alerts: AlertItem[] = [];

  current.forEach((asset) => {
    const before = previous.find((x) => x.symbol === asset.symbol);
    if (!before) return;

    if (before.state !== asset.state) {
      alerts.push({
        title: "STATE CHANGE",
        asset: asset.name.toUpperCase(),
        state: asset.state,
        secondsAgo: 8,
        detail:
          asset.state === "execute"
            ? "Conditions improved enough to enter the active queue."
            : asset.state === "avoid"
            ? "Risk filter triggered as structure weakened."
            : "Conditions softened back into observation."
      });
    }
  });

  return alerts.slice(0, 3);
}

function buildInsights(assets: any[]): InsightItem[] {
  const execute = assets.filter((x) => x.state === "execute").length;
  const avgConfidence = Math.round(assets.reduce((sum, item) => sum + item.confidence, 0) / assets.length);

  return [
    {
      label: "Momentum",
      detail: execute >= 2 ? "Directional quality is clean." : "Momentum is selective and needs patience."
    },
    {
      label: "Structure",
      detail: avgConfidence >= 65 ? "Broad structure is holding well." : "Mixed structure. Selectivity matters."
    },
    {
      label: "Volatility",
      detail: "No disorderly expansion detected."
    }
  ];
}

export function applyLiveLayer(current: DashboardData, marketPayload: any, winRate: number) {
  const previousAssets = current.assets;

  const evolved = previousAssets.map((asset) => {
    let next = evolveAsset(asset);

    const live = marketPayload?.quotes?.[asset.symbol];

    if (live?.price) {
      next = {
        ...next,
        price: Number(live.price.toFixed(asset.price < 10 ? 4 : 2)),
        changePct: typeof live.changePct === "number" ? Number(live.changePct.toFixed(2)) : next.changePct
      };
    }

    return next;
  });

  const derived = buildDerivedState(evolved, current.heroDecision, winRate);

  return {
    ...current,
    updatedAt: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" }),
    assets: derived.assets,
    heroDecision: derived.hero,
    macro: buildMacro(derived.assets, marketPayload?.cryptoQuant?.value ?? null),
    alerts: buildAlerts(previousAssets, derived.assets),
    insights: buildInsights(derived.assets),
    ranked: derived.ranked
  };
}
