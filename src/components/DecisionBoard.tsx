import type { DecisionBoardState, DecisionColumn } from "../types/decision";

type DecisionBoardProps = {
  board: DecisionBoardState;
};

function Column({ column }: { column: DecisionColumn }) {
  return (
    <div className="decision-column">
      <div className="decision-column-header">
        <h3>{column.title}</h3>
        <span>{column.items.length}</span>
      </div>

      <div className="decision-stack">
        {column.items.length === 0 ? (
          <div className="decision-item empty">No assets</div>
        ) : (
          column.items.map((item) => (
            <article className="decision-item" key={item.symbol}>
              <div className="decision-item-top">
                <strong>{item.symbol}</strong>
                <span>{item.durationLabel}</span>
              </div>
              <p>{item.name}</p>
              <small>{item.note}</small>
            </article>
          ))
        )}
      </div>
    </div>
  );
}

export function DecisionBoard({ board }: DecisionBoardProps) {
  return (
    <section className="panel">
      <div className="panel-header">
        <h2>Decision board</h2>
      </div>

      <div className="decision-grid">
        <Column column={board.execute} />
        <Column column={board.wait} />
        <Column column={board.avoid} />
      </div>
    </section>
  );
}