import type {
  ActusDecisionCard,
  DecisionBucket,
  PublicBias,
  PublicStatus,
} from "./actusDecision";

export type DecisionTelemetryEntry = {
  symbol: string;
  name: string;
  bucket: DecisionBucket;
  quality: number;
  bias: PublicBias;
  status: PublicStatus;
  action: string;
  timestamp: number;
};

export type AssetDecisionTelemetrySummary = {
  symbol: string;
  name: string;
  currentBucket: DecisionBucket;
  currentQuality: number;
  currentBias: PublicBias;
  currentStatus: PublicStatus;
  last10Outcomes: DecisionBucket[];
  churnCount: number;
  stabilityScore: number;
  totalLoggedChanges: number;
  lastUpdated: number;
};

const MAX_TELEMETRY_ENTRIES = 500;

let telemetryStore: DecisionTelemetryEntry[] = [];

function sameDecisionState(
  previous: DecisionTelemetryEntry | undefined,
  next: ActusDecisionCard
) {
  if (!previous) return false;

  return (
    previous.bucket === next.bucket &&
    previous.quality === next.quality &&
    previous.bias === next.bias &&
    previous.status === next.status &&
    previous.action === next.action
  );
}

function buildEntry(card: ActusDecisionCard, timestamp: number): DecisionTelemetryEntry {
  return {
    symbol: card.symbol,
    name: card.name,
    bucket: card.bucket,
    quality: card.quality,
    bias: card.bias,
    status: card.status,
    action: card.action,
    timestamp,
  };
}

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

function computeChurnCount(outcomes: DecisionBucket[]) {
  let churn = 0;

  for (let i = 1; i < outcomes.length; i += 1) {
    if (outcomes[i] !== outcomes[i - 1]) {
      churn += 1;
    }
  }

  return churn;
}

function computeStabilityScore(outcomes: DecisionBucket[]) {
  if (outcomes.length <= 1) return 100;

  const churn = computeChurnCount(outcomes);
  const maxPossibleChurn = outcomes.length - 1;
  const rawScore = 100 - (churn / maxPossibleChurn) * 100;

  return Math.round(clamp(rawScore, 0, 100));
}

export function logDecisionTelemetry(cards: ActusDecisionCard[], timestamp = Date.now()) {
  const latestBySymbol = new Map<string, DecisionTelemetryEntry>();

  for (let i = telemetryStore.length - 1; i >= 0; i -= 1) {
    const entry = telemetryStore[i];
    if (!latestBySymbol.has(entry.symbol)) {
      latestBySymbol.set(entry.symbol, entry);
    }
  }

  const newEntries: DecisionTelemetryEntry[] = [];

  cards.forEach((card) => {
    const previous = latestBySymbol.get(card.symbol);

    if (!sameDecisionState(previous, card)) {
      newEntries.push(buildEntry(card, timestamp));
    }
  });

  if (!newEntries.length) {
    return telemetryStore;
  }

  telemetryStore = [...telemetryStore, ...newEntries].slice(-MAX_TELEMETRY_ENTRIES);
  return telemetryStore;
}

export function getDecisionTelemetry() {
  return [...telemetryStore];
}

export function getRecentDecisionTelemetry(limit = 50) {
  return telemetryStore.slice(-limit).reverse();
}

export function getLatestDecisionTelemetryBySymbol(symbol: string) {
  for (let i = telemetryStore.length - 1; i >= 0; i -= 1) {
    const entry = telemetryStore[i];
    if (entry.symbol === symbol) {
      return entry;
    }
  }

  return null;
}

export function getAssetDecisionTelemetrySummary(
  symbol: string
): AssetDecisionTelemetrySummary | null {
  const symbolEntries = telemetryStore.filter((entry) => entry.symbol === symbol);

  if (!symbolEntries.length) {
    return null;
  }

  const latest = symbolEntries[symbolEntries.length - 1];
  const last10Outcomes = symbolEntries.slice(-10).map((entry) => entry.bucket);

  return {
    symbol: latest.symbol,
    name: latest.name,
    currentBucket: latest.bucket,
    currentQuality: latest.quality,
    currentBias: latest.bias,
    currentStatus: latest.status,
    last10Outcomes: [...last10Outcomes],
    churnCount: computeChurnCount(last10Outcomes),
    stabilityScore: computeStabilityScore(last10Outcomes),
    totalLoggedChanges: symbolEntries.length,
    lastUpdated: latest.timestamp,
  };
}

export function getAllAssetDecisionTelemetrySummaries() {
  const latestSymbols = new Map<string, true>();

  for (let i = telemetryStore.length - 1; i >= 0; i -= 1) {
    latestSymbols.set(telemetryStore[i].symbol, true);
  }

  return Array.from(latestSymbols.keys())
    .map((symbol) => getAssetDecisionTelemetrySummary(symbol))
    .filter((summary): summary is AssetDecisionTelemetrySummary => summary !== null)
    .sort((a, b) => {
      if (b.stabilityScore !== a.stabilityScore) {
        return b.stabilityScore - a.stabilityScore;
      }

      return a.name.localeCompare(b.name);
    });
}

export function clearDecisionTelemetry() {
  telemetryStore = [];
}