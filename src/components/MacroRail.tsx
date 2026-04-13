import { ReplayRail } from "./ReplayRail";

export function MacroRail({ macroRegime, macro, ranked, alerts, insights, replay }: any) {
  return (
    <aside className="right-rail">
      <section className="rail-card">
        <div className="rail-head">
          <h3>Macro Regime</h3>
          <span className="tiny-tag">{macroRegime}</span>
        </div>

        <div className="macro-list">
          {macro.map((item: any) => (
            <div className="macro-row" key={item.label}>
              <div className="macro-left">
                <span className="macro-icon">{item.icon}</span>
                <span>{item.label}</span>
              </div>
              <strong className={item.tone}>{item.value}</strong>
            </div>
          ))}
        </div>
      </section>

      <section className="rail-card">
        <div className="rail-head">
          <h3>Ranked Opportunities</h3>
          <span className="view-all">View All</span>
        </div>

        <div className="ranked-list">
          {ranked.map((item: any) => (
            <div className="ranked-row" key={item.rank}>
              <div className="ranked-left">
                <span className="rank-number">{item.rank}</span>
                <span>{item.label}</span>
              </div>
              <div className="ranked-right">
                <span className={`rank-state ${item.state}`}>{item.state.toUpperCase()}</span>
                <span className="rank-score">{item.score}</span>
              </div>
            </div>
          ))}
        </div>
      </section>

      <section className="rail-card">
        <div className="rail-head">
          <h3>Alerts</h3>
          <span className="tiny-tag danger">1 New</span>
        </div>

        <div className="alerts-list">
          {alerts.map((item: any, index: number) => (
            <div className={`alert-row ${index === 0 ? "critical" : ""}`} key={item.title + index}>
              <div className="alert-top">
                <strong>{item.title}</strong>
                <span>{item.age}</span>
              </div>
              <div className="alert-detail">{item.detail}</div>
              {item.subdetail ? <div className="alert-subdetail">{item.subdetail}</div> : null}
            </div>
          ))}
        </div>
      </section>

      <ReplayRail replay={replay} />

      <section className="rail-card">
        <div className="rail-head">
          <h3>Insights</h3>
        </div>

        <div className="insights-list">
          {insights.map((item: any) => (
            <div className="insight-row" key={item.title}>
              <div className="insight-icon">{item.icon}</div>
              <div>
                <strong>{item.title}</strong>
                <div>{item.text}</div>
              </div>
            </div>
          ))}
        </div>
      </section>
    </aside>
  );
}