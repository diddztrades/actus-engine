import type { AssetCardData, DecisionState } from "../types/decision";
import { DecisionAssetCard } from "./DecisionAssetCard";

type DecisionColumnProps = {
  title: string;
  state: DecisionState;
  items: AssetCardData[];
};

export function DecisionColumn({ title, state, items }: DecisionColumnProps) {
  return (
    <section className={`decision-column decision-column--${state}`}>
      <div className="decision-column__header">
        <h3>{title}</h3>
        <span>{items.length}</span>
      </div>

      <div className="decision-column__body">
        {items.map((asset) => (
          <DecisionAssetCard key={asset.symbol} asset={asset} />
        ))}
      </div>
    </section>
  );
}
