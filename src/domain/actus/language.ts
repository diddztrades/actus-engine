export const ACTUS_PRODUCT_LANGUAGE = {
  brand: "ACTUS OS",
  engine: "ACTUS CORE",
  topBar: "Market Decision Engine",
  heroLabel: "What matters now",
  boardLabel: "Opportunity board",
  macroLabel: "Macro overlay",
  alertsLabel: "Alerts",
  rankingLabel: "Ranked opportunities",
  gridLabel: "Asset grid",
  actions: {
    execute: "Act with discipline",
    wait: "Wait for confirmation",
    avoid: "Stand aside",
  },
  states: {
    reclaim: "Reclaim",
    rejection: "Rejection",
    breakout: "Breakout",
    "failed-breakout": "Failed breakout",
    continuation: "Continuation",
    exhaustion: "Exhaustion",
    sweep: "Sweep",
    balanced: "Balanced",
  },
} as const;

export function toHeadlineCase(value: string) {
  return value
    .split("-")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}
