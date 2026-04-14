import type { AssetState } from "../types/engine";
import { ArrowDownRight, ArrowUpRight, Minus } from "lucide-react";

type AssetCardProps = {
  asset: AssetState;
};

function changeTone(changePct: number) {
  if (changePct > 0) return "positive";
  if (changePct < 0) return "negative";
  return "neutral";
}

function biasTone(bias: AssetState["bias"]) {
  if (bias === "bullish") return "positive";
  if (bias === "bearish") return "negative";
  return "neutral";
}

function stateTone(state: AssetState["state"]) {
  return state;
}

function formatAge(timestamp: number) {
  const diffMs = Date.now() - timestamp;
  const totalSeconds = Math.max(0, Math.floor(diffMs / 1000));
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;

  if (hours > 0) return hours + "h " + minutes + "m";
  if (minutes > 0) return minutes + "m " + seconds + "s";
  return seconds + "s";
}

export function AssetCard({ asset }: AssetCardProps) {
  const tone = changeTone(asset.changePct);

  return (
    <article className="panel asset-card">
      <div className="asset-header">
        <div>
          <p className="asset-symbol">{asset.symbol}</p>
          <h3>{asset.name}</h3>
        </div>
        <span className={`badge state-${stateTone(asset.state)}`}>{asset.state.toUpperCase()}</span>
      </div>

      <div className="asset-price-row">
        <div className="asset-price">{asset.price.toFixed(2)}</div>
        <div className={`asset-change ${tone}`}>
          {asset.changePct > 0 ? <ArrowUpRight size={15} /> : asset.changePct < 0 ? <ArrowDownRight size={15} /> : <Minus size={15} />}
          {asset.changePct.toFixed(2)}%
        </div>
      </div>

      <div className="asset-meta-grid">
        <div className="metric">
          <span>Bias</span>
          <strong className={biasTone(asset.bias)}>{asset.bias}</strong>
        </div>
        <div className="metric">
          <span>Confidence</span>
          <strong>{asset.confidence}</strong>
        </div>
        <div className="metric">
          <span>Momentum</span>
          <strong>{asset.momentumScore}</strong>
        </div>
        <div className="metric">
          <span>Risk</span>
          <strong>{asset.riskScore}</strong>
        </div>
      </div>

      <div className="asset-copy">
        <p className="asset-reason">{asset.reason}</p>
        <p className="asset-note">{asset.note}</p>
      </div>

      <div className="asset-footer">
        <span>{asset.timeframe} Â· {asset.session}</span>
        <span>In state: {formatAge(asset.stateEnteredAt)}</span>
      </div>
    </article>
  );
}