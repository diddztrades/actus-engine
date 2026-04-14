export function badgeTone(value: string) {
  switch (value) {
    case "Bullish":
    case "Expansion":
    case "Trend Continuation":
    case "high":
      return {
        background: "rgba(16,185,129,0.18)",
        color: "#86efac",
        border: "1px solid rgba(16,185,129,0.28)",
      };

    case "Bearish":
    case "Disorder":
      return {
        background: "rgba(244,63,94,0.18)",
        color: "#fda4af",
        border: "1px solid rgba(244,63,94,0.28)",
      };

    case "Compression":
    case "Mean Reversion":
    case "medium":
      return {
        background: "rgba(251,191,36,0.16)",
        color: "#fde68a",
        border: "1px solid rgba(251,191,36,0.28)",
      };

    default:
      return {
        background: "rgba(255,255,255,0.08)",
        color: "white",
        border: "1px solid rgba(255,255,255,0.12)",
      };
  }
}

export function setupTone(value: number) {
  if (value >= 85) return "#86efac";
  if (value >= 70) return "#fde68a";
  return "#fda4af";
}