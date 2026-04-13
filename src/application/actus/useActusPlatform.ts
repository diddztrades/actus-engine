import { useCallback, useEffect, useMemo, useState } from "react";
import { buildLiveBoardInputs, clearLiveBoardInputCache } from "./buildLiveBoardInputs";
import { normalizeHybridContext } from "../../data/actus/normalizeHybridContext";
import type { ActusNormalizedMarketInput, ActusPlatformSnapshot, ActusSystemStatus, ActusTimeframe } from "../../domain/market/types";
import {
  getLiveBackendCards,
  getHybridFeedStatus,
  getLiveHybridContexts,
  primeHybridDataFeed,
} from "../../lib/hybridDataFeed";
import { getMacroSnapshot } from "../../services/macroService";
import { getSystemStatus } from "../../services/systemStatusService";
import type { MacroSnapshot } from "../../types/macro";
import { buildActusPlatformSnapshot } from "./buildActusPlatform";

const marketInputsCache: Partial<Record<ActusTimeframe, ActusNormalizedMarketInput[]>> = {};
let cachedMacroSnapshot: Partial<MacroSnapshot> | undefined;
let cachedSystemSnapshot: { connection: "online" | "offline"; dataSource: "supabase" | "local" } | null = null;

function buildStatus(message: string): ActusSystemStatus {
  const feed = getHybridFeedStatus("5m");

  return {
    mode: feed.mode,
    source: feed.source,
    health: "loading",
    lastUpdatedLabel: "loading",
    lastUpdatedAt: feed.lastUpdated,
    message,
  };
}

function buildUserFacingStatusMessage(args: {
  hasContexts: boolean;
  healthy: boolean;
  staleCache: boolean;
  ageMs: number | null;
  rateLimited?: boolean;
  feedError: string | null;
  feedWarning: string | null;
  assetCount: number;
}) {
  if (!args.hasContexts) {
    if (args.rateLimited) return "Rate limit reached, retrying.";
    return args.feedError ?? "Data temporarily unavailable.";
  }
  if (!args.healthy) {
    if (args.rateLimited) return "Rate limit reached, retrying. Using last known state.";
    return args.feedError ?? "Data temporarily unavailable. Using last known state.";
  }
  if (args.staleCache) {
    if (args.rateLimited) return "Rate limit reached, retrying. Showing last known state.";
    return "Data temporarily unavailable. Showing last known state.";
  }
  if (args.ageMs !== null && args.ageMs > 5 * 60 * 1000) {
    return "Data temporarily unavailable. Showing stale state.";
  }
  if (args.rateLimited) {
    return "Live • updating";
  }
  return `Live market feed connected across ${args.assetCount} assets.`;
}

export function useActusPlatform(timeframe: ActusTimeframe) {
  const [loading, setLoading] = useState(true);
  const [refreshTick, setRefreshTick] = useState(0);
  const [macroSnapshot, setMacroSnapshot] = useState<Partial<MacroSnapshot> | undefined>(cachedMacroSnapshot);
  const [systemSnapshot, setSystemSnapshot] = useState<{ connection: "online" | "offline"; dataSource: "supabase" | "local" } | null>(cachedSystemSnapshot);
  const [marketInputs, setMarketInputs] = useState<ActusNormalizedMarketInput[]>(marketInputsCache[timeframe] ?? []);
  const hasCachedInputs = (marketInputsCache[timeframe]?.length ?? 0) > 0;

  const refresh = useCallback(async (options?: { force?: boolean }) => {
    const cachedInputs = marketInputsCache[timeframe];
    if (options?.force) {
      delete marketInputsCache[timeframe];
      clearLiveBoardInputCache();
    }
    setLoading(options?.force ? true : !cachedInputs?.length);

    const [_, macroResult, systemResult] = await Promise.all([
      primeHybridDataFeed(timeframe, { force: options?.force }),
      cachedMacroSnapshot
        ? Promise.resolve(cachedMacroSnapshot)
        : getMacroSnapshot().catch(() => undefined),
      cachedSystemSnapshot
        ? Promise.resolve(cachedSystemSnapshot)
        : getSystemStatus().catch(() => ({
            connection: "offline" as const,
            dataSource: "local" as const,
          })),
    ]);

    const cards = getLiveBackendCards(timeframe);
    const contexts = getLiveHybridContexts(timeframe);
    let fusedInputs: ActusNormalizedMarketInput[];

    if (cards.length > 0) {
      try {
        fusedInputs = await buildLiveBoardInputs(cards, timeframe);
      } catch {
        fusedInputs = contexts.map(normalizeHybridContext);
      }
    } else {
      fusedInputs = contexts.map(normalizeHybridContext);
    }

    cachedMacroSnapshot = macroResult;
    cachedSystemSnapshot = systemResult;
    marketInputsCache[timeframe] = fusedInputs;
    setMacroSnapshot(macroResult);
    setSystemSnapshot(systemResult);
    setMarketInputs(fusedInputs);
    setRefreshTick((tick) => tick + 1);
    setLoading(false);
  }, [timeframe]);

  useEffect(() => {
    const cachedInputs = marketInputsCache[timeframe];
    if (cachedInputs?.length) {
      setMarketInputs(cachedInputs);
      setLoading(false);
    }
    void refresh();
  }, [refresh, timeframe]);

  const snapshot = useMemo<ActusPlatformSnapshot>(() => {
    const feed = getHybridFeedStatus(timeframe);
    const contexts = marketInputs;
    const now = Date.now();
    const ageMs = feed.lastUpdated ? now - feed.lastUpdated : null;
    const cacheAgeMs = feed.cacheAgeMs ?? ageMs;
    const staleCache = cacheAgeMs !== null && cacheAgeMs > 3 * 60 * 1000;

    const status: ActusSystemStatus = loading
      ? buildStatus("Loading live market inputs and platform context...")
      : {
          mode: feed.mode,
          source: feed.source,
          health:
            !contexts.length
              ? "empty"
              : !feed.healthy || staleCache
                ? "degraded"
                : ageMs !== null && ageMs > 5 * 60 * 1000
                  ? "stale"
                  : "healthy",
          lastUpdatedLabel: "ready",
          lastUpdatedAt: feed.lastUpdated,
          message: buildUserFacingStatusMessage({
            hasContexts: contexts.length > 0,
            healthy: feed.healthy,
            staleCache,
            ageMs,
            rateLimited: feed.isRateLimited,
            feedError: feed.error,
            feedWarning: feed.warning,
            assetCount: feed.assetCount,
          }),
        };

    return buildActusPlatformSnapshot({
      inputs: contexts,
      status,
      macroSnapshot,
      systemSource: systemSnapshot?.dataSource,
      systemConnection: systemSnapshot?.connection,
    });
  }, [loading, refreshTick, macroSnapshot, systemSnapshot, marketInputs]);

  return {
    snapshot,
    loading,
    hasCachedInputs,
    refresh,
  };
}
