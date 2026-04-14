type SparklineProps = {
  points: number[];
  state?: "execute" | "wait" | "avoid";
  tone?: "execute" | "wait" | "avoid";
  height?: number;
};

function getStroke(state?: "execute" | "wait" | "avoid") {
  if (state === "execute") return "#3ddc97";
  if (state === "avoid") return "#ff6b6b";
  return "#f5c25b";
}

export function Sparkline({ points, state, tone, height = 56 }: SparklineProps) {
  const activeTone = tone ?? state;
  const width = 240;
  const min = Math.min(...points);
  const max = Math.max(...points);
  const range = max - min || 1;

  const path = points
    .map((point, index) => {
      const x = (index / Math.max(points.length - 1, 1)) * width;
      const y = height - ((point - min) / range) * (height - 8) - 4;
      return `${x},${y}`;
    })
    .join(" ");

  return (
    <svg className="sparkline" viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="none">
      <polyline
        fill="none"
        stroke={getStroke(activeTone)}
        strokeWidth="2.25"
        strokeLinecap="round"
        strokeLinejoin="round"
        points={path}
      />
    </svg>
  );
}
