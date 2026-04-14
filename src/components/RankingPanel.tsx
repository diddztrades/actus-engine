import type { RankingItem } from "../types/ranking";

type RankingPanelProps = {
  ranking: RankingItem[];
};

export function RankingPanel({ ranking }: RankingPanelProps) {
  return (
    <section className="panel">
      <div className="panel-header">
        <h2>Ranked opportunities</h2>
      </div>

      <div className="stack">
        {ranking.map((item, index) => (
          <div className="ranking-row" key={item.symbol}>
            <div className="ranking-left">
              <span className="ranking-index">{index + 1}</span>
              <div>
                <strong>{item.symbol}</strong>
                <p>{item.note}</p>
              </div>
            </div>
            <div className="ranking-right">
              <span className={`badge state-${item.state}`}>{item.state}</span>
              <strong>{item.score}</strong>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}