import type { AssetState, TimeFrame } from "../types/engine";
import { MiniChart } from "./MiniChart";

type CommandDeckProps = {
  asset: AssetState | null;
  timeframe: TimeFrame;
};

function formatAge(timestamp: number) {
  const diffMs = Date.now() - timestamp;
  const totalSeconds = Math.max(0, Math.floor(diffMs / 1000));
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;

  if (hours > 0) return hours + "h " + minutes + "m";
  if (minutes > 0) return minutes + "m";
  return seconds + "s";
}

function buildLevels(asset: AssetState) {
  const entry = asset.state === "avoid"
    ? asset.price * 0.994
    : asset.price * 1.002;

  const invalidation = asset.state === "avoid"
    ? asset.price * 1.006
    : asset.price * 0.994;

  return {
    entry: entry.toFixed(2),
    invalidation: invalidation.toFixed(2)
  };
}

function actionLabel(asset: AssetState) {
  if (asset.state === "execute") return asset.symbol;
  if (asset.state === "wait") return asset.symbol;
  return asset.symbol;
}

function deckHeadline(asset: AssetState) {
  if (asset.state === "execute") return "EXECUTE:";
  if (asset.state === "avoid") return "AVOID:";
  return "WAIT:";
}

function deckClass(state: AssetState["state"]) {
  if (state === "execute") return "command-deck execute";
  if (state === "avoid") return "command-deck avoid";
  return "command-deck wait";
}

export function CommandDeck({ asset, timeframe }: CommandDeckProps) {
  if (!asset) {
    return (
      <section className="panel command-deck wait">
        <div className="command-deck-left">
          <p className="command-label">What to do right now</p>
          <div className="command-headline-wrap">
            <h2 className="command-headline">WAIT:</h2>
            <span className="command-asset">No active lead</span>
          </div>
          <div className="command-metrics">
            <div className="command-metric">
              <span>Confidence</span>
              <strong>--</strong>
            </div>
            <div className="command-metric">
              <span>Time in state</span>
              <strong>--</strong>
            </div>
            <div className="command-metric command-metric-wide">
              <span>Reason</span>
              <strong>Await stronger alignment</strong>
            </div>
          </div>
        </div>

        <div className="command-deck-right">
          <div className="command-chart-empty">No lead asset</div>
        </div>
      </section>
    );
  }

  const levels = buildLevels(asset);

  return (
    <section className={deckClass(asset.state)}>
      <div className="command-deck-left">
        <p className="command-label">What to do right now</p>
        <div className="command-headline-wrap">
          <h2 className="command-headline">{deckHeadline(asset)}</h2>
          <span className="command-asset">{actionLabel(asset)}</span>
        </div>

        <div className="command-metrics">
          <div className="command-metric">
            <span>Confidence</span>
            <strong>{asset.confidence}%</strong>
          </div>
          <div className="command-metric">
            <span>Time in state</span>
            <strong>{formatAge(asset.stateEnteredAt)}</strong>
          </div>
          <div className="command-metric command-metric-wide">
            <span>Reason</span>
            <strong>{asset.reason}</strong>
          </div>
        </div>

        <p className="command-note">
          Decision based on trend strength, market tone, volatility and risk posture.
        </p>
      </div>

      <div className="command-deck-right">
        <div className="command-chart-top">
          <div className="command-chart-title">
            <strong>{asset.symbol}</strong>
            <span>{asset.price.toFixed(2)} &nbsp; {asset.changePct >= 0 ? "+" : ""}{asset.changePct.toFixed(2)}%</span>
          </div>

          <div className="command-chart-timeframes">
            <span className={timeframe === "1m" ? "tiny-pill active" : "tiny-pill"}>1m</span>
            <span className={timeframe === "5m" ? "tiny-pill active" : "tiny-pill"}>5m</span>
            <span className={timeframe === "15m" ? "tiny-pill active" : "tiny-pill"}>15m</span>
            <span className={timeframe === "1h" ? "tiny-pill active" : "tiny-pill"}>1h</span>
          </div>
        </div>

        <div className="command-chart-grid">
          <div className="command-chart-area">
            <MiniChart
              symbol={asset.symbol}
              price={asset.price}
              changePct={asset.changePct}
              state={asset.state}
              timeframe={timeframe}
              momentumScore={asset.momentumScore}
              riskScore={asset.riskScore}
            />
          </div>

          <div className="command-levels">
            <div className="command-level positive">
              <span>Entry</span>
              <strong>{levels.entry}</strong>
            </div>
            <div className="command-level negative">
              <span>Invalidation</span>
              <strong>{levels.invalidation}</strong>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}