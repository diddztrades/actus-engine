import { DecisionCard } from "./DecisionCard";

export function Column({ title, items, color }: any) {
  return (
    <div style={{
      flex: 1,
      padding: 14,
      borderRadius: 14,
      border: "1px solid rgba(255,255,255,0.06)",
      background: "#0f1726"
    }}>
      <h2 style={{ color }}>{title} ({items.length})</h2>

      <div style={{ display: "grid", gap: 10 }}>
        {items.map((a: any) => (
          <DecisionCard key={a.symbol} asset={a} />
        ))}
      </div>
    </div>
  );
}