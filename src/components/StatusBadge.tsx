import type { DecisionState, TradeAction, SignalAge } from "../types/decision";

type StatusBadgeProps = {
  state?: DecisionState;
  action?: TradeAction;
  signalAge?: SignalAge | null;
  children?: React.ReactNode;
};

function humanizeAge(signalAge?: SignalAge | null) {
  if (signalAge === "just_entered") return "Just entered";
  if (signalAge === "active") return "Active";
  if (signalAge === "mature") return "Mature";
  if (signalAge === "expiring") return "Expiring";
  return "";
}

export function StatusBadge({ state, action, signalAge, children }: StatusBadgeProps) {
  const label =
    children ??
    (signalAge ? humanizeAge(signalAge) : action === "buy" ? "Buy" : action === "sell" ? "Sell" : "Wait");

  return <span className={`status-badge status-badge--${state ?? "wait"}`}>{label}</span>;
}
