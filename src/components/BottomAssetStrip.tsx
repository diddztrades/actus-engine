import type { AssetCardData } from "../types/decision";
import { DecisionAssetCard } from "./DecisionAssetCard";

type BottomAssetStripProps = {
  assets: AssetCardData[];
};

export function BottomAssetStrip({ assets }: BottomAssetStripProps) {
  return (
    <section className="bottom-strip">
      {assets.map((asset) => (
        <DecisionAssetCard key={asset.symbol} asset={asset} compact />
      ))}
    </section>
  );
}
