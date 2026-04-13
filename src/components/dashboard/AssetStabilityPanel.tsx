import { Card } from "../ui/Card";
import type { AssetDecisionTelemetrySummary } from "../../lib/decisionTelemetry";

type AssetStabilityPanelProps = {
  summaries: AssetDecisionTelemetrySummary[];
};

function bucketTone(bucket: "WAIT" | "EXECUTE" | "AVOID") {
  if (bucket === "EXECUTE") {
    return {
      color: "#86efac",
      background: "rgba(16,185,129,0.10)",
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

function stabilityTone(score: number) {
  if (score >= 85) return "#86efac";
  if (score >= 65) return "#fde68a";
  return "#fda4af";
}

export function AssetStabilityPanel({
  summaries,
}: AssetStabilityPanelProps) {
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
              Asset stability
            </div>

            <div
              style={{
                fontSize: "18px",
                lineHeight: 1.15,
                fontWeight: 800,
                color: "#fafafa",
              }}
            >
              Stability and churn by asset
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
            <span style={{ color: "#fafafa" }}>{summaries.length}</span>
          </div>
        </div>

        {summaries.length === 0 ? (
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
            No stability data available yet.
          </div>
        ) : (
          <div
            style={{
              display: "grid",
              gap: "10px",
            }}
          >
            {summaries.map((summary) => {
              const bucket = bucketTone(summary.currentBucket);

              return (
                <div
                  key={summary.symbol}
                  style={{
                    display: "grid",
                    gridTemplateColumns: "minmax(150px, 190px) minmax(0, 1fr)",
                    gap: "14px",
                    alignItems: "center",
                    padding: "12px 14px",
                    borderRadius: "14px",
                    border: "1px solid rgba(255,255,255,0.06)",
                    background: "rgba(255,255,255,0.02)",
                  }}
                >
                  <div>
                    <div
                      style={{
                        fontSize: "16px",
                        fontWeight: 700,
                        color: "#fafafa",
                        marginBottom: "3px",
                      }}
                    >
                      {summary.name}
                    </div>

                    <div
                      style={{
                        fontSize: "12px",
                        color: "#71717a",
                        letterSpacing: "0.03em",
                      }}
                    >
                      {summary.symbol}
                    </div>
                  </div>

                  <div
                    style={{
                      display: "grid",
                      gap: "10px",
                    }}
                  >
                    <div
                      style={{
                        display: "flex",
                        flexWrap: "wrap",
                        gap: "8px",
                        alignItems: "center",
                      }}
                    >
                      <div
                        style={{
                          padding: "6px 10px",
                          borderRadius: "999px",
                          fontSize: "11px",
                          fontWeight: 800,
                          letterSpacing: "0.05em",
                          ...bucket,
                        }}
                      >
                        {summary.currentBucket}
                      </div>

                      <div
                        style={{
                          padding: "6px 10px",
                          borderRadius: "999px",
                          fontSize: "11px",
                          fontWeight: 800,
                          letterSpacing: "0.05em",
                          border: "1px solid rgba(255,255,255,0.08)",
                          background: "rgba(255,255,255,0.02)",
                          color: stabilityTone(summary.stabilityScore),
                        }}
                      >
                        Stability {summary.stabilityScore}
                      </div>

                      <div
                        style={{
                          padding: "6px 10px",
                          borderRadius: "999px",
                          fontSize: "11px",
                          fontWeight: 800,
                          letterSpacing: "0.05em",
                          border: "1px solid rgba(255,255,255,0.08)",
                          background: "rgba(255,255,255,0.02)",
                          color: "#d4d4d8",
                        }}
                      >
                        Churn {summary.churnCount}
                      </div>

                      <div
                        style={{
                          padding: "6px 10px",
                          borderRadius: "999px",
                          fontSize: "11px",
                          fontWeight: 800,
                          letterSpacing: "0.05em",
                          border: "1px solid rgba(255,255,255,0.08)",
                          background: "rgba(255,255,255,0.02)",
                          color: "#d4d4d8",
                        }}
                      >
                        Quality {summary.currentQuality}
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
                      {summary.last10Outcomes.map((outcome, index) => {
                        const tone = bucketTone(outcome);

                        return (
                          <div
                            key={`${summary.symbol}-${index}-${outcome}`}
                            style={{
                              width: "28px",
                              height: "28px",
                              display: "inline-flex",
                              alignItems: "center",
                              justifyContent: "center",
                              borderRadius: "10px",
                              fontSize: "10px",
                              fontWeight: 900,
                              letterSpacing: "0.04em",
                              ...tone,
                            }}
                            title={outcome}
                          >
                            {outcome === "EXECUTE"
                              ? "E"
                              : outcome === "WAIT"
                              ? "W"
                              : "A"}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </Card>
  );
}