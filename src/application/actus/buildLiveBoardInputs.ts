import { buildNqGammaSnapshot } from "../../core/gammaEngine";
import { buildNqPositioningSnapshot } from "../../core/positioningEngine";
import { buildSessionSnapshot } from "../../core/sessionEngine";
import { ACTUS_ASSET_CATALOG } from "../../data/actus/catalog";
import { fetchDatabentoFuturesHistory } from "../../data/databento/history";
import { fetchNqOptionChain } from "../../data/databento/options";
import type { DatabentoCoreAsset } from "../../data/databento/types";
import type { ActusNormalizedMarketInput, ActusTimeframe } from "../../domain/market/types";
import { buildPositioningProxyContext } from "../../lib/actusPositioningProxy";
import type { BackendCard } from "../../services/marketData";
import type { NormalizedFuturesCandle } from "../../types/market";

const DATABENTO_CARD_MAP: Partial<Record<string, DatabentoCoreAsset>> = {
  NQ: "NQ",
  "XAU/USD": "GC",
  CL: "CL",
};
const liveBoardInputCache = new Map<string, ActusNormalizedMarketInput[]>();

export function clearLiveBoardInputCache() {
  liveBoardInputCache.clear();
}

function round(value: number, digits = 4) {
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}

function levelDigits(symbol: string, price: number) {
  if (symbol === "EURUSD") return 5;
  if (price < 10) return 4;
  if (price < 100) return 3;
  return 2;
}

function average(values: number[]) {
  if (!values.length) return 0;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function catalogMeta(symbol: string) {
  return (
    ACTUS_ASSET_CATALOG[symbol] ?? {
      displayName: symbol,
      assetClass: "fx" as const,
    }
  );
}

function mapCardSymbolToActus(symbol: string) {
  if (symbol === "XAU/USD") return "XAU";
  if (symbol === "CL") return "OIL";
  return symbol;
}

function mapCardToDatabentoAsset(card: BackendCard): DatabentoCoreAsset | null {
  return DATABENTO_CARD_MAP[card.symbol] ?? null;
}

function sanitizeDebug(
  debug:
    | BackendCard["stateDebug"]
    | BackendCard["debugState"]
    | undefined,
) {
  if (!debug) {
    return undefined;
  }

  return {
    rawStateInputs: debug.rawStateInputs ?? undefined,
    chosenState: debug.chosenState ?? undefined,
    stateConfidence: debug.stateConfidence ?? undefined,
    freshnessState: debug.freshnessState ?? undefined,
    freshnessScore: debug.freshnessScore ?? undefined,
    tooLateFlag: debug.tooLateFlag ?? undefined,
    topReasons: debug.topReasons ?? undefined,
  };
}

function buildBaseline(candles: NormalizedFuturesCandle[], fallback: number) {
  const closes = candles.slice(-Math.min(50, candles.length)).map((candle) => candle.close);
  const baseline = closes.length ? average(closes) : fallback;
  return baseline || fallback;
}

function buildVectorState(card: BackendCard, price: ActusNormalizedMarketInput["price"], baseline: number) {
  const bullishClose = price.close > price.open && price.close >= price.high - (price.high - price.low) * 0.3;
  const bearishClose = price.close < price.open && price.close <= price.low + (price.high - price.low) * 0.3;

  return {
    green: card.bias === "LONG" ? bullishClose || card.action === "EXECUTE" : false,
    red: card.bias === "SHORT" ? bearishClose || card.action === "EXECUTE" : false,
    firstGreenAboveEma: card.bias === "LONG" && price.close >= baseline,
    firstRedBelowEma: card.bias === "SHORT" && price.close <= baseline,
  };
}

function buildFallbackInput(card: BackendCard): ActusNormalizedMarketInput {
  const symbol = mapCardSymbolToActus(card.symbol);
  const meta = catalogMeta(symbol);
  const price = {
    open: card.latestBar?.open ?? card.price,
    high: card.latestBar?.high ?? Math.max(card.price, card.greenLine, card.redLine),
    low: card.latestBar?.low ?? Math.min(card.price, card.greenLine, card.redLine),
    close: card.price,
  };
  const ema50 = (card.greenLine + card.redLine) / 2;
  const distanceFromEmaPct = Math.abs(price.close - ema50) / Math.max(Math.abs(ema50), 0.0001);
  const sessionLevels = {
    asiaHigh: Math.max(price.high, card.greenLine),
    asiaLow: Math.min(price.low, card.redLine),
    londonHigh: card.greenLine,
    londonLow: card.redLine,
    nyOpenRangeHigh: Math.max(price.close, card.entry),
    nyOpenRangeLow: Math.min(price.close, card.support),
    firstHourHigh: Math.max(price.high, card.entry),
    firstHourLow: Math.min(price.low, card.support),
  };
  const fallbackPositioning =
    symbol === "NQ"
      ? undefined
      : buildPositioningProxyContext({
          digits: levelDigits(symbol, price.close),
          price,
          sessionLevels,
          baseline: ema50,
          stretchFromBaseline: distanceFromEmaPct * 100,
          referenceHigh: Math.max(card.entry, card.greenLine, price.high),
          referenceLow: Math.min(card.support, card.redLine, price.low),
        });

  return {
    symbol,
    displayName: meta.displayName,
    assetClass: meta.assetClass,
    timeframe: card.timeframe ?? "5m",
    stateAgeMinutes: card.stateAge,
    price,
    sessionLevels,
    vector: buildVectorState(card, price, ema50),
    structure: {
      ema50,
      aboveEma50: price.close >= ema50,
      belowEma50: price.close < ema50,
      distanceFromEmaPct,
      closedBackAboveAsiaLow: card.bias === "LONG" && price.close >= card.support,
      closedBackBelowAsiaHigh: card.bias === "SHORT" && price.close <= card.entry,
    },
    sparkline: card.sparkline ?? [price.open, price.close],
      liveState: {
        currentState: card.currentState ?? "Waiting",
        action: card.action === "EXECUTE" ? "execute" : card.action === "AVOID" ? "avoid" : "wait",
        stateConfidence: card.stateConfidence ?? card.debugState?.stateConfidence ?? 0,
        freshnessState: card.freshnessState ?? card.debugState?.freshnessState ?? "fresh",
        freshnessScore: card.freshnessScore ?? card.debugState?.freshnessScore ?? 0,
        tooLateFlag: card.tooLateFlag ?? card.debugState?.tooLateFlag ?? false,
        reasons: (card.reasons?.length ? card.reasons : card.debugState?.topReasons) ?? [],
        decayWarning: card.decayWarning ?? null,
        invalidationWarning: card.invalidationWarning ?? null,
        debug: sanitizeDebug(card.stateDebug ?? card.debugState),
      },
      positioningContext: fallbackPositioning,
  };
}

export async function buildLiveBoardInputs(
  cards: BackendCard[],
  timeframe: ActusTimeframe,
): Promise<ActusNormalizedMarketInput[]> {
  const cacheKey = JSON.stringify(
    cards.map((card) => ({
      symbol: card.symbol,
      timeframe,
      price: card.price,
      action: card.action,
      currentState: card.currentState ?? null,
      confidence: card.stateConfidence ?? null,
      freshness: card.freshnessScore ?? null,
      sparklineTail: card.sparkline?.slice(-4) ?? [],
    })),
  );
  const cached = liveBoardInputCache.get(cacheKey);
  if (cached) {
    return cached;
  }

  const databentoRequests = cards
    .map((card) => ({ card, asset: mapCardToDatabentoAsset(card) }))
    .filter((item): item is { card: BackendCard; asset: DatabentoCoreAsset } => item.asset !== null);

  const futuresEntries = await Promise.all(
    databentoRequests.map(async ({ card, asset }) => {
      try {
        const candles = await fetchDatabentoFuturesHistory({ asset, timeframe, limit: timeframe === "1h" ? 240 : 720 });
        return [card.symbol, candles] as const;
      } catch {
        return [card.symbol, null] as const;
      }
    }),
  );

  const futuresByCardSymbol = new Map<string, NormalizedFuturesCandle[] | null>(futuresEntries);
  let nqPositioning:
    | {
        positioningCeiling: number | null;
        positioningFloor: number | null;
        pinZone: { lower: number; upper: number; anchor: number } | null;
        compressionZone: { lower: number; upper: number; anchor: number } | null;
        expansionRisk: string;
        dealerPressureShift: string;
        positioningSupport: string;
        positioningResistance: string;
        confidence: "high" | "medium" | "low";
        warnings: string[];
      }
    | undefined;

  if (cards.some((card) => card.symbol === "NQ")) {
    try {
      const optionChain = await fetchNqOptionChain();
      nqPositioning = buildNqPositioningSnapshot(buildNqGammaSnapshot(optionChain));
    } catch {
      nqPositioning = undefined;
    }
  }

  const inputs: ActusNormalizedMarketInput[] = cards.map((card) => {
    const enrichedCandles = futuresByCardSymbol.get(card.symbol);
    if (!enrichedCandles?.length) {
      return buildFallbackInput(card);
    }

    const symbol = mapCardSymbolToActus(card.symbol);
    const meta = catalogMeta(symbol);
    const latest = enrichedCandles[enrichedCandles.length - 1];
    const baseline = buildBaseline(enrichedCandles, latest.close);
    const session = buildSessionSnapshot(enrichedCandles);
    const price = {
      open: latest.open,
      high: latest.high,
      low: latest.low,
      close: latest.close,
    };
    const distanceFromEmaPct = Math.abs(price.close - baseline) / Math.max(Math.abs(baseline), 0.0001);
    const proxyPositioning = buildPositioningProxyContext({
      digits: levelDigits(symbol, price.close),
      price,
      sessionLevels: {
        asiaHigh: session.asiaHigh ?? price.high,
        asiaLow: session.asiaLow ?? price.low,
        londonHigh: session.londonHigh ?? price.high,
        londonLow: session.londonLow ?? price.low,
        nyOpenRangeHigh: session.nyOpenRangeHigh ?? price.high,
        nyOpenRangeLow: session.nyOpenRangeLow ?? price.low,
        firstHourHigh: session.firstHourHigh ?? price.high,
        firstHourLow: session.firstHourLow ?? price.low,
      },
      baseline,
      stretchFromBaseline: session.stretchFromBaseline,
      referenceHigh: Math.max(card.entry, price.high),
      referenceLow: Math.min(card.support, price.low),
    });

    return {
      symbol,
      displayName: meta.displayName,
      assetClass: meta.assetClass,
      timeframe,
      stateAgeMinutes: card.stateAge,
      price,
      sessionLevels: {
        asiaHigh: session.asiaHigh ?? price.high,
        asiaLow: session.asiaLow ?? price.low,
        londonHigh: session.londonHigh ?? price.high,
        londonLow: session.londonLow ?? price.low,
        nyOpenRangeHigh: session.nyOpenRangeHigh ?? price.high,
        nyOpenRangeLow: session.nyOpenRangeLow ?? price.low,
        firstHourHigh: session.firstHourHigh ?? price.high,
        firstHourLow: session.firstHourLow ?? price.low,
      },
      vector: buildVectorState(card, price, baseline),
      structure: {
        ema50: round(baseline, symbol === "EURUSD" ? 5 : 2),
        aboveEma50: price.close >= baseline,
        belowEma50: price.close < baseline,
        distanceFromEmaPct,
        closedBackAboveAsiaLow: Boolean(session.asiaLow !== null && price.close >= session.asiaLow),
        closedBackBelowAsiaHigh: Boolean(session.asiaHigh !== null && price.close <= session.asiaHigh),
      },
      sparkline: enrichedCandles.slice(-32).map((candle) => candle.close),
      liveState: {
        currentState: card.currentState ?? "Waiting",
        action: card.action === "EXECUTE" ? "execute" : card.action === "AVOID" ? "avoid" : "wait",
        stateConfidence: card.stateConfidence ?? card.stateDebug?.stateConfidence ?? card.debugState?.stateConfidence ?? 0,
        freshnessState: card.freshnessState ?? card.stateDebug?.freshnessState ?? card.debugState?.freshnessState ?? "fresh",
        freshnessScore: card.freshnessScore ?? card.stateDebug?.freshnessScore ?? card.debugState?.freshnessScore ?? 0,
        tooLateFlag: card.tooLateFlag ?? card.stateDebug?.tooLateFlag ?? card.debugState?.tooLateFlag ?? false,
        reasons: (card.reasons?.length ? card.reasons : card.stateDebug?.topReasons ?? card.debugState?.topReasons) ?? [],
        decayWarning: card.decayWarning ?? null,
        invalidationWarning: card.invalidationWarning ?? null,
        debug: sanitizeDebug(card.stateDebug ?? card.debugState),
      },
      sessionContext: {
        currentSession: session.currentSession,
        stretchFromBaseline: session.stretchFromBaseline,
        dayHigh: session.dayHigh,
        dayLow: session.dayLow,
        baseline: session.baseline,
      },
      positioningContext: card.symbol === "NQ" && nqPositioning ? nqPositioning : proxyPositioning,
    };
  });

  liveBoardInputCache.set(cacheKey, inputs);
  return inputs;
}
