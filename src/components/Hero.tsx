import { enhanceAsset } from "../decisionEngine";

export function Hero({ asset }: any) {
  if (!asset) return null;

  const a = enhanceAsset(asset);

  const color =
    a.action === "EXECUTE" ? "#3ddc97" :
    a.action === "AVOID" ? "#ff6b6b" :
    "#f5c25b";

  return (
    <div style={{
      padding: 30,
      borderRadius: 20,
      border: "1px solid rgba(255,255,255,0.08)",
      background: "linear-gradient(135deg,#0b1a2a,#08101a)"
    }}>
      <div style={{ fontSize: 12, color: "#888" }}>
        WHAT TO DO RIGHT NOW
      </div>

      <div style={{
        fontSize: 38,
        fontWeight: 900,
        color,
        marginTop: 10
      }}>
        {a.action}: {a.name}
      </div>

      <div style={{ marginTop: 20 }}>
        <div>Confidence: {a.confidence}%</div>
        <div>Quality: {Math.round(a.quality)}</div>
        <div>Status: {a.status}</div>
      </div>

      <div style={{ marginTop: 10, color: "#aaa" }}>
        {a.reason}
      </div>
    </div>
  );
}