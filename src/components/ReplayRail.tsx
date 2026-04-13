export function ReplayRail({ replay }: any) {
  return (
    <section className="rail-card">
      <div className="rail-head">
        <h3>Replay</h3>
        <span className="tiny-tag">Recent</span>
      </div>

      <div className="replay-list">
        {replay.map((item: any, index: number) => (
          <div className="replay-row" key={item.symbol + index}>
            <div className="replay-left">
              <strong>{item.symbol}</strong>
              <span>{item.state.toUpperCase()}</span>
            </div>

            <div className={`replay-outcome ${item.outcome}`}>
              {item.outcome.toUpperCase()}
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}