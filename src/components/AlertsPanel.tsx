import type { EngineAlert } from "../types/alerts";

type AlertsPanelProps = {
  alerts: EngineAlert[];
};

export function AlertsPanel({ alerts }: AlertsPanelProps) {
  return (
    <section className="panel">
      <div className="panel-header">
        <h2>Alerts</h2>
        <span className="panel-count">{alerts.length}</span>
      </div>

      <div className="stack">
        {alerts.length === 0 ? (
          <p className="empty-copy">No active alerts.</p>
        ) : (
          alerts.map((alert) => (
            <article className={`alert-card level-${alert.level}`} key={alert.id}>
              <div className="alert-card-header">
                <strong>{alert.title}</strong>
                {alert.symbol ? <span>{alert.symbol}</span> : null}
              </div>
              <p>{alert.detail}</p>
            </article>
          ))
        )}
      </div>
    </section>
  );
}