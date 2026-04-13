import { Card } from "../ui/Card";
import { Badge } from "../ui/Badge";

type WhatMattersNowProps = {
  session: string;
  primaryRead: string;
  summary: string;
  sessionSummary: string;
  fastestAsset: string;
  fastestNote: string;
  bestBehavior: string;
  bestBehaviorNote: string;
  disciplineTitle: string;
  disciplineText: string;
};

function sessionTone(session: string) {
  if (session === "Asia") {
    return {
      background: "rgba(59,130,246,0.14)",
      color: "#93c5fd",
      border: "1px solid rgba(59,130,246,0.24)",
    };
  }

  if (session === "London") {
    return {
      background: "rgba(168,85,247,0.14)",
      color: "#d8b4fe",
      border: "1px solid rgba(168,85,247,0.24)",
    };
  }

  if (session === "New York") {
    return {
      background: "rgba(16,185,129,0.14)",
      color: "#86efac",
      border: "1px solid rgba(16,185,129,0.24)",
    };
  }

  return {
    background: "rgba(255,255,255,0.08)",
    color: "white",
    border: "1px solid rgba(255,255,255,0.12)",
  };
}

function confidenceTone(primaryRead: string) {
  const value = primaryRead.toLowerCase();

  if (value.includes("dominating")) {
    return {
      label: "High confidence",
      background: "rgba(16,185,129,0.14)",
      color: "#86efac",
      border: "1px solid rgba(16,185,129,0.24)",
      score: "8.8/10",
    };
  }

  if (value.includes("favored") || value.includes("leadership") || value.includes("selective")) {
    return {
      label: "Medium confidence",
      background: "rgba(251,191,36,0.14)",
      color: "#fde68a",
      border: "1px solid rgba(251,191,36,0.24)",
      score: "6.9/10",
    };
  }

  return {
    label: "Selective",
    background: "rgba(255,255,255,0.08)",
    color: "#d4d4d8",
    border: "1px solid rgba(255,255,255,0.12)",
    score: "5.2/10",
  };
}

export function WhatMattersNow({
  session,
  primaryRead,
  summary,
  sessionSummary,
  fastestAsset,
  fastestNote,
  bestBehavior,
  bestBehaviorNote,
  disciplineTitle,
  disciplineText,
}: WhatMattersNowProps) {
  const confidence = confidenceTone(primaryRead);

  return (
    <Card>
      <div style={{ marginBottom: "14px" }}>
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: "8px",
            flexWrap: "wrap",
            marginBottom: "8px",
          }}
        >
          <h2
            style={{
              margin: 0,
              fontSize: "24px",
              fontWeight: 700,
              letterSpacing: "-0.02em",
            }}
          >
            What matters now
          </h2>

          <Badge style={sessionTone(session)}>{session}</Badge>

          <Badge
            style={{
              background: confidence.background,
              color: confidence.color,
              border: confidence.border,
            }}
          >
            {confidence.label}
          </Badge>
        </div>

        <p
          style={{
            margin: 0,
            color: "#71717a",
            fontSize: "13px",
          }}
        >
          The single block users check before making a decision.
        </p>
      </div>

      <div
        style={{
          border: "1px solid rgba(16,185,129,0.18)",
          background: "rgba(16,185,129,0.09)",
          borderRadius: "16px",
          padding: "14px",
          marginBottom: "12px",
        }}
      >
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            gap: "12px",
            alignItems: "center",
            marginBottom: "8px",
            flexWrap: "wrap",
          }}
        >
          <p
            style={{
              margin: 0,
              fontSize: "13px",
              color: "#86efac",
              fontWeight: 700,
            }}
          >
            Primary read
          </p>

          <span
            style={{
              fontSize: "12px",
              color: confidence.color,
              fontWeight: 700,
            }}
          >
            {confidence.score}
          </span>
        </div>

        <p
          style={{
            margin: 0,
            fontSize: "20px",
            fontWeight: 700,
            color: "white",
            lineHeight: 1.18,
            letterSpacing: "-0.02em",
          }}
        >
          {primaryRead}
        </p>

        <p
          style={{
            margin: "10px 0 0 0",
            fontSize: "13px",
            lineHeight: 1.65,
            color: "#d4d4d8",
          }}
        >
          {summary}
        </p>
      </div>

      <div
        style={{
          border: "1px solid rgba(255,255,255,0.1)",
          borderRadius: "14px",
          padding: "12px",
          background: "rgba(255,255,255,0.03)",
          marginBottom: "12px",
        }}
      >
        <p
          style={{
            margin: 0,
            color: "#a1a1aa",
            fontSize: "13px",
            fontWeight: 700,
          }}
        >
          Session context
        </p>

        <p
          style={{
            margin: "8px 0 0 0",
            color: "#d4d4d8",
            fontSize: "13px",
            lineHeight: 1.65,
          }}
        >
          {sessionSummary}
        </p>
      </div>

      <div
        style={{
          display: "grid",
          gap: "12px",
          gridTemplateColumns: "1fr 1fr",
          marginBottom: "12px",
        }}
      >
        <div
          style={{
            border: "1px solid rgba(255,255,255,0.1)",
            borderRadius: "14px",
            padding: "12px",
            background: "rgba(255,255,255,0.03)",
          }}
        >
          <p style={{ margin: 0, color: "#a1a1aa", fontSize: "13px" }}>
            Fastest asset
          </p>

          <p
            style={{
              margin: "6px 0 0 0",
              fontSize: "18px",
              fontWeight: 700,
              color: "white",
            }}
          >
            {fastestAsset}
          </p>

          <p
            style={{
              margin: "6px 0 0 0",
              color: "#a1a1aa",
              fontSize: "13px",
              lineHeight: 1.55,
            }}
          >
            {fastestNote}
          </p>
        </div>

        <div
          style={{
            border: "1px solid rgba(255,255,255,0.1)",
            borderRadius: "14px",
            padding: "12px",
            background: "rgba(255,255,255,0.03)",
          }}
        >
          <p style={{ margin: 0, color: "#a1a1aa", fontSize: "13px" }}>
            Best behavior
          </p>

          <p
            style={{
              margin: "6px 0 0 0",
              fontSize: "18px",
              fontWeight: 700,
              color: "white",
            }}
          >
            {bestBehavior}
          </p>

          <p
            style={{
              margin: "6px 0 0 0",
              color: "#a1a1aa",
              fontSize: "13px",
              lineHeight: 1.55,
            }}
          >
            {bestBehaviorNote}
          </p>
        </div>
      </div>

      <div
        style={{
          border: "1px solid rgba(255,255,255,0.1)",
          borderRadius: "14px",
          padding: "12px",
          background: "rgba(255,255,255,0.03)",
        }}
      >
        <p
          style={{
            margin: 0,
            color: "#fda4af",
            fontSize: "13px",
            fontWeight: 700,
          }}
        >
          {disciplineTitle}
        </p>

        <p
          style={{
            margin: "8px 0 0 0",
            color: "#d4d4d8",
            fontSize: "13px",
            lineHeight: 1.65,
          }}
        >
          {disciplineText}
        </p>
      </div>
    </Card>
  );
}