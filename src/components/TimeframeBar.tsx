import type { TimeFrame } from "../types/engine";

type TimeframeBarProps = {
  value: TimeFrame;
  onChange: (value: TimeFrame) => void;
};

const options: TimeFrame[] = ["1m", "5m", "15m", "1h"];

export function TimeframeBar({ value, onChange }: TimeframeBarProps) {
  return (
    <div className="toolbar-group">
      <span className="toolbar-label">Timeframe</span>
      <div className="segmented-control">
        {options.map((option) => (
          <button
            key={option}
            type="button"
            className={option === value ? "segmented-button active" : "segmented-button"}
            onClick={() => onChange(option)}
          >
            {option}
          </button>
        ))}
      </div>
    </div>
  );
}