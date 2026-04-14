type MiniChartProps = {
  symbol: string;
  price: number;
  changePct: number;
  state: "execute" | "wait" | "avoid";
  timeframe: "1m" | "5m" | "15m" | "1h";
  momentumScore: number;
  riskScore: number;
};

function seededSeries(seedText: string, basePrice: number, timeframe: MiniChartProps["timeframe"]) {
  const tfMultiplier =
    timeframe === "1m" ? 0.35 :
    timeframe === "5m" ? 0.6 :
    timeframe === "15m" ? 1 :
    1.6;

  let seed = 0;
  for (let i = 0; i < seedText.length; i += 1) {
    seed = (seed * 31 + seedText.charCodeAt(i)) % 2147483647;
  }

  const values: number[] = [];
  let current = basePrice * 0.992;

  for (let i = 0; i < 28; i += 1) {
    seed = (seed * 48271) % 2147483647;
    const rand = seed / 2147483647;
    const step = (rand - 0.5) * tfMultiplier * basePrice * 0.003;
    current = current + step;
    values.push(current);
  }

  return values;
}

function buildPoints(values: number[], width: number, height: number) {
  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = max - min || 1;

  return values
    .map((value, index) => {
      const x = (index / (values.length - 1)) * width;
      const y = height - ((value - min) / range) * height;
      return `${x},${y}`;
    })
    .join(" ");
}

export function MiniChart({
  symbol,
  price,
  changePct,
  state,
  timeframe,
  momentumScore,
  riskScore
}: MiniChartProps) {
  const width = 320;
  const height = 92;
  const values = seededSeries(symbol + timeframe, price, timeframe);
  const points = buildPoints(values, width, height);

  const colorClass =
    changePct > 0 ? "chart-line up" :
    changePct < 0 ? "chart-line down" :
    "chart-line flat";

  const upperGuide = 28 + Math.max(0, (70 - Math.min(riskScore, 70)) * 0.45);
  const lowerGuide = 64 - Math.max(0, (Math.min(momentumScore, 80) - 40) * 0.28);

  const stateClass =
    state === "execute" ? "chart-state-execute" :
    state === "avoid" ? "chart-state-avoid" :
    "chart-state-wait";

  return (
    <div className={`mini-chart ${stateClass}`}>
      <svg viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="none" className="mini-chart-svg">
        <line x1="0" x2={width} y1={upperGuide} y2={upperGuide} className="chart-guide-positive" />
        <line x1="0" x2={width} y1={lowerGuide} y2={lowerGuide} className="chart-guide-negative" />
        <polyline points={points} fill="none" className={colorClass} />
      </svg>
    </div>
  );
}