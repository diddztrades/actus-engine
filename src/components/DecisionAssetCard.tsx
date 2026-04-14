import type { AssetCardData } from "../types/decision";
import { ConfidenceMeter } from "./ConfidenceMeter";
import { Sparkline } from "./Sparkline";
import { StatusBadge } from "./StatusBadge";

type DecisionAssetCardProps = {
  asset: AssetCardData;
  compact?: boolean;
};

export function DecisionAssetCard({ asset, compact = false }: DecisionAssetCardProps) {
  return (
    <article className={`asset-card asset-card--${asset.state} ${compact ? "asset-card--compact" : ""}`}>
      <div className="asset-card__header">
        <div>
          <div className="asset-card__symbol">{asset.name}</div>
          <div className="asset-card__price">{asset.price}</div>
        </div>
        <StatusBadge state={asset.state} action={asset.action}>
          {asset.action === "buy" ? "Buy" : asset.action === "sell" ? "Sell" : "Wait"}
        </StatusBadge>
      </div>

      <div className={`asset-card__change ${asset.changePct >= 0 ? "positive" : "negative"}`}>
        {asset.changePct >= 0 ? "+" : ""}
        {asset.changePct.toFixed(2)}%
      </div>

      <div className="asset-card__chart">
        <Sparkline points={asset.sparkline} state={asset.state} height={compact ? 40 : 52} />
      </div>

      <div className="asset-card__meta">
        <div>
          <span className="asset-card__meta-label">Confidence</span>
          <strong>{asset.confidence}%</strong>
        </div>
        <div>
          <span className="asset-card__meta-label">In state</span>
          <strong>{asset.minutesInState}m</strong>
        </div>
      </div>

      {!compact && asset.reason ? <div className="asset-card__reason">{asset.reason}</div> : null}

      <ConfidenceMeter value={asset.confidence} />
    </article>
  );
}
