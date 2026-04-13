import { Card } from "../ui/Card";
import type { DecisionTelemetryEntry } from "../../lib/decisionTelemetry";

type DecisionHistoryPanelProps = {
  entries: DecisionTelemetryEntry[];
};

type AssetHistoryRow = {
  symbol: string;
  name: string;
  outcomes: Array<"WAIT" | "EXECUTE" | "AVOID">;
};

function bucketTone(bucket: "WAIT" | "EXECUTE" | "AVOID") {
  if (bucket === "EXECUTE") {
    return {
      color: "#86efac",
      background: "rgba(16,185,129,0.12)",
      border: "1px solid rgba(52,211,153,0.18)",
    };
  }

  if (bucket === "AVOID") {
    return {
      color: "#fda4af",
      background: "rgba(244,63,94,0.10)",
      border: "1px solid rgba(251,113,133,0.16)",
    };
  }

  return {
    color: "#fde68a",
    background: "rgba(251,191,36,0.10)",
    border: "1px solid rgba(251,191,36,0.16)",
  };
}

function buildAssetRows(entries: DecisionTelemetryEntry[]): AssetHistoryRow[] {
  const grouped = new Map<string, AssetHistoryRow>();

  [...entries].reverse().forEach((entry) => {
    const existing = grouped.get(entry.symbol);

    if (!existing) {
      grouped.set(entry.symbol, {
        symbol: entry.symbol,
        name: entry.name,
        outcomes: [entry.bucket],
      });
      return;
    }

    if (existing.outcomes.length < 10) {
      existing.outcomes.push(entry.bucket);
    }
  });

  return Array.from(grouped.values()).sort((a, b) =>
    a.name.localeCompare(b.name)
  );
}

export function DecisionHistoryPanel({
  entries,
}: DecisionHistoryPanelProps) {
  const rows = buildAssetRows(entries);

  return (
    <Card>
      <div
        style={{
          display: "grid",
          gap: "14px",
        }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "flex-end",
            justifyContent: "space-between",
            gap: "12px",
            flexWrap: "wrap",
          }}
        >
          <div>
            <div
              style={{
                fontSize: "11px",
                fontWeight: 800,
                letterSpacing: "0.10em",
                textTransform: "uppercase",
                color: "#71717a",
                marginBottom: "4px",
              }}
            >
              Decision history
            </div>

            <div
              style={{
                fontSize: "18px",
                lineHeight: 1.15,
                fontWeight: 800,
                color: "#fafafa",
              }}
            >
              Last 10 outcomes by asset
            </div>
          </div>

          <div
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: "8px",
              padding: "8px 12px",
              borderRadius: "999px",
              border: "1px solid rgba(255,255,255,0.08)",
              background: "rgba(255,255,255,0.025)",
              color: "#d4d4d8",
              fontSize: "12px",
              fontWeight: 700,
              letterSpacing: "0.03em",
            }}
          >
            <span style={{ color: "#71717a" }}>Tracked assets</span>
            <span style={{ color: "#fafafa" }}>{rows.length}</span>
          </div>
        </div>

        {rows.length === 0 ? (
          <div
            style={{
              padding: "14px",
              borderRadius: "14px",
              border: "1px solid rgba(255,255,255,0.06)",
              background: "rgba(255,255,255,0.02)",
              color: "#a1a1aa",
              fontSize: "13px",
            }}
          >
            No decision changes logged yet.
          </div>
        ) : (
          <div
            style={{
              display: "grid",
              gap: "10px",
            }}
          >
            {rows.map((row) => (
              <div
                key={row.symbol}
                style={{
                  display: "grid",
                  gridTemplateColumns: "minmax(140px, 180px) minmax(0, 1fr)",
                  gap: "12px",
                  alignItems: "center",
                  padding: "12px 14px",
                  borderRadius: "14px",
                  border: "1px solid rgba(255,255,255,0.06)",
                  background: "rgba(255,255,255,0.02)",
                }}
              >
                <div
                  style={{
                    minWidth: 0,
                  }}
                >
                  <div
                    style={{
                      fontSize: "16px",
                      fontWeight: 700,
                      color: "#fafafa",
                      marginBottom: "2px",
                    }}
                  >
                    {row.name}
                  </div>

                  <div
                    style={{
                      fontSize: "12px",
                      color: "#71717a",
                      letterSpacing: "0.03em",
                    }}
                  >
                    {row.symbol}
                  </div>
                </div>

                <div
                  style={{
                    display: "flex",
                    flexWrap: "wrap",
                    gap: "8px",
                    alignItems: "center",
                  }}
                >
                  {row.outcomes.map((bucket, index) => {
                    const tone = bucketTone(bucket);

                    return (
                      <div
                        key={`${row.symbol}-${index}-${bucket}`}
                        style={{
                          padding: "6px 10px",
                          borderRadius: "999px",
                          fontSize: "11px",
                          fontWeight: 800,
                          letterSpacing: "0.05em",
                          ...tone,
                        }}
                      >
                        {bucket}
                      </div>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </Card>
  );
}