import type { FocusMode } from "../types/engine";

type FocusToggleProps = {
  value: FocusMode;
  onChange: (value: FocusMode) => void;
};

const options: Array<{ label: string; value: FocusMode }> = [
  { label: "All", value: "all" },
  { label: "Execute", value: "execute" },
  { label: "Active", value: "active" }
];

export function FocusToggle({ value, onChange }: FocusToggleProps) {
  return (
    <div className="toolbar-group">
      <span className="toolbar-label">Focus mode</span>
      <div className="segmented-control">
        {options.map((option) => (
          <button
            key={option.value}
            type="button"
            className={option.value === value ? "segmented-button active" : "segmented-button"}
            onClick={() => onChange(option.value)}
          >
            {option.label}
          </button>
        ))}
      </div>
    </div>
  );
}