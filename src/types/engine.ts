export type ThemeMode = "dark" | "light";
export type ViewMode = "dashboard" | "replay";
export type SignalState = "execute" | "wait" | "avoid";
export type FocusMode = "all" | "execute" | "active";
export type MarketBias = "bullish" | "bearish" | "neutral";
export type TimeFrame = "1m" | "5m" | "15m" | "1h";

export type AssetState = {
  symbol: string;
  name: string;
  price: number;
  changePct: number;
  bias: MarketBias;
  state: SignalState;
  confidence: number;
  riskScore: number;
  momentumScore: number;
  session: string;
  timeframe: TimeFrame;
  reason: string;
  note: string;
  updatedAt: number;
  stateEnteredAt: number;
};
