import type { MacroCard } from "../../types/macro";
import { Card } from "../ui/Card";

type MacroGridProps = {
  items: MacroCard[];
};

export function MacroGrid({ items }: MacroGridProps) {
  return (
    <div
      style={{
        display: "grid",
        gap: "14px",
        gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
      }}
    >
      {items.map((card) => (
        <Card key={card.title}>
          <h3 style={{ margin: "0 0 8px 0", fontWeight: 600 }}>
            {card.title}
          </h3>
          <p style={{ margin: "0 0 6px 0", fontSize: "18px", color: "white" }}>
            {card.value}
          </p>
          <p
            style={{
              margin: 0,
              fontSize: "13px",
              color: "#a1a1aa",
              lineHeight: 1.6,
            }}
          >
            {card.desc}
          </p>
        </Card>
      ))}
    </div>
  );
}