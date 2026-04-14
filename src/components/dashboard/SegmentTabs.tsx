import { Button } from "../ui/Button";

type SegmentTabsProps = {
  value: string;
  onChange: (value: string) => void;
};

export function SegmentTabs({ value, onChange }: SegmentTabsProps) {
  const tabs = ["live", "watchlist", "macro"];

  return (
    <div
      style={{
        display: "inline-flex",
        gap: "8px",
        padding: "6px",
        marginBottom: "20px",
        borderRadius: "16px",
        border: "1px solid rgba(255,255,255,0.1)",
        background: "rgba(255,255,255,0.03)",
        backdropFilter: "blur(12px)",
      }}
    >
      {tabs.map((tab) => (
        <Button
          key={tab}
          active={value === tab}
          onClick={() => onChange(tab)}
        >
          {tab}
        </Button>
      ))}
    </div>
  );
}