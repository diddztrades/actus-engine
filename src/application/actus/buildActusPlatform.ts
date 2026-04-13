import type { MacroSnapshot } from "../../types/macro";
import { rankActusOpportunities } from "../../domain/market/ranking";
import { buildActusOpportunity } from "../../domain/market/signalGrading";
import type {
  ActusAlert,
  ActusMacroInput,
  ActusNormalizedMarketInput,
  ActusOpportunityOutput,
  ActusPlatformSnapshot,
  ActusSystemStatus,
} from "../../domain/market/types";

function formatRelativeTime(timestamp: number | null) {
  if (!timestamp) return "waiting";
  const diffMs = Date.now() - timestamp;
  const mins = Math.max(0, Math.round(diffMs / 60000));
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.round(mins / 60);
  return `${hours}h ago`;
}

function deriveMacro(inputs: ActusNormalizedMarketInput[], macroSnapshot?: Partial<MacroSnapshot>): ActusMacroInput {
  if (macroSnapshot) {
    return {
      session:
        macroSnapshot.session?.toLowerCase().includes("asia")
          ? "asia"
          : macroSnapshot.session?.toLowerCase().includes("new")
            ? "new-york"
            : macroSnapshot.session?.toLowerCase().includes("overnight")
              ? "overnight"
              : "london",
      riskTone:
        macroSnapshot.equityTone === "risk-on" || macroSnapshot.cryptoTone === "risk-on"
          ? "risk-on"
          : macroSnapshot.equityTone === "risk-off" || macroSnapshot.cryptoTone === "risk-off"
            ? "risk-off"
            : "mixed",
      usdTilt:
        macroSnapshot.usdBias === "bullish"
          ? "supportive"
          : macroSnapshot.usdBias === "bearish"
            ? "headwind"
            : "neutral",
      volatility:
        macroSnapshot.eventRisk?.impact === "high"
          ? "elevated"
          : macroSnapshot.volatilityRegime === "high"
          ? "elevated"
          : macroSnapshot.volatilityRegime === "normal"
            ? "active"
            : "contained",
      breadth:
        macroSnapshot.equityTone !== "mixed" && macroSnapshot.cryptoTone !== "mixed"
          ? "broad"
          : "selective",
      headlineRisk: macroSnapshot.eventRisk?.impact === "high" || macroSnapshot.volatilityRegime === "high" ? "high" : "medium",
    };
  }

  const aboveEma = inputs.filter((item) => item.structure.aboveEma50).length;
  const belowEma = inputs.filter((item) => item.structure.belowEma50).length;
  const cryptoStrength = inputs.filter((item) => item.assetClass === "crypto" && item.structure.aboveEma50).length;
  const stretched = inputs.filter((item) => item.structure.distanceFromEmaPct >= 0.95).length;
  const sweeping = inputs.filter((item) => item.structure.closedBackAboveAsiaLow || item.structure.closedBackBelowAsiaHigh).length;

  return {
    session: "london",
    riskTone: cryptoStrength >= 2 && aboveEma >= belowEma ? "risk-on" : belowEma > aboveEma ? "risk-off" : "mixed",
    usdTilt: belowEma > aboveEma ? "supportive" : aboveEma > belowEma ? "headwind" : "neutral",
    volatility: stretched >= 2 ? "elevated" : sweeping >= 2 ? "active" : "contained",
    breadth: Math.abs(aboveEma - belowEma) >= 3 ? "broad" : sweeping >= 2 ? "selective" : "thin",
    headlineRisk: stretched >= 3 ? "high" : stretched >= 1 ? "medium" : "low",
  };
}

function buildAlerts(opportunities: ActusOpportunityOutput[]): ActusAlert[] {
  return opportunities
    .filter((item) => item.action !== "wait" || item.triggerQuality !== "none")
    .slice(0, 4)
    .map((item, index) => ({
      id: `${item.symbol}-${item.state}-${index}`,
      severity: item.action === "execute" ? "high" : item.action === "avoid" ? "medium" : "low",
      title:
        item.action === "execute"
          ? "Expansion Alert"
          : item.action === "avoid"
            ? "Risk State Elevated"
            : "Momentum Shift Building",
      asset: item.symbol,
      body: item.whyItMatters[0] ?? item.summary,
      ageLabel: `${2 + index * 3}m ago`,
    }));
}

function buildWhatMattersNow(
  hero: ActusOpportunityOutput | null,
  opportunities: ActusOpportunityOutput[],
  macroSummary: string,
  primaryRead?: string,
  eventWarning?: string,
) {
  if (!hero) {
    return [
      "No asset currently has enough alignment to justify action.",
      "Wait for cleaner session structure, a clearer momentum shift, or recovery behavior.",
      ...(eventWarning ? [eventWarning] : []),
      primaryRead ?? macroSummary,
    ].slice(0, 4);
  }

  const waitCount = opportunities.filter((item) => item.action === "wait").length;

  return [
    `${hero.displayName} is the clearest opportunity on the board right now.`,
    `${hero.direction === "long" ? "Upside" : hero.direction === "short" ? "Downside" : "Two-way"} pressure matters most on ${hero.symbol}.`,
    `${waitCount} other markets are building but still need confirmation.`,
    ...(eventWarning ? [eventWarning] : []),
    primaryRead ?? macroSummary,
  ].slice(0, 4);
}

export function buildActusPlatformSnapshot(args: {
  inputs: ActusNormalizedMarketInput[];
  status: ActusSystemStatus;
  macroSnapshot?: Partial<MacroSnapshot>;
  systemSource?: "supabase" | "local";
  systemConnection?: "online" | "offline";
}): ActusPlatformSnapshot {
  const { inputs, status, macroSnapshot, systemSource, systemConnection } = args;

  if (!inputs.length) {
    return {
      status: {
        ...status,
        health: "empty",
        message: "No market inputs are available yet.",
      },
      macro: {
        session: "london",
        riskTone: "mixed",
        usdTilt: "neutral",
        volatility: "contained",
        breadth: "thin",
        headlineRisk: "low",
        command: "No market data available",
        summary: "The decision engine is waiting for usable market inputs.",
      },
      hero: null,
      whatMattersNow: [
        "No market data is available yet.",
        "The system cannot rank opportunities until normalized inputs arrive.",
      ],
      opportunities: [],
      ranked: [],
      alerts: [],
      counts: { execute: 0, wait: 0, avoid: 0 },
    };
  }

  const macro = deriveMacro(inputs, macroSnapshot);
  const opportunities = inputs.map((input) => buildActusOpportunity(input, macro));
  const ranked = rankActusOpportunities(opportunities);
  const hero =
    opportunities.slice().sort((a, b) => b.opportunityScore - a.opportunityScore || b.confidenceScore - a.confidenceScore)[0] ??
    null;

  const fallbackMacroSummary =
    macro.riskTone === "risk-on"
      ? "Macro tone supports selective upside participation in the strongest names."
      : macro.riskTone === "risk-off"
        ? "Macro tone favors defense and cleaner downside setups."
        : "Macro tone is mixed, so selectivity matters more than frequency.";

  const macroSummary = macroSnapshot?.summary ?? fallbackMacroSummary;
  const eventWarning = macroSnapshot?.eventRisk?.warning;
  const macroCommand =
    eventWarning ??
    macroSnapshot?.primaryRead ??
    (macro.riskTone === "risk-on"
      ? "Press strength selectively"
      : macro.riskTone === "risk-off"
        ? "Respect defensive tone"
        : "Stay selective");
  const combinedMacroSummary = eventWarning ? `${eventWarning} ${macroSummary}` : macroSummary;

  const systemSuffix =
    systemSource && systemConnection
      ? ` Macro source: ${systemSource === "supabase" && systemConnection === "online" ? "Supabase live" : "local fallback"}.`
      : "";

  return {
    status: {
      ...status,
      lastUpdatedLabel: formatRelativeTime(status.lastUpdatedAt),
      message: `${status.message}${systemSuffix}`.trim(),
    },
    macro: {
      ...macro,
      command: macroCommand,
      summary: combinedMacroSummary,
    },
    hero,
    whatMattersNow: buildWhatMattersNow(hero, opportunities, combinedMacroSummary, macroSnapshot?.primaryRead, eventWarning),
    opportunities,
    ranked,
    alerts: buildAlerts(opportunities),
    counts: {
      execute: opportunities.filter((item) => item.action === "execute").length,
      wait: opportunities.filter((item) => item.action === "wait").length,
      avoid: opportunities.filter((item) => item.action === "avoid").length,
    },
  };
}
