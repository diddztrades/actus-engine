import { ENV } from "../config/env";

export type BackendCard = {
  name: string;
  symbol: string;
  timeframe?: "1m" | "5m" | "15m" | "1h";
  price: number;
  changePercent: number;
  bias: "LONG" | "SHORT";
  status: string;
  action: "EXECUTE" | "WAIT" | "AVOID";
  quality: "A+" | "A" | "B" | "C";
  stateAge: number;
  currentState?: "Waiting" | "Watching" | "Building" | "Execute" | "Exhaustion" | "Invalidated";
  stateConfidence?: number;
  freshnessState?: "fresh" | "aging" | "stale";
  freshnessScore?: number;
  decayWarning?: string | null;
  invalidationWarning?: string | null;
  tooLateFlag?: boolean;
  reasons?: string[];
  stateDebug?: {
    rawStateInputs?: Record<string, string | number | boolean | null>;
    baseScore?: number;
    chosenState?: string;
    stateConfidence?: number;
    freshnessState?: "fresh" | "aging" | "stale";
    freshnessScore?: number;
    tooLateFlag?: boolean;
    topReasons?: string[];
  };
  debugState?: {
    rawStateInputs?: Record<string, string | number | boolean | null> | null;
    chosenState?: string | null;
    stateConfidence?: number | null;
    freshnessState?: "fresh" | "aging" | "stale" | null;
    freshnessScore?: number | null;
    tooLateFlag?: boolean | null;
    topReasons?: string[];
  };
  entry: number;
  support: number;
  rsi: number;
  momentum: number;
  priceLevel: number;
  greenLine: number;
  redLine: number;
  sparkline?: number[];
  latestBar?: {
    open: number;
    high: number;
    low: number;
    close: number;
  };
};

export type CardsPayload = {
  ok: boolean;
  mode: string;
  timeframe?: "1m" | "5m" | "15m" | "1h";
  cards: BackendCard[];
  warning?: string | null;
  cacheAgeMs?: number | null;
  assetCount?: number;
};

export type HealthPayload = {
  ok: boolean;
  source: string;
  massiveConfigured: boolean;
  timeframe?: "1m" | "5m" | "15m" | "1h";
  cacheAgeMs?: number | null;
  mode: string;
  warning?: string | null;
  assetCount?: number;
  cachedSymbols?: string[];
};

const API_BASE = (ENV.API_URL || "http://localhost:3001").replace(/\/$/, "");

type FetchResult<T> = {
  payload: T | null;
  status: number | null;
  rateLimited: boolean;
  errorMessage?: string | null;
};

function wait(ms: number) {
  return new Promise((resolve) => window.setTimeout(resolve, ms));
}

async function fetchJsonWithRetry<T>(url: string): Promise<FetchResult<T>> {
  const retryDelays = [0, 450, 1100];
  let lastStatus: number | null = null;
  let lastMessage: string | null = null;

  for (let attempt = 0; attempt < retryDelays.length; attempt += 1) {
    if (retryDelays[attempt] > 0) {
      await wait(retryDelays[attempt]);
    }

    try {
      const res = await fetch(url);
      lastStatus = res.status;

      if (res.ok) {
        return {
          payload: (await res.json()) as T,
          status: res.status,
          rateLimited: false,
          errorMessage: null,
        };
      }

      const text = await res.text().catch(() => "");
      lastMessage = text || `Request failed with ${res.status}`;

      if (res.status !== 429) {
        break;
      }
    } catch (error) {
      lastMessage = error instanceof Error ? error.message : "Network request failed";
      break;
    }
  }

  return {
    payload: null,
    status: lastStatus,
    rateLimited: lastStatus === 429,
    errorMessage: lastMessage,
  };
}

export async function fetchCardsPayload(
  timeframe: "1m" | "5m" | "15m" | "1h",
  options?: { force?: boolean },
): Promise<FetchResult<CardsPayload>> {
  const url = new URL(`${API_BASE}/api/actus/cards`);
  url.searchParams.set("timeframe", timeframe);
  if (options?.force) {
    url.searchParams.set("force", "true");
  }
  return fetchJsonWithRetry<CardsPayload>(url.toString());
}

export async function fetchHealthPayload(timeframe: "1m" | "5m" | "15m" | "1h"): Promise<FetchResult<HealthPayload>> {
  return fetchJsonWithRetry<HealthPayload>(`${API_BASE}/api/health?timeframe=${encodeURIComponent(timeframe)}`);
}
