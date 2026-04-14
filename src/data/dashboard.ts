import type { DashboardData } from "../types/decision";

export const dashboardData: DashboardData = {
  updatedAt: "10:24:31",
  heroDecision: {
    headline: "YOU HAVE 1 ACTIVE OPPORTUNITY",
    asset: "GOLD",
    action: "buy",
    confidence: 82,
    minutesInState: 6,
    reason: "Momentum + Macro alignment",
    signalAge: "active",
    entry: 2368.5,
    invalidation: 2352.1,
    price: 2372.39,
    changePct: 0.22,
    chart: [42, 45, 44, 46, 49, 48, 51, 54, 52, 53, 55, 58, 57, 60, 63, 65, 64, 67],
    winRate: 0
  },
  assets: [
    {
      symbol: "XAUUSD",
      name: "Gold",
      price: 2372.39,
      changePct: 0.22,
      state: "execute",
      action: "buy",
      confidence: 82,
      minutesInState: 6,
      sparkline: [42, 43, 46, 45, 48, 50, 49, 52, 54, 53, 55, 58]
    },
    {
      symbol: "EURUSD",
      name: "Euro",
      price: 1.08,
      changePct: 0.23,
      state: "execute",
      action: "buy",
      confidence: 61,
      minutesInState: 2,
      sparkline: [31, 33, 32, 35, 34, 36, 38, 37, 39, 41, 40, 43]
    },
    {
      symbol: "NQ",
      name: "Nasdaq",
      price: 17832.59,
      changePct: -0.29,
      state: "wait",
      action: "neutral",
      confidence: 69,
      minutesInState: 12,
      sparkline: [62, 61, 60, 61, 62, 63, 62, 61, 62, 63, 64, 64]
    },
    {
      symbol: "BTCUSD",
      name: "Bitcoin",
      price: 77427.61,
      changePct: 1.12,
      state: "wait",
      action: "neutral",
      confidence: 61,
      minutesInState: 11,
      sparkline: [40, 41, 42, 43, 45, 44, 46, 45, 47, 48, 47, 49]
    },
    {
      symbol: "CL",
      name: "Crude Oil",
      price: 85.59,
      changePct: 1.18,
      state: "wait",
      action: "neutral",
      confidence: 71,
      minutesInState: 26,
      sparkline: [25, 24, 26, 27, 28, 27, 29, 30, 31, 32, 33, 35]
    },
    {
      symbol: "ETHUSD",
      name: "Ethereum",
      price: 3790.59,
      changePct: 0.28,
      state: "wait",
      action: "neutral",
      confidence: 64,
      minutesInState: 5,
      sparkline: [38, 39, 39, 40, 41, 40, 42, 43, 44, 44, 45, 46]
    },
    {
      symbol: "SOLUSD",
      name: "Solana",
      price: 174.27,
      changePct: -0.89,
      state: "avoid",
      action: "sell",
      confidence: 80,
      minutesInState: 9,
      sparkline: [54, 53, 52, 51, 51, 50, 49, 48, 48, 47, 46, 45]
    }
  ],
  macro: [
    { label: "RISK", value: "ON" },
    { label: "USD", value: "↑" },
    { label: "ENERGY", value: "↑" },
    { label: "EQUITIES", value: "CAUTIOUS" },
    { label: "CRYPTO", value: "RISK-ON" }
  ],
  alerts: [
    {
      title: "NEW DECISION",
      asset: "SOLANA",
      state: "avoid",
      secondsAgo: 12,
      detail: "Breakdown active below key structure."
    },
    {
      title: "STATE CHANGE",
      asset: "EURUSD",
      state: "execute",
      secondsAgo: 104,
      detail: "Fresh alignment across momentum and flows."
    },
    {
      title: "STATE CHANGE",
      asset: "BTC",
      state: "wait",
      secondsAgo: 380,
      detail: "Strength intact but immediate edge cooling."
    }
  ],
  insights: [
    { label: "Momentum", detail: "Directional quality is clean." },
    { label: "Liquidity", detail: "Conditions supportive across majors." },
    { label: "Volatility", detail: "No disorderly expansion detected." }
  ],
  ranked: [
    { label: "GOLD", state: "execute", score: 73 },
    { label: "USD", state: "execute", score: 61 },
    { label: "ETHUSD", state: "wait", score: 64 },
    { label: "BTCUSD", state: "wait", score: 60 },
    { label: "SOLUSD", state: "avoid", score: 56 }
  ]
};
