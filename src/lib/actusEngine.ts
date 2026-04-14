import type { AssetState } from "../types/engine";
import type { MacroSnapshot } from "../types/macro";

const BASE_TIME = Date.now();

export function buildInitialAssets(): AssetState[] {
  return [
    {
      symbol: "EURUSD",
      name: "Euro",
      price: 1.0832,
      changePct: 0.21,
      bias: "bullish",
      state: "wait",
      confidence: 71,
      riskScore: 42,
      momentumScore: 64,
      session: "London",
      timeframe: "5m",
      reason: "Holding structure with moderate continuation pressure.",
      note: "Watch for cleaner alignment before escalation.",
      updatedAt: BASE_TIME,
      stateEnteredAt: BASE_TIME - 63 * 60 * 1000
    },
    {
      symbol: "XAUUSD",
      name: "Gold",
      price: 2338.5,
      changePct: 0.46,
      bias: "bullish",
      state: "execute",
      confidence: 82,
      riskScore: 37,
      momentumScore: 79,
      session: "London",
      timeframe: "5m",
      reason: "Momentum remains supported by defensive allocation.",
      note: "Currently strongest clean trend behavior.",
      updatedAt: BASE_TIME,
      stateEnteredAt: BASE_TIME - 10 * 1000
    },
    {
      symbol: "NQ",
      name: "Nasdaq",
      price: 18242.25,
      changePct: -0.38,
      bias: "bearish",
      state: "wait",
      confidence: 67,
      riskScore: 58,
      momentumScore: 55,
      session: "Pre-New York",
      timeframe: "1m",
      reason: "Volatility expanding but direction still vulnerable to reversal.",
      note: "Prefer patience until decisive break develops.",
      updatedAt: BASE_TIME,
      stateEnteredAt: BASE_TIME - 72 * 60 * 1000
    },
    {
      symbol: "BTCUSD",
      name: "Bitcoin",
      price: 70322,
      changePct: 1.24,
      bias: "bullish",
      state: "execute",
      confidence: 78,
      riskScore: 51,
      momentumScore: 81,
      session: "24H",
      timeframe: "15m",
      reason: "Risk appetite improving and expansion remains intact.",
      note: "Strong continuation profile while held above intraday support.",
      updatedAt: BASE_TIME,
      stateEnteredAt: BASE_TIME - 14 * 60 * 1000
    },
    {
      symbol: "ETHUSD",
      name: "Ethereum",
      price: 3542.4,
      changePct: 0.93,
      bias: "bullish",
      state: "wait",
      confidence: 73,
      riskScore: 49,
      momentumScore: 70,
      session: "24H",
      timeframe: "15m",
      reason: "Constructive but still lagging the strongest leaders.",
      note: "Better if follow-through improves.",
      updatedAt: BASE_TIME,
      stateEnteredAt: BASE_TIME - 24 * 60 * 1000
    },
    {
      symbol: "SOLUSD",
      name: "Solana",
      price: 188.15,
      changePct: -1.12,
      bias: "bearish",
      state: "avoid",
      confidence: 61,
      riskScore: 74,
      momentumScore: 43,
      session: "24H",
      timeframe: "15m",
      reason: "Unstable structure and weaker relative behavior.",
      note: "Avoid until pressure stabilizes.",
      updatedAt: BASE_TIME,
      stateEnteredAt: BASE_TIME - 59 * 60 * 1000
    },
    {
      symbol: "CL",
      name: "Crude Oil",
      price: 81.18,
      changePct: 0.71,
      bias: "bullish",
      state: "execute",
      confidence: 80,
      riskScore: 46,
      momentumScore: 77,
      session: "London",
      timeframe: "5m",
      reason: "Energy pressure remains supportive and trend quality is strong.",
      note: "Strong candidate while impulse remains intact.",
      updatedAt: BASE_TIME,
      stateEnteredAt: BASE_TIME - 10 * 1000
    }
  ];
}

export function hydrateInitialLiveState(assets: AssetState[]) {
  return assets.map((asset) => ({
    ...asset,
    updatedAt: Date.now()
  }));
}

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

export function runEngineCycle(current: AssetState[], macro: MacroSnapshot): AssetState[] {
  return current.map((asset) => {
    const drift = (Math.random() - 0.5) * 0.8;
    const nextChangePct = Number((asset.changePct + drift * 0.18).toFixed(2));
    const nextPrice = Number((asset.price * (1 + nextChangePct / 1000)).toFixed(2));
    const momentumShift = Math.round((Math.random() - 0.5) * 6);
    const riskShift = Math.round((Math.random() - 0.5) * 4);

    const momentumScore = clamp(asset.momentumScore + momentumShift, 20, 95);
    const riskScore = clamp(asset.riskScore + riskShift, 20, 95);
    const confidence = clamp(Math.round((momentumScore * 0.6) + ((100 - riskScore) * 0.4)), 25, 95);

    let state = asset.state;
    if (confidence >= 76 && riskScore <= 58) state = "execute";
    else if (riskScore >= 70 || confidence <= 58) state = "avoid";
    else state = "wait";

    if (macro.volatilityRegime === "high" && state === "execute" && riskScore > 52) {
      state = "wait";
    }

    const bias =
      nextChangePct > 0.18 ? "bullish" :
      nextChangePct < -0.18 ? "bearish" :
      "neutral";

    const stateEnteredAt = state === asset.state ? asset.stateEnteredAt : Date.now();

    return {
      ...asset,
      price: nextPrice,
      changePct: nextChangePct,
      momentumScore,
      riskScore,
      confidence,
      bias,
      state,
      updatedAt: Date.now(),
      stateEnteredAt
    };
  });
}

export function getUpdateInterval(mode: "live" | "sim") {
  return mode === "live" ? 4000 : 1200;
}