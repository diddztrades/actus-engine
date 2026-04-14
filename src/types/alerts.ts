export type EngineAlertLevel = "high" | "medium" | "low";

export type EngineAlert = {
  id: string;
  title: string;
  detail: string;
  level: EngineAlertLevel;
  symbol?: string;
  createdAt: number;
};