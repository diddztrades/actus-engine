import { Sparkline } from "./Sparkline";

export function DecisionMiniCard({ item }: any) {
  return (
    <article className={`decision-mini-card ${item.state}`}>
      <div className="decision-mini-top">
        <div className="decision-mini-name">{item.name}</div>
        <div className={`decision-badge ${item.tone}`}>{item.actionText}</div>
      </div>

      <div className="decision-mini-price">{item.price}</div>
      <div className={item.changePct >= 0 ? "positive" : "negative"}>
        {item.changePct >= 0 ? "+" : ""}{item.changePct.toFixed(2)}%
      </div>

      <div className="decision-mini-meta">
        <div>
          <span>Confidence</span>
          <strong>{item.confidence}%</strong>
        </div>
        <div>
          <span>In state</span>
          <strong>{item.minutesInState}m</strong>
        </div>
      </div>

      <div className="decision-mini-submeta">
        <span>Quality {(item.quality ?? item.confidence)}%</span>
      </div>

      <div className="decision-mini-reason">{item.reason}</div>

      <div className="decision-mini-chart">
        <Sparkline points={item.sparkline} tone={item.state} />
      </div>
    </article>
  );
}