import type { AlertItem } from "../types/alert";
import type { Asset } from "../types/asset";
import { getHybridFeedStatus, getLiveHybridContexts } from "./hybridDataFeed";
import { evaluateHybridState } from "./hybridEngine";

type AlertSeverity = "high" | "medium" | "low";

function gradeToSetup(grade: string) {
  if (grade === "A+") return 93;
  if (grade === "A") return 82;
  if (grade === "B") return 68;
  return 52;
}

function riskFromGrade(grade: string) {
  if (grade === "A+") return "Low";
  if (grade === "A") return "Moderate";
  if (grade === "B") return "Elevated";
  return "High";
}

function directionFromScore(prev: number, next: number): "up" | "down" | "flat" {
  if (next > prev + 4) return "up";
  if (next < prev - 4) return "down";
  return "flat";
}

function buildSeverity(grade: string): AlertSeverity {
  if (grade === "A+" || grade === "A") return "high";
  if (grade === "B") return "medium";
  return "low";
}

function displayName(symbol: string) {
  switch (symbol) {
    case "NQ":
      return "Nasdaq";
    case "BTC":
      return "Bitcoin";
    case "XAU":
      return "Gold";
    case "EURUSD":
      return "Euro";
    case "SOL":
      return "Solana";
    case "OIL":
      return "Crude Oil";
    default:
      return symbol;
  }
}

function mapConviction(grade: string) {
  if (grade === "A+") return "Prime";
  if (grade === "A") return "Strong";
  if (grade === "B") return "Developing";
  return "Unconfirmed";
}

function mapState(regime: string) {
  if (regime === "Trend Continuation") return "Continuation";
  if (regime === "Expansion") return "Expansion";
  if (regime === "Compression") return "Compression";
  if (regime === "Mean Reversion") return "Reversal Risk";
  return "Disorder";
}

function mapAction(posture: string, grade: string) {
  const value = posture.toLowerCase();

  if (value.includes("attack")) return "Engage on pullbacks";
  if (value.includes("buy")) return "Lean with strength";
  if (value.includes("sell")) return "Lean with weakness";
  if (value.includes("probe")) return "Probe only on confirmation";
  if (value.includes("wait")) return "Wait for confirmation";
  if (value.includes("avoid")) return "Avoid aggressive entries";

  if (grade === "A+" || grade === "A") return "Engage selectively";
  if (grade === "B") return "Wait for confirmation";
  return "Stand aside";
}

function mapPublicLocation(location: string) {
  const value = location.toLowerCase();

  if (value.includes("asia")) return "Session level interaction";
  if (value.includes("above 50")) return "Structure regained";
  if (value.includes("below 50")) return "Structure weakened";
  if (value.includes("break")) return "Breakout area";
  return "Key level in play";
}

function buildAssetFromContext(ctx: ReturnType<typeof getLiveHybridContexts>[number]): Asset {
  const signal = evaluateHybridState(ctx);
  const setup = gradeToSetup(signal.grade);
  const speed = Math.min(94, 46 + setup * 0.5);

  const conviction = mapConviction(signal.grade);
  const state = mapState(signal.regime);
  const action = mapAction(signal.posture, signal.grade);

  return {
    symbol: ctx.asset,
    name: displayName(ctx.asset),
    bias:
      signal.signal === "long"
        ? "Bullish"
        : signal.signal === "short"
          ? "Bearish"
          : "Neutral",
    regime: signal.regime as Asset["regime"],
    speed,
    setup,
    risk: riskFromGrade(signal.grade),
    location: mapPublicLocation(signal.location),
    posture: action,
    note: `${conviction} conviction / ${state} conditions`,
    direction: directionFromScore(50, setup),
    grade: signal.grade,
  };
}

function buildAlertFromContext(
  ctx: ReturnType<typeof getLiveHybridContexts>[number],
  index: number,
): AlertItem {
  const signal = evaluateHybridState(ctx);
  const state = mapState(signal.regime);

  return {
    time: `09:${String(12 + index * 4).padStart(2, "0")}`,
    asset: ctx.asset,
    title: signal.signal === "none" ? "No actionable condition" : `${state} condition building`,
    body:
      signal.signal === "none"
        ? "Conditions are not aligned yet. Stand by."
        : signal.grade === "A+" || signal.grade === "A"
          ? "Conditions are aligned. Execution quality is elevated."
          : "Conditions are aligning. Wait for confirmation before committing.",
    severity: buildSeverity(signal.grade),
  };
}

export function buildHybridAssets(): Asset[] {
  const contexts = getLiveHybridContexts("5m");
  return contexts.map(buildAssetFromContext);
}

export function buildHybridAlerts(): AlertItem[] {
  const contexts = getLiveHybridContexts("5m");

  return contexts
    .map((ctx, index) => buildAlertFromContext(ctx, index))
    .filter((alert) => alert.severity !== "low");
}

export function getHybridMapperStatus() {
  const feed = getHybridFeedStatus("5m");

  return {
    feedMode: feed.mode,
    feedSource: feed.source,
    feedHealthy: feed.healthy,
    feedLastUpdated: feed.lastUpdated,
    feedError: feed.error,
  };
}
