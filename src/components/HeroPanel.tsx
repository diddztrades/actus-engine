type HeroPanelProps = {
  action: "EXECUTE" | "WAIT" | "AVOID";
  asset: string;
  confidence: number;
  minutesInState: number;
  reason: string;
  price: number;
  changePct: number;
  entry: number;
  invalidation: number;
  chart: number[];
};

function actionTone(action: HeroPanelProps["action"]) {
  if (action === "EXECUTE") {
    return {
      accent: "var(--execute)",
      glow: "rgba(61,220,151,0.16)",
      badgeBg: "rgba(61,220,151,0.12)",
      badgeBorder: "rgba(61,220,151,0.28)"
    };
  }

  if (action === "AVOID") {
    return {
      accent: "var(--avoid)",
      glow: "rgba(255,107,107,0.16)",
      badgeBg: "rgba(255,107,107,0.12)",
      badgeBorder: "rgba(255,107,107,0.28)"
    };
  }

  return {
    accent: "var(--wait)",
    glow: "rgba(245,194,91,0.16)",
    badgeBg: "rgba(245,194,91,0.12)",
    badgeBorder: "rgba(245,194,91,0.28)"
  };
}

function buildPath(points: number[], width: number, height: number) {
  const min = Math.min(...points);
  const max = Math.max(...points);
  const range = max - min || 1;

  return points
    .map((point, index) => {
      const x = (index / Math.max(points.length - 1, 1)) * width;
      const y = height - ((point - min) / range) * (height - 10) - 5;
      return `${x},${y}`;
    })
    .join(" ");
}

export function HeroPanel({
  action,
  asset,
  confidence,
  minutesInState,
  reason,
  price,
  changePct,
  entry,
  invalidation,
  chart
}: HeroPanelProps) {
  const tone = actionTone(action);
  const width = 420;
  const height = 132;
  const path = buildPath(chart, width, height);

  return (
    <section
      className="hero-command"
      style={{
        boxShadow: `0 0 0 1px ${tone.badgeBorder}, 0 0 32px ${tone.glow}`
      }}
    >
      <div className="hero-command__left">
        <div
          className="hero-command__icon"
          style={{
            color: tone.accent,
            borderColor: tone.badgeBorder,
            background: tone.badgeBg
          }}
        >
          ⦿
        </div>

        <div className="hero-command__copy">
          <div className="hero-command__eyebrow">WHAT TO DO RIGHT NOW</div>

          <div className="hero-command__headline">
            <span className="hero-command__action" style={{ color: tone.accent }}>
              {action}:
            </span>{" "}
            <span className="hero-command__asset" style={{ color: tone.accent }}>
              {asset.toUpperCase()}
            </span>
          </div>

          <div className="hero-command__stats">
            <div className="hero-command__stat">
              <span>Confidence</span>
              <strong>{confidence}%</strong>
            </div>

            <div className="hero-command__stat">
              <span>Time in state</span>
              <strong>{minutesInState}m</strong>
            </div>

            <div className="hero-command__stat hero-command__stat--reason">
              <span>Reason</span>
              <strong>{reason}</strong>
            </div>
          </div>

          <div className="hero-command__footnote">
            Decision based on trend strength, liquidity, macro regime and risk profile.
          </div>
        </div>
      </div>

      <div className="hero-command__right">
        <div className="hero-command__market-top">
          <div>
            <div className="hero-command__symbol">{asset.toUpperCase()}</div>
            <div className="hero-command__price">
              {price.toFixed(price < 10 ? 4 : 2)}{" "}
              <span className={changePct >= 0 ? "positive" : "negative"}>
                {changePct >= 0 ? "+" : ""}
                {changePct.toFixed(2)}%
              </span>
            </div>
          </div>

          <div className="hero-command__tf">
            <button className="hero-command__tf-btn hero-command__tf-btn--active" type="button">1m</button>
            <button className="hero-command__tf-btn" type="button">5m</button>
            <button className="hero-command__tf-btn" type="button">15m</button>
          </div>
        </div>

        <div className="hero-command__chart-wrap">
          <svg
            className="hero-command__chart"
            viewBox={`0 0 ${width} ${height}`}
            preserveAspectRatio="none"
          >
            <polyline
              fill="none"
              stroke={tone.accent}
              strokeWidth="3"
              strokeLinecap="round"
              strokeLinejoin="round"
              points={path}
            />
          </svg>

          <div className="hero-command__line hero-command__line--entry" />
          <div className="hero-command__line hero-command__line--invalid" />
        </div>

        <div className="hero-command__levels">
          <div className="hero-command__level">
            <span className="hero-command__dot hero-command__dot--entry" />
            <div>
              <div className="hero-command__level-label">Entry</div>
              <strong>{entry.toFixed(price < 10 ? 4 : 2)}</strong>
            </div>
          </div>

          <div className="hero-command__level">
            <span className="hero-command__dot hero-command__dot--invalid" />
            <div>
              <div className="hero-command__level-label">Invalid</div>
              <strong>{invalidation.toFixed(price < 10 ? 4 : 2)}</strong>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
