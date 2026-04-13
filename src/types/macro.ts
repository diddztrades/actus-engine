export type MacroCard = {
  title: string;
  value: string;
  desc: string;
};

export type MacroEvent = {
  id: string;
  title: string;
  datetimeUtc: string;
  impact: "low" | "medium" | "high";
  country: string;
  eventType: string;
  markets: string[];
  tags: string[];
};

export type MacroEventRisk = MacroEvent & {
  timeLabel?: string | null;
  warning?: string;
};

export type MacroSnapshot = {
  session: string;
  primaryRead: string;
  summary: string;
  sessionSummary: string;
  disciplineTitle: string;
  disciplineText: string;
  volatilityRegime: "low" | "normal" | "high";
  usdBias: "bullish" | "bearish" | "neutral";
  energyPressure: "low" | "normal" | "high";
  equityTone: "risk-on" | "risk-off" | "mixed";
  cryptoTone: "risk-on" | "risk-off" | "mixed";
  eventRisk?: MacroEventRisk;
};
