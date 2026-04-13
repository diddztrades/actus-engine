import { useEffect, useState } from "react";
import type { AlertItem } from "../../types/alert";
import { AlertRow } from "./AlertRow";
import { Card } from "../ui/Card";
import { SectionTitle } from "../ui/SectionTitle";

type AlertsPanelProps = {
  alerts: AlertItem[];
};

function formatTimeAgo(seconds: number) {
  if (seconds < 5) return "Live";
  if (seconds < 60) return `${Math.floor(seconds / 5) * 5}s`;
  const mins = Math.floor(seconds / 60);
  return `${mins}m`;
}

function getCounts(alerts: AlertItem[]) {
  let high = 0;
  let medium = 0;
  let low = 0;

  alerts.forEach((a) => {
    if (a.severity === "high") high++;
    if (a.severity === "medium") medium++;
    if (a.severity === "low") low++;
  });

  return { high, medium, low };
}

export function AlertsPanel({ alerts }: AlertsPanelProps) {
  const [seconds, setSeconds] = useState(0);
  const { high, medium, low } = getCounts(alerts);

  useEffect(() => {
    const interval = setInterval(() => {
      setSeconds((s) => s + 5);
    }, 5000);

    return () => clearInterval(interval);
  }, []);

  return (
    <Card>
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "flex-start",
          gap: "10px",
          marginBottom: "10px",
          flexWrap: "wrap",
        }}
      >
        <div>
          <SectionTitle>Alerts</SectionTitle>
          <p
            style={{
              margin: "4px 0 0 0",
              fontSize: "12px",
              color: "#71717a",
            }}
          >
            Live signal feed generated from real conditions
          </p>
        </div>

        <div
          style={{
            display: "flex",
            gap: "6px",
            flexWrap: "wrap",
            alignItems: "center",
          }}
        >
          <span
            style={{
              padding: "7px 10px",
              borderRadius: "999px",
              border: "1px solid rgba(255,255,255,0.1)",
              background: "rgba(255,255,255,0.03)",
              color: "#d4d4d8",
              fontSize: "11px",
              fontWeight: 700,
            }}
          >
            {formatTimeAgo(seconds)}
          </span>

          {high > 0 && (
            <span
              style={{
                padding: "6px 9px",
                borderRadius: "999px",
                fontSize: "11px",
                fontWeight: 700,
                background: "rgba(16,185,129,0.14)",
                color: "#86efac",
                border: "1px solid rgba(16,185,129,0.24)",
              }}
            >
              {high} high priority
            </span>
          )}

          {medium > 0 && (
            <span
              style={{
                padding: "6px 9px",
                borderRadius: "999px",
                fontSize: "11px",
                fontWeight: 700,
                background: "rgba(251,191,36,0.14)",
                color: "#fde68a",
                border: "1px solid rgba(251,191,36,0.24)",
              }}
            >
              {medium} medium priority
            </span>
          )}

          {low > 0 && (
            <span
              style={{
                padding: "6px 9px",
                borderRadius: "999px",
                fontSize: "11px",
                fontWeight: 700,
                background: "rgba(255,255,255,0.08)",
                color: "#d4d4d8",
                border: "1px solid rgba(255,255,255,0.12)",
              }}
            >
              {low} low priority
            </span>
          )}
        </div>
      </div>

      <div style={{ display: "grid", gap: "10px" }}>
        {alerts.map((alert) => (
          <AlertRow key={`${alert.asset}-${alert.title}`} alert={alert} />
        ))}
      </div>
    </Card>
  );
}