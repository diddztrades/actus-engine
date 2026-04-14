import { Sparkline } from "./Sparkline";

export function LowerGrid({ items }: any) {
  return (
    <section className="lower-grid-shell">
      <div className="lower-grid">
        {items.map((item: any) => (
          <article className={`lower-card ${item.state}`} key={item.symbol}>
            <div className="lower-top">
              <div className="lower-name">{item.name}</div>
              <div className={`decision-badge ${item.state === "execute" ? "buy" : item.state === "avoid" ? "sell" : "neutral"}`}>
                {item.state.toUpperCase()}
              </div>
            </div>

            <div className="lower-price">{item.price}</div>
            <div className={item.changePct >= 0 ? "positive" : "negative"}>
              {item.changePct >= 0 ? "+" : ""}{item.changePct.toFixed(2)}%
            </div>

            <div className="lower-chart-wrap">
              <Sparkline points={item.sparkline} tone={item.state} />
              <div className="lower-guide lower-guide-entry" />
              <div className="lower-guide lower-guide-invalid" />
            </div>

            <div className="lower-meta">
              <span>Conf {item.confidence}%</span>
              <span>In state {item.minutesInState}m</span>
            </div>
          </article>
        ))}
      </div>
    </section>
  );
}