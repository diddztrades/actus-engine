type TopBarProps = {
  updatedAt: string;
  focusMode: boolean;
  onToggleFocus: () => void;
};

const timeframes = ["1m", "5m", "15m", "1h"];

export function TopBar({ updatedAt, focusMode, onToggleFocus }: TopBarProps) {
  return (
    <header className="topbar">
      <div className="topbar__brand">
        <div className="topbar__logo">A</div>
        <div>
          <div className="topbar__title">ACTUS OS</div>
          <div className="topbar__subtitle">Market Intelligence Command Layer</div>
        </div>
      </div>

      <div className="topbar__controls">
        <div className="pill-group">
          {timeframes.map((item, index) => (
            <button key={item} className={`pill ${index === 2 ? "pill--active" : ""}`} type="button">
              {item}
            </button>
          ))}
        </div>

        <button className={`pill ${focusMode ? "pill--active" : ""}`} type="button" onClick={onToggleFocus}>
          Focus: {focusMode ? "ON" : "MOST"}
        </button>
      </div>

      <div className="topbar__meta">
        <button className="icon-button" type="button">Help</button>
        <button className="icon-button" type="button">Settings</button>
        <button className="icon-button" type="button">Dark</button>
        <div className="updated-at">Updated: {updatedAt}</div>
      </div>
    </header>
  );
}
