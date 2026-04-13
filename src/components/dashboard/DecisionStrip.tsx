import { Card } from "../ui/Card";

type DecisionStripProps = {
  wait: string[];
  execute: string[];
  avoid: string[];
};

function blockStyle(bucket: "WAIT" | "EXECUTE" | "AVOID") {
  if (bucket === "EXECUTE") {
    return {
      padding: "14px",
      borderRadius: "16px",
      border: "1px solid rgba(52,211,153,0.18)",
      background:
        "linear-gradient(180deg, rgba(16,185,129,0.07) 0%, rgba(255,255,255,0.03) 100%)",
      minHeight: "108px",
      boxShadow: "0 0 28px rgba(16,185,129,0.08)",
    } as const;
  }

  if (bucket === "AVOID") {
    return {
      padding: "14px",
      borderRadius: "16px",
      border: "1px solid rgba(251,113,133,0.14)",
      background: "rgba(255,255,255,0.025)",
      minHeight: "108px",
      boxShadow: "0 0 24px rgba(244,63,94,0.04)",
    } as const;
  }

  return {
    padding: "14px",
    borderRadius: "16px",
    border: "1px solid rgba(255,255,255,0.08)",
    background: "rgba(255,255,255,0.025)",
    minHeight: "108px",
  } as const;
}

function headingStyle(bucket: "WAIT" | "EXECUTE" | "AVOID") {
  if (bucket === "EXECUTE") {
    return {
      color: "#86efac",
      fontSize: "15px",
      fontWeight: 800,
      letterSpacing: "0.06em",
    } as const;
  }

  if (bucket === "AVOID") {
    return {
      color: "#fda4af",
      fontSize: "15px",
      fontWeight: 800,
      letterSpacing: "0.06em",
    } as const;
  }

  return {
    color: "#d4d4d8",
    fontSize: "15px",
    fontWeight: 800,
    letterSpacing: "0.06em",
  } as const;
}

function countStyle(bucket: "WAIT" | "EXECUTE" | "AVOID") {
  if (bucket === "EXECUTE") {
    return {
      color: "#bbf7d0",
      background: "rgba(16,185,129,0.12)",
      border: "1px solid rgba(52,211,153,0.18)",
    } as const;
  }

  if (bucket === "AVOID") {
    return {
      color: "#fecdd3",
      background: "rgba(244,63,94,0.10)",
      border: "1px solid rgba(251,113,133,0.14)",
    } as const;
  }

  return {
    color: "#e4e4e7",
    background: "rgba(255,255,255,0.04)",
    border: "1px solid rgba(255,255,255,0.08)",
  } as const;
}

function listTone(bucket: "WAIT" | "EXECUTE" | "AVOID") {
  if (bucket === "EXECUTE") return "#f4f4f5";
  if (bucket === "AVOID") return "#d4d4d8";
  return "#d4d4d8";
}

function summaryLabel(bucket: "WAIT" | "EXECUTE" | "AVOID", count: number) {
  if (count === 0) {
    if (bucket === "WAIT") return "No setups building";
    if (bucket === "EXECUTE") return "No active execution setups";
    return "No blocked setups";
  }

  if (count === 1) {
    if (bucket === "WAIT") return "1 market in review";
    if (bucket === "EXECUTE") return "1 market ready";
    return "1 market restricted";
  }

  if (bucket === "WAIT") return `${count} markets in review`;
  if (bucket === "EXECUTE") return `${count} markets ready`;
  return `${count} markets restricted`;
}

function renderAssetList(items: string[]) {
  if (!items.length) return "No setups";

  return items.join(", ");
}

export function DecisionStrip({
  wait,
  execute,
  avoid,
}: DecisionStripProps) {
  return (
    <Card>
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: "12px",
          marginBottom: "14px",
          flexWrap: "wrap",
        }}
      >
        <div>
          <div
            style={{
              fontSize: "12px",
              letterSpacing: "0.08em",
              textTransform: "uppercase",
              color: "#71717a",
              marginBottom: "4px",
              fontWeight: 700,
            }}
          >
            Decision Console
          </div>

          <div
            style={{
              fontSize: "18px",
              fontWeight: 800,
              color: "#fafafa",
              lineHeight: 1.15,
            }}
          >
            Market decision summary
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
          <span style={{ color: "#71717a" }}>Active markets</span>
          <span style={{ color: "#fafafa" }}>
            {wait.length + execute.length + avoid.length}
          </span>
        </div>
      </div>

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "1fr 1fr 1fr",
          gap: "12px",
        }}
      >
        <div style={blockStyle("WAIT")}>
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              gap: "10px",
              marginBottom: "8px",
            }}
          >
            <div style={headingStyle("WAIT")}>WAIT</div>

            <div
              style={{
                display: "inline-flex",
                alignItems: "center",
                justifyContent: "center",
                minWidth: "28px",
                height: "28px",
                padding: "0 9px",
                borderRadius: "999px",
                fontSize: "12px",
                fontWeight: 800,
                ...countStyle("WAIT"),
              }}
            >
              {wait.length}
            </div>
          </div>

          <div
            style={{
              fontSize: "12px",
              color: "#71717a",
              marginBottom: "8px",
              fontWeight: 600,
              letterSpacing: "0.02em",
            }}
          >
            {summaryLabel("WAIT", wait.length)}
          </div>

          <div
            style={{
              fontSize: "13px",
              color: listTone("WAIT"),
              lineHeight: 1.6,
            }}
          >
            {renderAssetList(wait)}
          </div>
        </div>

        <div style={blockStyle("EXECUTE")}>
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              gap: "10px",
              marginBottom: "8px",
            }}
          >
            <div style={headingStyle("EXECUTE")}>EXECUTE</div>

            <div
              style={{
                display: "inline-flex",
                alignItems: "center",
                justifyContent: "center",
                minWidth: "28px",
                height: "28px",
                padding: "0 9px",
                borderRadius: "999px",
                fontSize: "12px",
                fontWeight: 800,
                ...countStyle("EXECUTE"),
              }}
            >
              {execute.length}
            </div>
          </div>

          <div
            style={{
              fontSize: "12px",
              color: "#86efac",
              marginBottom: "8px",
              fontWeight: 700,
              letterSpacing: "0.02em",
            }}
          >
            {summaryLabel("EXECUTE", execute.length)}
          </div>

          <div
            style={{
              fontSize: "13px",
              color: listTone("EXECUTE"),
              lineHeight: 1.6,
              fontWeight: 600,
            }}
          >
            {renderAssetList(execute)}
          </div>
        </div>

        <div style={blockStyle("AVOID")}>
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              gap: "10px",
              marginBottom: "8px",
            }}
          >
            <div style={headingStyle("AVOID")}>AVOID</div>

            <div
              style={{
                display: "inline-flex",
                alignItems: "center",
                justifyContent: "center",
                minWidth: "28px",
                height: "28px",
                padding: "0 9px",
                borderRadius: "999px",
                fontSize: "12px",
                fontWeight: 800,
                ...countStyle("AVOID"),
              }}
            >
              {avoid.length}
            </div>
          </div>

          <div
            style={{
              fontSize: "12px",
              color: "#fda4af",
              marginBottom: "8px",
              fontWeight: 700,
              letterSpacing: "0.02em",
            }}
          >
            {summaryLabel("AVOID", avoid.length)}
          </div>

          <div
            style={{
              fontSize: "13px",
              color: listTone("AVOID"),
              lineHeight: 1.6,
            }}
          >
            {renderAssetList(avoid)}
          </div>
        </div>
      </div>
    </Card>
  );
}