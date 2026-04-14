import { useEffect, useState } from "react";
import type { Asset } from "../../types/asset";
import { Card } from "../ui/Card";
import { SectionTitle } from "../ui/SectionTitle";

type OpportunityHeatmapProps = {
  assets: Asset[];
};

function formatTimeAgo(seconds: number) {
  if (seconds < 5) return "Just updated";
  if (seconds < 60) return `${Math.floor(seconds / 5) * 5}s ago`;
  const mins = Math.floor(seconds / 60);
  return `${mins}m ago`;
}

function directionStyle(direction?: "up" | "down" | "flat") {
  if (direction === "up") {
    return {
      symbol: "▲",
      color: "#34d399",
      bg: "rgba(16,185,129,0.12)",
      border: "1px solid rgba(16,185,129,0.18)",
      label: "Strengthening",
    };
  }

  if (direction === "down") {
    return {
      symbol: "▼",
      color: "#fb7185",
      bg: "rgba(244,63,94,0.12)",
      border: "1px solid rgba(244,63,94,0.18)",
      label: "Weakening",
    };
  }

  return {
    symbol: "•",
    color: "#a1a1aa",
    bg: "rgba(255,255,255,0.08)",
    border: "1px solid rgba(255,255,255,0.10)",
    label: "Flat",
  };
}

function barColor(value: number) {
  if (value >= 85) return "#34d399";
  if (value >= 70) return "#fbbf24";
  return "#fb7185";
}

export function OpportunityHeatmap({ assets }: OpportunityHeatmapProps) {
  const [seconds, setSeconds] = useState(0);

  useEffect(() => {
    const interval = setInterval(() => {
      setSeconds((s) => s + 5);
    }, 5000);

    return () => clearInterval(interval);
  }, []);

  const ranked = assets.slice().sort((a, b) => b.setup - a.setup);

  return (
    <Card>
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "flex-start",
          gap: "12px",
          marginBottom: "12px",
          flexWrap: "wrap",
        }}
      >
        <div>
          <SectionTitle>Opportunity Heatmap</SectionTitle>
          <p
            style={{
              margin: "6px 0 0 0",
              fontSize: "13px",
              color: "#a1a1aa",
            }}
          >
            Ranked by current opportunity quality
          </p>
        </div>

        <span
          style={{
            padding: "8px 12px",
            borderRadius: "999px",
            border: "1px solid rgba(255,255,255,0.1)",
            background: "rgba(255,255,255,0.03)",
            color: "#d4d4d8",
            fontSize: "12px",
            fontWeight: 700,
          }}
        >
          {formatTimeAgo(seconds)}
        </span>
      </div>

      <div style={{ display: "grid", gap: "10px" }}>
        {ranked.map((asset, index) => {
          const direction = directionStyle(asset.direction);

          return (
            <div
              key={asset.symbol}
              style={{
                border: "1px solid rgba(255,255,255,0.1)",
                borderRadius: "12px",
                padding: "10px",
                background: "rgba(255,255,255,0.03)",
              }}
            >
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  gap: "10px",
                  marginBottom: "6px",
                }}
              >
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: "8px",
                    minWidth: 0,
                    flexWrap: "wrap",
                  }}
                >
                  <span
                    style={{
                      width: "22px",
                      height: "22px",
                      borderRadius: "999px",
                      display: "inline-flex",
                      alignItems: "center",
                      justifyContent: "center",
                      fontSize: "11px",
                      fontWeight: 700,
                      color: index < 3 ? "#0b0f14" : "white",
                      background:
                        index === 0
                          ? "#34d399"
                          : index === 1
                          ? "#86efac"
                          : index === 2
                          ? "#fde68a"
                          : "rgba(255,255,255,0.08)",
                    }}
                  >
                    {index + 1}
                  </span>

                  <span
                    style={{
                      fontWeight: 700,
                      color: "white",
                      whiteSpace: "nowrap",
                    }}
                  >
                    {asset.name}
                  </span>

                  <span
                    style={{
                      padding: "4px 7px",
                      borderRadius: "999px",
                      fontSize: "11px",
                      fontWeight: 700,
                      color: direction.color,
                      background: direction.bg,
                      border: direction.border,
                      lineHeight: 1,
                    }}
                  >
                    {direction.symbol} {direction.label}
                  </span>
                </div>

                <span
                  style={{
                    color: barColor(asset.setup),
                    fontWeight: 700,
                  }}
                >
                  {asset.setup}
                </span>
              </div>

              <div
                style={{
                  height: "6px",
                  borderRadius: "999px",
                  background: "rgba(255,255,255,0.08)",
                  overflow: "hidden",
                }}
              >
                <div
                  style={{
                    width: `${asset.setup}%`,
                    height: "100%",
                    borderRadius: "999px",
                    background: barColor(asset.setup),
                  }}
                />
              </div>
            </div>
          );
        })}
      </div>
    </Card>
  );
}