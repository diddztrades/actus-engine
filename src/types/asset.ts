export type Bias = "Bullish" | "Bearish" | "Neutral";

export type Regime =
  | "Expansion"
  | "Compression"
  | "Mean Reversion"
  | "Trend Continuation"
  | "Disorder";

export interface Asset {
  symbol: string;
  name: string;
  bias: Bias;
  regime: Regime;
  speed: number;
  setup: number;
  risk: string;
  location: string;
  posture: string;
  note: string;
  direction?: "up" | "down" | "flat";
  grade?: "A+" | "A" | "B" | "none";
}