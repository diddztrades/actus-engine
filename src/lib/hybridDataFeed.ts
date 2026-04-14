import { fetchCardsPayload, fetchHealthPayload, type BackendCard } from "../services/marketData";
import type { HybridContext } from "./hybridEngine";

type FeedMode = "live";

type FeedStatus = {
  mode: FeedMode;
  source: "remote";
  healthy: boolean;
  lastUpdated: number | null;
  error: string | null;
  warning: string | null;
  isRateLimited?: boolean;
  cacheAgeMs: number | null;
  assetCount: number;
  timeframe: "1m" | "5m" | "15m" | "1h";
};

const FEED_MODE: FeedMode = "live";

const cachedContextsByTimeframe: Partial<Record<FeedStatus["timeframe"], HybridContext[]>> = {};
const cachedBackendCardsByTimeframe: Partial<Record<FeedStatus["timeframe"], BackendCard[]>> = {};
const feedStatusByTimeframe: Partial<Record<FeedStatus["timeframe"], FeedStatus>> = {};

const defaultFeedStatus: FeedStatus = {
  mode: FEED_MODE,
  source: "remote",
  healthy: false,
  lastUpdated: null,
  error: "Live backend cards feed is not initialized.",
  warning: null,
  isRateLimited: false,
  cacheAgeMs: null,
  assetCount: 0,
  timeframe: "5m",
};

feedStatusByTimeframe["5m"] = defaultFeedStatus;

function isRateLimitMessage(value: string | null | undefined) {
  if (!value) return false;
  return /429|rate limit|too many requests/i.test(value);
}

function userFacingFeedMessage(message: string | null | undefined, fallback: string) {
  if (isRateLimitMessage(message)) {
    return "Rate limit reached, retrying.";
  }
  if (!message) {
    return fallback;
  }
  return "Data temporarily unavailable.";
}

function logFeedError(scope: string, detail: unknown) {
  console.error(`[ACTUS][${scope}]`, detail);
}

function round(value: number, digits = 4) {
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}

function inferAsset(symbol: string) {
  const normalized = symbol.toUpperCase();

  if (normalized.includes("BTC")) return { asset: "BTC", timeframe: "15m" as const };
  if (normalized.includes("ETH")) return { asset: "ETH", timeframe: "15m" as const };
  if (normalized.includes("SOL")) return { asset: "SOL", timeframe: "15m" as const };
  if (normalized.includes("EUR")) return { asset: "EURUSD", timeframe: "15m" as const };
  if (normalized.includes("XAU") || normalized.includes("GLD") || normalized.includes("GOLD")) {
    return { asset: "XAU", timeframe: "5m" as const };
  }
  if (normalized === "NQ" || normalized.includes("QQQ") || normalized.includes("NDX")) {
    return { asset: "NQ", timeframe: "5m" as const };
  }
  if (normalized.includes("CL") || normalized.includes("USO") || normalized.includes("OIL")) {
    return { asset: "OIL", timeframe: "5m" as const };
  }

  return { asset: normalized, timeframe: "15m" as const };
}

function buildContextFromCard(card: BackendCard): HybridContext | null {
  if (!Number.isFinite(card.price) || card.price <= 0) {
    return null;
  }

  const inferred = inferAsset(card.symbol);
  const asset = inferred.asset;
  const timeframe = card.timeframe ?? inferred.timeframe;
  const price = round(card.price, asset === "EURUSD" ? 5 : 2);
  const lineA = round(card.greenLine, asset === "EURUSD" ? 5 : 2);
  const lineB = round(card.redLine, asset === "EURUSD" ? 5 : 2);
  const support = round(card.support, asset === "EURUSD" ? 5 : 2);
  const entry = round(card.entry, asset === "EURUSD" ? 5 : 2);
  const open = round(card.latestBar?.open ?? price / (1 + card.changePercent / 100 || 1), asset === "EURUSD" ? 5 : 2);
  const high = round(card.latestBar?.high ?? Math.max(price, open, lineA, lineB, entry), asset === "EURUSD" ? 5 : 2);
  const low = round(card.latestBar?.low ?? Math.max(0.00001, Math.min(price, open, lineA, lineB, support)), asset === "EURUSD" ? 5 : 2);
  const ema50 = round((lineA + lineB) / 2, asset === "EURUSD" ? 5 : 2);
  const aboveEma50 = price >= ema50;
  const belowEma50 = price < ema50;
  const asiaHigh = round(Math.max(high, lineA), asset === "EURUSD" ? 5 : 2);
  const asiaLow = round(Math.min(low, lineB), asset === "EURUSD" ? 5 : 2);
  const range = Math.max(high - low, Math.max(price * 0.0025, asset === "EURUSD" ? 0.0004 : 0.4));

  return {
    asset,
    timeframe,
    price: { open, high, low, close: price },
    ema50,
    asiaHigh,
    asiaLow,
    londonHigh: round(asiaHigh - range * 0.12, asset === "EURUSD" ? 5 : 2),
    londonLow: round(asiaLow + range * 0.12, asset === "EURUSD" ? 5 : 2),
    nyOpenRangeHigh: round(price + range * 0.16, asset === "EURUSD" ? 5 : 2),
    nyOpenRangeLow: round(price - range * 0.16, asset === "EURUSD" ? 5 : 2),
    firstHourHigh: round(price + range * 0.22, asset === "EURUSD" ? 5 : 2),
    firstHourLow: round(price - range * 0.22, asset === "EURUSD" ? 5 : 2),
    isGreenVector:
      card.bias === "LONG" && (card.momentum > 0 || card.changePercent > 0 || card.action === "EXECUTE"),
    isRedVector:
      card.bias === "SHORT" && (card.momentum < 0 || card.changePercent < 0 || card.action === "EXECUTE"),
    closedBackAboveAsiaLow:
      card.bias === "LONG" && (card.action === "EXECUTE" || price >= support || price >= lineB),
    closedBackBelowAsiaHigh:
      card.bias === "SHORT" && (card.action === "EXECUTE" || price <= entry || price <= lineA),
    aboveEma50,
    belowEma50,
    sparkline: card.sparkline,
    stateAge: card.stateAge,
    currentState: card.currentState,
    stateConfidence: card.stateConfidence,
    freshnessState: card.freshnessState,
    freshnessScore: card.freshnessScore,
    tooLateFlag: card.tooLateFlag,
    reasons: card.reasons,
    decayWarning: card.decayWarning,
    invalidationWarning: card.invalidationWarning,
    stateDebug: card.stateDebug,
  };
}

export async function primeHybridDataFeed(timeframe: "1m" | "5m" | "15m" | "1h", options?: { force?: boolean }) {
  try {
    const [cardsResult, healthResult] = await Promise.all([
      fetchCardsPayload(timeframe, { force: options?.force }),
      fetchHealthPayload(timeframe),
    ]);
    const payload = cardsResult.payload;
    const health = healthResult.payload;
    const rateLimited = cardsResult.rateLimited || healthResult.rateLimited || isRateLimitMessage(payload?.warning) || isRateLimitMessage(health?.warning);

    if (!payload) {
      const fallbackContexts = cachedContextsByTimeframe[timeframe] ?? [];
      const hasFallback = fallbackContexts.length > 0;
      if (cardsResult.errorMessage) {
        logFeedError(`cards:${timeframe}`, {
          status: cardsResult.status,
          message: cardsResult.errorMessage,
        });
      }
      feedStatusByTimeframe[timeframe] = {
        mode: FEED_MODE,
        source: "remote",
        healthy: hasFallback,
        lastUpdated: Date.now(),
        error: hasFallback
          ? userFacingFeedMessage(cardsResult.errorMessage, "Data temporarily unavailable. Using last known state.")
          : userFacingFeedMessage(cardsResult.errorMessage, "Data temporarily unavailable."),
        warning: rateLimited ? "Rate limit reached, retrying." : null,
        isRateLimited: rateLimited,
        cacheAgeMs: health?.cacheAgeMs ?? null,
        assetCount: fallbackContexts.length,
        timeframe,
      };
      return fallbackContexts;
    }

    const contexts = payload.cards
      .map((card) => buildContextFromCard(card))
      .filter((context): context is HybridContext => Boolean(context));

    if (contexts.length > 0) {
      cachedContextsByTimeframe[timeframe] = contexts;
    }
    if (payload.cards.length > 0) {
      cachedBackendCardsByTimeframe[timeframe] = payload.cards;
    }

    const cachedContexts = cachedContextsByTimeframe[timeframe] ?? [];
    const usableContexts = contexts.length > 0 ? contexts : cachedContexts;
    const hasFallback = contexts.length === 0 && usableContexts.length > 0;

    feedStatusByTimeframe[timeframe] = {
      mode: FEED_MODE,
      source: "remote",
      healthy: usableContexts.length > 0,
      lastUpdated: Date.now(),
      warning:
        usableContexts.length > 0 && rateLimited
          ? "Rate limit reached, retrying."
          : usableContexts.length > 0 && (payload.warning || health?.warning)
            ? "Data temporarily unavailable."
            : null,
      isRateLimited: rateLimited,
      cacheAgeMs: payload.cacheAgeMs ?? health?.cacheAgeMs ?? null,
      assetCount: payload.assetCount ?? usableContexts.length,
      timeframe,
      error:
        contexts.length > 0
          ? null
          : hasFallback
            ? userFacingFeedMessage(payload.warning ?? health?.warning, "Data temporarily unavailable. Using last known state.")
            : userFacingFeedMessage(payload.warning ?? health?.warning, "Data temporarily unavailable."),
    };

    if (payload.warning) {
      logFeedError(`cards-warning:${timeframe}`, payload.warning);
    }
    if (health?.warning) {
      logFeedError(`health-warning:${timeframe}`, health.warning);
    }

    return usableContexts;
  } catch (error) {
    const fallbackContexts = cachedContextsByTimeframe[timeframe] ?? [];
    const hasFallback = fallbackContexts.length > 0;
    logFeedError(`prime:${timeframe}`, error);
    feedStatusByTimeframe[timeframe] = {
      mode: FEED_MODE,
      source: "remote",
      healthy: hasFallback,
      lastUpdated: Date.now(),
      error: hasFallback ? "Data temporarily unavailable. Using last known state." : "Data temporarily unavailable.",
      warning: isRateLimitMessage(error instanceof Error ? error.message : null) ? "Rate limit reached, retrying." : null,
      isRateLimited: isRateLimitMessage(error instanceof Error ? error.message : null),
      cacheAgeMs: feedStatusByTimeframe[timeframe]?.cacheAgeMs ?? null,
      assetCount: fallbackContexts.length,
      timeframe,
    };
    return fallbackContexts;
  }
}

export function getLiveHybridContexts(timeframe: "1m" | "5m" | "15m" | "1h"): HybridContext[] {
  return cachedContextsByTimeframe[timeframe] ?? [];
}

export function getLiveBackendCards(timeframe: "1m" | "5m" | "15m" | "1h"): BackendCard[] {
  return cachedBackendCardsByTimeframe[timeframe] ?? [];
}

export function getHybridFeedStatus(timeframe: "1m" | "5m" | "15m" | "1h") {
  return feedStatusByTimeframe[timeframe] ?? {
    ...defaultFeedStatus,
    timeframe,
  };
}
