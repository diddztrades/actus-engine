import type { AlertItem, InsightItem, MacroItem, ReplayItem, RankedItem } from "../types/decision";

type RightRailProps = {
  macro: MacroItem[];
  alerts: AlertItem[];
  insights: InsightItem[];
  replay: ReplayItem[];
  winRate: number;
  totalClosed: number;
  ranked?: RankedItem[];
};

function formatAlertAge(secondsAgo: number) {
  if (secondsAgo < 60) return `${secondsAgo}s ago`;
  const mins = Math.floor(secondsAgo / 60);
  return `${mins}m ago`;
}

export function RightRail({ macro, alerts, insights, replay, winRate, totalClosed, ranked = [] }: RightRailProps) {
  return (
    <aside className="right-rail">
      <section className="rail-card">
        <div className="rail-card__title">Macro Regime</div>
        <div className="macro-list">
          {macro.map((item) => (
            <div className="macro-row" key={item.label}>
              <span>{item.label}</span>
              <strong>{item.value}</strong>
            </div>
          ))}
        </div>
      </section>

      <section className="rail-card">
        <div className="rail-card__title">Performance</div>
        <div className="performance-box">
          <div>
            <span>Win Rate</span>
            <strong>{winRate}%</strong>
          </div>
          <div>
            <span>Closed</span>
            <strong>{totalClosed}</strong>
          </div>
        </div>
      </section>

      <section className="rail-card">
        <div className="rail-card__title">Ranked Opportunities</div>
        <div className="ranked-list">
          {ranked.map((item, index) => (
            <div key={`${item.label}-${index}`} className="ranked-row">
              <span>{item.label}</span>
              <div className="ranked-row__right">
                <span className={`ranked-badge ranked-badge--${item.state}`}>{item.state.toUpperCase()}</span>
                <strong>{item.score}</strong>
              </div>
            </div>
          ))}
        </div>
      </section>

      <section className="rail-card">
        <div className="rail-card__title">Alerts</div>
        <div className="alerts-list">
          {alerts.map((alert, index) => (
            <div key={`${alert.asset}-${alert.secondsAgo}`} className={`alert-item ${index === 0 ? "alert-item--primary" : ""}`}>
              <div className="alert-item__top">
                <span>{alert.title}</span>
                <strong>{formatAlertAge(alert.secondsAgo)}</strong>
              </div>
              <div className="alert-item__asset">
                {alert.asset} → {alert.state.toUpperCase()}
              </div>
              <div className="alert-item__detail">{alert.detail}</div>
            </div>
          ))}
        </div>
      </section>

      <section className="rail-card">
        <div className="rail-card__title">Replay</div>
        <div className="replay-list">
          {replay.map((item, index) => (
            <div key={`${item.symbol}-${index}`} className="replay-row">
              <div className="replay-row__left">
                <strong>{item.symbol}</strong>
                <span>{item.state.toUpperCase()}</span>
              </div>
              <div className={`replay-badge replay-badge--${item.outcome}`}>{item.outcome.toUpperCase()}</div>
            </div>
          ))}
        </div>
      </section>

      <section className="rail-card">
        <div className="rail-card__title">Insights</div>
        <div className="insights-list">
          {insights.map((item) => (
            <div key={item.label} className="insight-row">
              <strong>{item.label}</strong>
              <span>{item.detail}</span>
            </div>
          ))}
        </div>
      </section>
    </aside>
  );
}
