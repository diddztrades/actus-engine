type SessionBarProps = {
  session: string;
};

type SessionKey = "Asia" | "London" | "New York";

function normalizeSession(session: string): SessionKey {
  if (session === "Asia") return "Asia";
  if (session === "London") return "London";
  return "New York";
}

function pillStyle(active: boolean, tone: "asia" | "london" | "newyork") {
  if (!active) {
    return {
      padding: "9px 12px",
      borderRadius: "12px",
      border: "1px solid rgba(255,255,255,0.08)",
      background: "rgba(255,255,255,0.025)",
      color: "#71717a",
      fontSize: "12px",
      fontWeight: 700,
      letterSpacing: "0.04em",
    } as const;
  }

  if (tone === "asia") {
    return {
      padding: "9px 12px",
      borderRadius: "12px",
      border: "1px solid rgba(96,165,250,0.22)",
      background: "rgba(59,130,246,0.10)",
      color: "#bfdbfe",
      boxShadow: "0 0 18px rgba(59,130,246,0.08)",
      fontSize: "12px",
      fontWeight: 800,
      letterSpacing: "0.04em",
    } as const;
  }

  if (tone === "london") {
    return {
      padding: "9px 12px",
      borderRadius: "12px",
      border: "1px solid rgba(192,132,252,0.22)",
      background: "rgba(168,85,247,0.10)",
      color: "#e9d5ff",
      boxShadow: "0 0 18px rgba(168,85,247,0.08)",
      fontSize: "12px",
      fontWeight: 800,
      letterSpacing: "0.04em",
    } as const;
  }

  return {
    padding: "9px 12px",
    borderRadius: "12px",
    border: "1px solid rgba(52,211,153,0.22)",
    background: "rgba(16,185,129,0.10)",
    color: "#bbf7d0",
    boxShadow: "0 0 18px rgba(16,185,129,0.08)",
    fontSize: "12px",
    fontWeight: 800,
    letterSpacing: "0.04em",
  } as const;
}

function labelTone(active: boolean) {
  return active ? "#fafafa" : "#71717a";
}

export function SessionBar({ session }: SessionBarProps) {
  const activeSession = normalizeSession(session);

  return (
    <div
      style={{
        display: "grid",
        gap: "10px",
        padding: "12px 14px",
        borderRadius: "16px",
        border: "1px solid rgba(255,255,255,0.07)",
        background: "rgba(255,255,255,0.02)",
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
            Session State
          </div>

          <div
            style={{
              fontSize: "17px",
              fontWeight: 800,
              color: "#fafafa",
              lineHeight: 1.15,
            }}
          >
            {activeSession} session active
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
          <span style={{ color: "#71717a" }}>Current focus</span>
          <span style={{ color: "#fafafa" }}>{activeSession}</span>
        </div>
      </div>

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(3, minmax(0, 1fr))",
          gap: "10px",
        }}
      >
        <div style={pillStyle(activeSession === "Asia", "asia")}>
          <div
            style={{
              fontSize: "10px",
              textTransform: "uppercase",
              letterSpacing: "0.08em",
              marginBottom: "4px",
              color: labelTone(activeSession === "Asia"),
              opacity: activeSession === "Asia" ? 0.8 : 1,
            }}
          >
            Asia
          </div>

          <div
            style={{
              fontSize: "12px",
              color: activeSession === "Asia" ? "#e0f2fe" : "#8b8b93",
              fontWeight: 700,
            }}
          >
            Early structure / range build
          </div>
        </div>

        <div style={pillStyle(activeSession === "London", "london")}>
          <div
            style={{
              fontSize: "10px",
              textTransform: "uppercase",
              letterSpacing: "0.08em",
              marginBottom: "4px",
              color: labelTone(activeSession === "London"),
              opacity: activeSession === "London" ? 0.8 : 1,
            }}
          >
            London
          </div>

          <div
            style={{
              fontSize: "12px",
              color: activeSession === "London" ? "#f5e8ff" : "#8b8b93",
              fontWeight: 700,
            }}
          >
            Expansion / decision pressure
          </div>
        </div>

        <div style={pillStyle(activeSession === "New York", "newyork")}>
          <div
            style={{
              fontSize: "10px",
              textTransform: "uppercase",
              letterSpacing: "0.08em",
              marginBottom: "4px",
              color: labelTone(activeSession === "New York"),
              opacity: activeSession === "New York" ? 0.8 : 1,
            }}
          >
            New York
          </div>

          <div
            style={{
              fontSize: "12px",
              color: activeSession === "New York" ? "#dcfce7" : "#8b8b93",
              fontWeight: 700,
            }}
          >
            Confirmation / execution window
          </div>
        </div>
      </div>
    </div>
  );
}