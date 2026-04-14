import type { HeroDecisionData } from "../types/decision";
import { Sparkline } from "./Sparkline";
import { StatusBadge } from "./StatusBadge";

type HeroDecisionPanelProps = {
  decision: HeroDecisionData;
};

function formatAction(action: HeroDecisionData["action"]) {
  if (action === "buy") return "BUY NOW";
  if (action === "sell") return "SELL NOW";
  return "WAIT";
}

function getState(action: HeroDecisionData["action"]) {
  if (action === "buy") return "execute";
  if (action === "sell") return "avoid";
  return "wait";
}

export function HeroDecisionPanel({ decision }: HeroDecisionPanelProps) {
  const state = getState(decision.action);

  return (
    <section className={`hero hero--${state}`}>
      <div className="hero__copy">
        <div className="hero__eyebrow">{decision.headline}</div>
        <div className="hero__mainline">
          {decision.asset ? (
            <>
              <span className="hero__command">{decision.action === "buy" ? "EXECUTE" : decision.action === "sell" ? "AVOID" : "WAIT"}:</span>
              <span className="hero__asset"> {decision.asset}</span>
            </>
          ) : (
            "NO VALID TRADES RIGHT NOW"
          )}
        </div>

        <div className="hero__stats hero__stats--four">
          <div className="hero__stat">
            <span className="hero__stat-label">Confidence</span>
            <strong>{decision.confidence ?? "--"}%</strong>
          </div>
          <div className="hero__stat">
            <span className="hero__stat-label">Time in state</span>
            <strong>{decision.minutesInState ?? "--"}m</strong>
          </div>
          <div className="hero__stat">
            <span className="hero__stat-label">Win Rate</span>
            <strong>{decision.winRate ?? "--"}%</strong>
          </div>
          <div className="hero__stat hero__stat--wide">
            <span className="hero__stat-label">Reason</span>
            <strong>{decision.reason}</strong>
          </div>
        </div>

        <div className="hero__footer">
          <StatusBadge state={state} signalAge={decision.signalAge} />
          <button className={`action-button action-button--${state}`} type="button">
            {formatAction(decision.action)}
          </button>
        </div>
      </div>

      <div className="hero__chart-card">
        <div className="hero__chart-topline">
          <div>
            <div className="hero__chart-asset">{decision.asset ?? "No Asset"}</div>
            <div className="hero__chart-price">
              {decision.price?.toFixed(2) ?? "--"}
              <span className={decision.changePct && decision.changePct >= 0 ? "positive" : "negative"}>
                {" "}
                {decision.changePct && decision.changePct >= 0 ? "+" : ""}
                {decision.changePct?.toFixed(2) ?? "--"}%
              </span>
            </div>
          </div>
          <div className="hero__levels">
            <div>Entry {decision.entry?.toFixed(2) ?? "--"}</div>
            <div>Invalid {decision.invalidation?.toFixed(2) ?? "--"}</div>
          </div>
        </div>

        <div className="hero__chart-wrap">
          <Sparkline points={decision.chart} state={state} height={110} />
          <div className="hero__line hero__line--entry" />
          <div className="hero__line hero__line--invalid" />
        </div>
      </div>
    </section>
  );
}
