import type { AlertItem } from "../../types/alert";
import { badgeTone } from "../../lib/tones";
import { Card } from "../ui/Card";
import { Badge } from "../ui/Badge";
import { AlertIcon, BellIcon } from "../icons";

type AlertRowProps = {
  alert: AlertItem;
};

function severityAccent(severity: AlertItem["severity"]) {
  if (severity === "high") {
    return {
      tint: "#fb7185",
      glow: "rgba(244,63,94,0.28)",
      soft: "rgba(244,63,94,0.10)",
      ring: "rgba(244,63,94,0.18)",
    };
  }

  if (severity === "medium") {
    return {
      tint: "#fbbf24",
      glow: "rgba(251,191,36,0.24)",
      soft: "rgba(251,191,36,0.10)",
      ring: "rgba(251,191,36,0.16)",
    };
  }

  return {
    tint: "#34d399",
    glow: "rgba(16,185,129,0.22)",
    soft: "rgba(16,185,129,0.10)",
    ring: "rgba(16,185,129,0.16)",
  };
}

function isFresh(time: string) {
  const parts = time.split(":").map(Number);
  if (parts.length !== 2 || Number.isNaN(parts[0]) || Number.isNaN(parts[1])) {
    return false;
  }

  const now = new Date();
  const alertMinutes = parts[0] * 60 + parts[1];
  const nowMinutes = now.getHours() * 60 + now.getMinutes();
  const diff = Math.abs(nowMinutes - alertMinutes);

  return diff <= 3;
}

export function AlertRow({ alert }: AlertRowProps) {
  const Icon = alert.severity === "high" ? AlertIcon : BellIcon;
  const accent = severityAccent(alert.severity);
  const fresh = isFresh(alert.time);

  return (
    <>
      <style>
        {`
          @keyframes alertFreshPulse {
            0% {
              box-shadow:
                0 0 0 0 rgba(0,0,0,0),
                0 0 0 0 ${accent.glow};
            }
            50% {
              box-shadow:
                0 0 0 1px ${accent.ring},
                0 0 24px 0 ${accent.glow};
            }
            100% {
              box-shadow:
                0 0 0 0 rgba(0,0,0,0),
                0 0 0 0 ${accent.glow};
            }
          }

          @keyframes alertBeacon {
            0% {
              opacity: 0.45;
              transform: scale(0.9);
            }
            50% {
              opacity: 1;
              transform: scale(1.08);
            }
            100% {
              opacity: 0.45;
              transform: scale(0.9);
            }
          }
        `}
      </style>

      <div
        style={{
          position: "relative",
          borderRadius: "18px",
          overflow: "hidden",
          animation: fresh ? "alertFreshPulse 2.2s ease-in-out infinite" : "none",
          opacity: fresh ? 1 : 0.94,
          transition: "opacity 0.25s ease",
        }}
      >
        <Card>
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              gap: "12px",
            }}
          >
            <div
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                gap: "12px",
                flexWrap: "wrap",
              }}
            >
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: "10px",
                  flexWrap: "wrap",
                }}
              >
                <div
                  style={{
                    position: "relative",
                    width: "34px",
                    height: "34px",
                    borderRadius: "10px",
                    border: "1px solid rgba(255,255,255,0.1)",
                    background: accent.soft,
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    color: accent.tint,
                    boxShadow: fresh ? `0 0 20px 0 ${accent.glow}` : "none",
                  }}
                >
                  {fresh && (
                    <div
                      style={{
                        position: "absolute",
                        inset: "-4px",
                        borderRadius: "14px",
                        border: `1px solid ${accent.ring}`,
                        animation: "alertBeacon 2.2s ease-in-out infinite",
                        pointerEvents: "none",
                      }}
                    />
                  )}

                  <Icon width={16} height={16} />
                </div>

                <span
                  style={{
                    color: "white",
                    fontWeight: 600,
                    fontSize: "14px",
                  }}
                >
                  {alert.asset}
                </span>

                <Badge
                  style={{
                    ...badgeTone(alert.severity),
                    textTransform: "capitalize",
                  }}
                >
                  {alert.severity} priority
                </Badge>

                {fresh && (
                  <span
                    style={{
                      padding: "4px 8px",
                      borderRadius: "999px",
                      fontSize: "11px",
                      fontWeight: 700,
                      color: "#86efac",
                      background: "rgba(16,185,129,0.12)",
                      border: "1px solid rgba(16,185,129,0.18)",
                    }}
                  >
                    New
                  </span>
                )}
              </div>

              <span
                style={{
                  fontSize: "12px",
                  color: "#71717a",
                }}
              >
                {alert.time}
              </span>
            </div>

            <div style={{ flex: 1 }}>
              <h3
                style={{
                  margin: 0,
                  color: "white",
                  fontWeight: 650,
                  fontSize: "28px",
                  lineHeight: 1.08,
                  letterSpacing: "-0.02em",
                }}
              >
                {alert.title}
              </h3>

              <p
                style={{
                  margin: "10px 0 0 0",
                  fontSize: "14px",
                  color: "#a1a1aa",
                  lineHeight: 1.72,
                }}
              >
                {alert.body}
              </p>
            </div>
          </div>
        </Card>
      </div>
    </>
  );
}