import type { ActusOpportunityOutput } from "../domain/market/types";

export type ActusExecutionState =
  | "building"
  | "ready"
  | "active"
  | "too_late"
  | "weakening"
  | "exit_soon"
  | "invalidated";

export type ActusExecutionPosition = {
  side: "long" | "short";
  stop: number;
  active: boolean;
} | null;

export type ActusClosedExecution = {
  outcome: "completed" | "invalidated" | "exited-early";
} | null;

type DeriveExecutionStateOptions = {
  position?: ActusExecutionPosition;
  closedPosition?: ActusClosedExecution;
};

export function hasExecutionInvalidation(item: ActusOpportunityOutput, position?: ActusExecutionPosition) {
  if (item.state === "invalidated") {
    return true;
  }

  if (!position?.active) {
    return false;
  }

  if (position.side === "short") {
    return item.price >= position.stop;
  }

  return item.price <= position.stop;
}

function hasConfirmedReadyCriteria(item: ActusOpportunityOutput) {
  return (
    item.state === "building" &&
    item.direction !== "neutral" &&
    item.bias !== "neutral" &&
    item.bias !== "mixed" &&
    item.riskState === "clean" &&
    item.triggerQuality !== "none" &&
    item.triggerQuality !== "B" &&
    item.confidenceScore >= 72 &&
    item.freshnessState !== "aging" &&
    item.freshnessState !== "stale"
  );
}

export function deriveActusExecutionState(
  item: ActusOpportunityOutput,
  options: DeriveExecutionStateOptions = {},
): ActusExecutionState {
  const position = options.position ?? null;
  const closedPosition = options.closedPosition ?? null;

  if (closedPosition) {
    return closedPosition.outcome === "invalidated" ? "invalidated" : "too_late";
  }

  if (hasExecutionInvalidation(item, position)) {
    return "invalidated";
  }

  const active = Boolean(position?.active) || item.state === "execute";

  if (active) {
    if (item.state === "exhaustion" || item.tooLateFlag || item.freshnessState === "stale" || item.riskState === "late") {
      return "exit_soon";
    }

    if (
      item.action === "avoid" ||
      item.direction === "neutral" ||
      item.bias === "neutral" ||
      item.confidenceScore < 40 ||
      item.state === "balanced" ||
      item.state === "waiting"
    ) {
      return "exit_soon";
    }

    if (
      item.action !== "execute" ||
      item.freshnessState === "aging" ||
      item.riskState === "unstable" ||
      item.confidenceScore < 60 ||
      item.state === "watching" ||
      item.state === "building"
    ) {
      return "weakening";
    }

    return "active";
  }

  if (item.tooLateFlag || item.state === "exhaustion" || item.freshnessState === "stale" || item.riskState === "late") {
    return "too_late";
  }

  if (hasConfirmedReadyCriteria(item)) {
    return "ready";
  }

  return "building";
}

export function stabilizeExecutionTransition(
  previous: ActusExecutionState | undefined,
  next: ActusExecutionState,
): ActusExecutionState {
  if (!previous || previous === next) {
    return next;
  }

  if (previous === "invalidated") {
    return previous;
  }

  if (next === "invalidated") {
    return next;
  }

  if (previous === "exit_soon" && (next === "active" || next === "weakening")) {
    return previous;
  }

  if (previous === "exit_soon" && next === "ready") {
    return next;
  }

  if (previous === "too_late" && (next === "ready" || next === "building")) {
    return next;
  }

  return next;
}

export function isTrackableExecutionState(state: ActusExecutionState) {
  return state === "building" || state === "ready" || state === "active" || state === "weakening" || state === "exit_soon" || state === "too_late";
}

export function isExitExecutionState(state: ActusExecutionState) {
  return state === "exit_soon" || state === "too_late";
}

export function shouldAlertExecutionTransition(
  previous: ActusExecutionState | undefined,
  next: ActusExecutionState,
) {
  if (!previous || previous === next) {
    return false;
  }

  if (next === "invalidated") {
    return true;
  }

  return (
    (previous === "building" && next === "ready") ||
    (previous === "ready" && next === "active") ||
    (previous === "active" && next === "weakening") ||
    (previous === "active" && next === "exit_soon")
  );
}
