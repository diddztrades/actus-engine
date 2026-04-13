type StatusCardProps = {
  session: string;
  topMover: string;
  focus: string;
  noTradeFlag: string;
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

function shortenFocus(focus: string) {
  const value = focus.toLowerCase();

  if (value.includes("momentum continuation")) return "Momentum continuation";
  if (value.includes("defensive posture")) return "Defensive posture";
  if (value.includes("selective leadership")) return "Selective leadership";

  if (focus.length > 30) return `${focus.slice(0, 30)}...`;
  return focus;
}

function getBoardDirection(focus: string) {
  const value = focus.toLowerCase();

  if (
    value.includes("momentum") ||
    value.includes("continuation") ||
    value.includes("leadership")
  ) {
    return {
      label: "Strengthening",
      symbol: "▲",
      color: "#34d399",
      bg: "rgba(16,185,129,0.12)",
      border: "1px solid rgba(16,185,129,0.18)",
      confidence: "High",
    };
  }

  if (
    value.includes("defensive") ||
    value.includes("weaker") ||
    value.includes("caution")
  ) {
    return {
      label: "Weakening",
      symbol: "▼",
      color: "#fb7185",
      bg: "rgba(244,63,94,0.12)",
      border: "1px solid rgba(244,63,94,0.18)",
      confidence: "High",
    };
  }

  return {
    label: "Mixed",
    symbol: "•",
    color: "#a1a1aa",
    bg: "rgba(255,255,255,0.08)",
    border: "1px solid rgba(255,255,255,0.10)",
    confidence: "Selective",
  };
}

export function StatusCard({
  session,
  topMover,
  focus,
  noTradeFlag,
}: StatusCardProps) {
  const boardDirection = getBoardDirection(focus);

  return (
    <div
      style={{
        border: "1px solid rgba(255,255,255,0.1)",
        borderRadius: "18px",
        padding: "16px",
        background: "rgba(255,255,255,0.03)",
        marginBottom: "16px",
      }}
    >
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          gap: "16px",
          marginBottom: "14px",
          flexWrap: "wrap",
        }}
      >
        <div>
          <p style={{ margin: 0, color: "#71717a", fontSize: "14px" }}>
            Session status
          </p>
          <p
            style={{
              margin: "6px 0 0 0",
              fontSize: "28px",
              fontWeight: 700,
              color: "white",
              letterSpacing: "-0.02em",
            }}
          >
            {session} active
          </p>
        </div>

        <span
          style={{
            ...sessionTone(session),
            padding: "7px 12px",
            borderRadius: "999px",
            fontSize: "12px",
            fontWeight: 700,
          }}
        >
          {session}
        </span>
      </div>

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "1fr 1fr 1fr 1fr 1fr",
          gap: "12px",
        }}
      >
        {[
          ["Top mover", topMover],
          ["Focus", shortenFocus(focus)],
          ["No-trade flag", noTradeFlag],
          ["Confidence", boardDirection.confidence],
        ].map(([label, value]) => (
          <div
            key={label}
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
                fontSize: "12px",
                color: "#71717a",
                textTransform: "uppercase",
                letterSpacing: "0.08em",
              }}
            >
              {label}
            </p>
            <p
              style={{
                margin: "8px 0 0 0",
                fontSize: "14px",
                fontWeight: 700,
                color: "white",
              }}
            >
              {value}
            </p>
          </div>
        ))}

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
              fontSize: "12px",
              color: "#71717a",
              textTransform: "uppercase",
              letterSpacing: "0.08em",
            }}
          >
            Board state
          </p>

          <div
            style={{
              marginTop: "8px",
              display: "inline-flex",
              alignItems: "center",
              gap: "8px",
              padding: "6px 10px",
              borderRadius: "999px",
              color: boardDirection.color,
              background: boardDirection.bg,
              border: boardDirection.border,
              fontSize: "12px",
              fontWeight: 700,
            }}
          >
            <span>{boardDirection.symbol}</span>
            <span>{boardDirection.label}</span>
          </div>
        </div>
      </div>
    </div>
  );
}