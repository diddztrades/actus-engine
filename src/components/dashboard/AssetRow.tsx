import type { Asset } from "../../types/asset";
import { badgeTone, setupTone } from "../../lib/tones";
import { Card } from "../ui/Card";
import { Badge } from "../ui/Badge";

type AssetRowProps = {
  asset: Asset;
};

function barColor(value: number) {
  if (value >= 85) return "#34d399";
  if (value >= 70) return "#fbbf24";
  return "#9ca3af";
}

function directionStyle(direction?: "up" | "down" | "flat") {
  if (direction === "up") {
    return { symbol: "▲", color: "#34d399", bg: "rgba(16,185,129,0.12)" };
  }
  if (direction === "down") {
    return { symbol: "▼", color: "#fb7185", bg: "rgba(244,63,94,0.12)" };
  }
  return { symbol: "•", color: "#a1a1aa", bg: "rgba(255,255,255,0.08)" };
}

function gradeStyle(grade?: "A+" | "A" | "B" | "none") {
  if (grade === "A+") {
    return {
      color: "#34d399",
      bg: "rgba(16,185,129,0.14)",
      border: "1px solid rgba(16,185,129,0.24)",
    };
  }

  if (grade === "A") {
    return {
      color: "#fde68a",
      bg: "rgba(251,191,36,0.14)",
      border: "1px solid rgba(251,191,36,0.24)",
    };
  }

  if (grade === "B") {
    return {
      color: "#d4d4d8",
      bg: "rgba(255,255,255,0.08)",
      border: "1px solid rgba(255,255,255,0.12)",
    };
  }

  return null;
}

export function AssetRow({ asset }: AssetRowProps) {
  const direction = directionStyle(asset.direction);
  const grade = gradeStyle(asset.grade);

  return (
    <Card>
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          gap: "16px",
        }}
      >
        <div
          style={{
            display: "flex",
            gap: "14px",
            alignItems: "flex-start",
          }}
        >
          <div
            style={{
              width: "52px",
              height: "52px",
              borderRadius: "14px",
              border: "1px solid rgba(255,255,255,0.1)",
              background: "rgba(255,255,255,0.04)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontWeight: 700,
              flexShrink: 0,
            }}
          >
            {asset.symbol}
          </div>

          <div style={{ flex: 1, minWidth: 0 }}>
            <div
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                gap: "12px",
                flexWrap: "wrap",
                marginBottom: "8px",
              }}
            >
              <h3
                style={{
                  margin: 0,
                  fontSize: "24px",
                  fontWeight: 600,
                  lineHeight: 1.1,
                }}
              >
                {asset.name}
              </h3>

              {grade && (
                <span
                  style={{
                    padding: "5px 9px",
                    borderRadius: "999px",
                    fontSize: "11px",
                    fontWeight: 700,
                    letterSpacing: "0.04em",
                    color: grade.color,
                    background: grade.bg,
                    border: grade.border,
                    flexShrink: 0,
                  }}
                >
                  {asset.grade}
                </span>
              )}
            </div>

            <div
              style={{
                display: "flex",
                gap: "8px",
                alignItems: "center",
                flexWrap: "wrap",
                marginBottom: "10px",
              }}
            >
              <Badge style={badgeTone(asset.bias)}>{asset.bias}</Badge>
              <Badge style={badgeTone(asset.regime)}>{asset.regime}</Badge>

              <span
                style={{
                  padding: "5px 8px",
                  borderRadius: "999px",
                  fontSize: "11px",
                  fontWeight: 700,
                  letterSpacing: "0.04em",
                  color: direction.color,
                  background: direction.bg,
                  border: "1px solid rgba(255,255,255,0.08)",
                }}
              >
                {direction.symbol}
              </span>
            </div>

            <p
              style={{
                margin: 0,
                fontSize: "14px",
                color: "#a1a1aa",
                lineHeight: 1.6,
              }}
            >
              {asset.note}
            </p>
          </div>
        </div>

        <div
          style={{
            display: "grid",
            gridTemplateColumns: "1fr 1fr",
            gap: "18px",
          }}
        >
          <div>
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                marginBottom: "6px",
                fontSize: "14px",
              }}
            >
              <span style={{ color: "#a1a1aa" }}>Speed</span>
              <span style={{ fontWeight: 600 }}>{asset.speed}/100</span>
            </div>

            <div
              style={{
                width: "100%",
                height: "8px",
                borderRadius: "999px",
                background: "rgba(255,255,255,0.08)",
                overflow: "hidden",
              }}
            >
              <div
                style={{
                  width: `${asset.speed}%`,
                  height: "100%",
                  borderRadius: "999px",
                  background: barColor(asset.speed),
                }}
              />
            </div>
          </div>

          <div>
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                marginBottom: "6px",
                fontSize: "14px",
              }}
            >
              <span style={{ color: "#a1a1aa" }}>Setup quality</span>
              <span
                style={{
                  fontWeight: 600,
                  color: setupTone(asset.setup),
                }}
              >
                {asset.setup}/100
              </span>
            </div>

            <div
              style={{
                width: "100%",
                height: "8px",
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
        </div>

        <div
          style={{
            display: "flex",
            gap: "8px",
            flexWrap: "wrap",
          }}
        >
          {[
            `Location: ${asset.location}`,
            `Risk: ${asset.risk}`,
            `Posture: ${asset.posture}`,
          ].map((item) => (
            <span
              key={item}
              style={{
                padding: "6px 10px",
                borderRadius: "999px",
                fontSize: "12px",
                border: "1px solid rgba(255,255,255,0.1)",
                background: "rgba(255,255,255,0.03)",
                color: "#d4d4d8",
              }}
            >
              {item}
            </span>
          ))}
        </div>
      </div>
    </Card>
  );
}