export type DecisionState = "execute" | "wait" | "avoid";
export type TradeAction = "buy" | "sell" | "neutral";
export type SignalAge = "just_entered" | "active" | "mature" | "expiring";

export type DecisionCard = {
  symbol: string;
  name: string;
  note: string;
  durationLabel: string;
};

export type DecisionColumn = {
  title: "EXECUTE" | "WAIT" | "AVOID";
  items: DecisionCard[];
};

export type DecisionBoardState = {
  execute: DecisionColumn;
  wait: DecisionColumn;
  avoid: DecisionColumn;
};

export type AssetCardData = {
  symbol: string;
  name: string;
  price: number;
  changePct: number;
  state: DecisionState;
  action: TradeAction;
  confidence: number;
  minutesInState: number;
  sparkline: number[];
  reason?: string;
  quality?: number;
  momentumBias?: "up" | "down" | "flat";
  structuralBias?: "supported" | "fragile" | "neutral";
  sessionBias?: "favorable" | "mixed" | "unfavorable";
};

export type HeroDecisionData = {
  headline: string;
  asset: string | null;
  action: TradeAction;
  confidence: number | null;
  minutesInState: number | null;
  reason: string;
  signalAge: SignalAge | null;
  entry: number | null;
  invalidation: number | null;
  price: number | null;
  changePct: number | null;
  chart: number[];
  winRate: number;
};

export type MacroItem = {
  label: string;
  value: string;
};

export type AlertItem = {
  title: string;
  asset: string;
  state: DecisionState;
  secondsAgo: number;
  detail: string;
};

export type InsightItem = {
  label: string;
  detail: string;
};

export type RankedItem = {
  label: string;
  state: DecisionState;
  score: number;
};

export type ReplayItem = {
  symbol: string;
  state: DecisionState;
  outcome: "win" | "loss" | "open";
};

export type DashboardData = {
  updatedAt: string;
  heroDecision: HeroDecisionData;
  assets: AssetCardData[];
  macro: MacroItem[];
  alerts: AlertItem[];
  insights: InsightItem[];
  ranked: RankedItem[];
  replay?: ReplayItem[];
};
