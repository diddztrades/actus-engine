export type AlertSeverity = "high" | "medium" | "low";

export interface AlertItem {
  time: string;
  asset: string;
  title: string;
  body: string;
  severity: AlertSeverity;
}