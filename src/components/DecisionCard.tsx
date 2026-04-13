import { enhanceAsset } from "../decisionEngine";

export function DecisionCard({ asset }: any) {

  const a = enhanceAsset(asset);

  const color =
    a.action === "EXECUTE" ? "#3ddc97" :
    a.action === "AVOID" ? "#ff6b6b" :
    "#f5c25b";

  return (
    <div style={{
      border: `1px solid ${color}44`,
      borderRadius: 14,
      padding: 16,
      background: "#141414"
    }}>
      <div style={{ fontWeight: 700 }}>{a.name}</div>

      <div style={{ margin: "6px 0", fontSize: 18 }}>
        {a.price}
      </div>

      <div style={{ color, fontWeight: 800 }}>
        {a.action}
      </div>

      <div style={{ fontSize: 12, marginTop: 6 }}>
        Status: {a.status}
      </div>

      <div style={{ fontSize: 12 }}>
        Quality: {Math.round(a.quality)}
      </div>

      <div style={{ fontSize: 12, color: "#aaa", marginTop: 6 }}>
        {a.reason}
      </div>
    </div>
  );
}