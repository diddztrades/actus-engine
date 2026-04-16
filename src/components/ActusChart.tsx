import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  CandlestickSeries,
  ColorType,
  createChart,
  CrosshairMode,
  LineStyle,
  PriceScaleMode,
  TickMarkType,
  UTCTimestamp,
  type IChartApi,
  type IPriceLine,
  type ISeriesApi,
  type Time,
} from "lightweight-charts";
import { ACTUS_VISIBLE_BARS, formatActusAxisTime, formatActusTickMark } from "../lib/actusChartConfig";
import type { GammaOverlay, TimeframeFilter } from "../types/chart";
import type { DeltaSignal } from "../types/delta";
import type { NormalizedFuturesCandle } from "../types/market";
import { Sentry } from "../sentry";

type Timeframe = TimeframeFilter;

type Props = {
  symbol?: string;
  candles?: NormalizedFuturesCandle[] | null;
  livePrice?: number | null;
  timeframe: Timeframe;
  height: number;
  entry?: number;
  invalidation?: number;
  dayHigh?: number | null;
  dayLow?: number | null;
  gammaOverlay?: GammaOverlay | null;
  deltaSignal?: DeltaSignal | null;
};

function buildCandlestickData(candles: NormalizedFuturesCandle[]) {
  return candles.map((candle) => ({
    time: Math.floor(new Date(candle.timestamp).getTime() / 1000) as UTCTimestamp,
    open: candle.open,
    high: candle.high,
    low: candle.low,
    close: candle.close,
  }));
}

function sanitizeCandlestickData(data: ReturnType<typeof buildCandlestickData>) {
  const sorted = [...data]
    .filter(
      (bar) =>
        Number.isFinite(Number(bar.time)) &&
        Number.isFinite(bar.open) &&
        Number.isFinite(bar.high) &&
        Number.isFinite(bar.low) &&
        Number.isFinite(bar.close),
    )
    .sort((a, b) => Number(a.time) - Number(b.time));

  const deduped: typeof sorted = [];
  for (const bar of sorted) {
    const previous = deduped[deduped.length - 1];
    if (previous && Number(previous.time) === Number(bar.time)) {
      deduped[deduped.length - 1] = bar;
      continue;
    }
    deduped.push(bar);
  }

  return deduped;
}

function actusTraceKey(symbol: string | undefined, timeframe: Timeframe) {
  if (!symbol) return null;
  const normalized = symbol.toUpperCase();
  if (normalized === "XAU" || normalized === "XAU/USD" || normalized === "GC") return `XAU ${timeframe}`;
  if (normalized === "NQ") return `NQ ${timeframe}`;
  if (normalized === "CL" || normalized === "OIL") return `OIL ${timeframe}`;
  if (normalized === "BTC" || normalized === "BTC/USD") return `BTC ${timeframe}`;
  if (normalized === "SOL_CME" || normalized === "SOL-CME" || normalized === "SOL CME") return `SOL_CME ${timeframe}`;
  return null;
}

function sourceIdentityLabels(symbol?: string) {
  const normalized = symbol?.toUpperCase() ?? "";
  if (normalized === "BTC" || normalized === "BTC/USD") {
    return { live: "LIVE - MBT FUTURES", reference: "MBT REF" };
  }
  if (normalized === "ETH" || normalized === "ETH/USD") {
    return { live: "LIVE - DERIBIT PERP", reference: "PERP REF" };
  }
  if (normalized === "SOL_CME" || normalized === "SOL-CME" || normalized === "SOL CME") {
    return { live: "LIVE - SOL FUTURES", reference: "SOL FUT REF" };
  }
  if (normalized === "SOL" || normalized === "SOL/USD") {
    return { live: "LIVE - BINANCE", reference: "BINANCE REF" };
  }
  if (normalized === "XAU" || normalized === "XAU/USD" || normalized === "GC") {
    return { live: "LIVE - GC FUTURES", reference: "GC REF" };
  }
  if (normalized === "OIL" || normalized === "CL") {
    return { live: "LIVE - CL FUTURES", reference: "CL REF" };
  }
  if (normalized === "NQ") {
    return { live: "LIVE - NQ FUTURES", reference: "NQ REF" };
  }
  if (normalized === "EUR" || normalized === "EUR/USD" || normalized === "EURUSD" || normalized === "6E") {
    return { live: "LIVE - 6E FUTURES", reference: "6E REF" };
  }
  return { live: "LIVE", reference: "REF" };
}

function overlayLineStyle(kind: "gammaFlip" | "callWall" | "putWall" | "anchor" | "spotReference", symbol?: string) {
  if (kind === "gammaFlip") {
    return {
      title: "G-FLIP",
      color: "rgba(245, 200, 106, 0.88)",
      lineStyle: LineStyle.Dashed,
      lineWidth: 1 as const,
      axisLabelVisible: true,
    };
  }

  if (kind === "callWall") {
    return {
      title: "CALL WALL",
      color: "rgba(98, 196, 255, 0.82)",
      lineStyle: LineStyle.Dashed,
      lineWidth: 1 as const,
      axisLabelVisible: true,
    };
  }

  if (kind === "putWall") {
    return {
      title: "PUT WALL",
      color: "rgba(255, 123, 159, 0.82)",
      lineStyle: LineStyle.Dashed,
      lineWidth: 1 as const,
      axisLabelVisible: true,
    };
  }

  if (kind === "anchor") {
    return {
      title: "ANCHOR",
      color: "rgba(122, 217, 209, 0.64)",
      lineStyle: LineStyle.Dashed,
      lineWidth: 1 as const,
      axisLabelVisible: true,
    };
  }

  const labels = sourceIdentityLabels(symbol);
  return {
    title: labels.reference,
    color: "rgba(179, 193, 218, 0.38)",
    lineStyle: LineStyle.Dotted,
    lineWidth: 1 as const,
    axisLabelVisible: true,
  };
}

function symbolPriceFormat(symbol: string | undefined) {
  const normalized = symbol?.toUpperCase() ?? "";
  if (normalized === "EUR/USD" || normalized === "EURUSD") {
    return { precision: 5, minMove: 0.00001 };
  }
  if (normalized === "BTC" || normalized === "BTC/USD") {
    return { precision: 2, minMove: 0.01 };
  }
  return { precision: 2, minMove: 0.01 };
}

function priceLineEpsilon(symbol: string | undefined) {
  const format = symbolPriceFormat(symbol);
  return Math.max(format.minMove * 4, 0.0001);
}

function hasFinitePrice(value: number | null | undefined) {
  return typeof value === "number" && Number.isFinite(value);
}

function isReferenceRedundant(referencePrice: number | null | undefined, livePrice: number | null | undefined, symbol?: string) {
  if (typeof referencePrice !== "number" || !Number.isFinite(referencePrice)) {
    return false;
  }
  if (typeof livePrice !== "number" || !Number.isFinite(livePrice)) {
    return false;
  }
  return Math.abs(referencePrice - livePrice) <= priceLineEpsilon(symbol);
}

type OverlayKind = "gammaFlip" | "callWall" | "putWall" | "anchor" | "spotReference";
type SecondaryReferenceKind = "dayHigh" | "dayLow";

function overlayPriority(kind: OverlayKind) {
  if (kind === "callWall") return 0;
  if (kind === "putWall") return 1;
  if (kind === "gammaFlip") return 2;
  if (kind === "anchor") return 3;
  return 4;
}

function secondaryReferenceStyle(kind: SecondaryReferenceKind) {
  return {
    title: kind === "dayHigh" ? "HOD" : "LOD",
    color: "rgba(176, 189, 214, 0.34)",
    lineStyle: LineStyle.Dashed,
    lineWidth: 1 as const,
    axisLabelVisible: true,
  };
}

function dedupeOverlayLabels(args: {
  symbol?: string;
  livePrice: number | null;
  overlay: {
    gammaFlip: number | null | undefined;
    callWall: number | null | undefined;
    putWall: number | null | undefined;
    anchor: number | null | undefined;
    spotReference: number | null | undefined;
  };
}) {
  const { symbol, livePrice, overlay } = args;
  const epsilon = priceLineEpsilon(symbol);
  const labels = sourceIdentityLabels(symbol);
  const entries = ([
    { kind: "callWall", price: overlay.callWall, title: "CALL WALL" },
    { kind: "putWall", price: overlay.putWall, title: "PUT WALL" },
    { kind: "gammaFlip", price: overlay.gammaFlip, title: "G-FLIP" },
    { kind: "anchor", price: overlay.anchor, title: "ANCHOR" },
    { kind: "spotReference", price: overlay.spotReference, title: labels.reference },
  ] as const)
    .filter((entry) => typeof entry.price === "number" && Number.isFinite(entry.price))
    .sort((a, b) => overlayPriority(a.kind) - overlayPriority(b.kind));

  const clusters: Array<{
    price: number;
    entries: Array<(typeof entries)[number]>;
  }> = [];

  entries.forEach((entry) => {
    const cluster = clusters.find((candidate) => Math.abs(candidate.price - Number(entry.price)) <= epsilon);
    if (cluster) {
      cluster.entries.push(entry);
      return;
    }
    clusters.push({
      price: Number(entry.price),
      entries: [entry],
    });
  });

  const result: Record<OverlayKind, { axisLabelVisible: boolean; title: string }> = {
    gammaFlip: { axisLabelVisible: false, title: "G-FLIP" },
    callWall: { axisLabelVisible: false, title: "CALL WALL" },
    putWall: { axisLabelVisible: false, title: "PUT WALL" },
    anchor: { axisLabelVisible: false, title: "ANCHOR" },
    spotReference: { axisLabelVisible: false, title: labels.reference },
  };

  clusters.forEach((cluster) => {
    const overlapsLive =
      typeof livePrice === "number" &&
      Number.isFinite(livePrice) &&
      Math.abs(cluster.price - livePrice) <= epsilon;
    const visibleEntry = cluster.entries[0];
    const mergedTitle = cluster.entries.map((entry) => entry.title).filter((title, index, items) => items.indexOf(title) === index).join(" / ");

    cluster.entries.forEach((entry) => {
      result[entry.kind] = {
        axisLabelVisible: !overlapsLive && entry.kind === visibleEntry.kind,
        title: entry.kind === visibleEntry.kind ? mergedTitle : entry.title,
      };
    });
  });

  if (
    typeof overlay.spotReference === "number" &&
    Number.isFinite(overlay.spotReference) &&
    isReferenceRedundant(overlay.spotReference, livePrice, symbol)
  ) {
    result.spotReference = {
      axisLabelVisible: false,
      title: labels.reference,
    };
  }

  return result;
}

function secondaryReferenceLabelPlan(args: {
  symbol?: string;
  livePrice: number | null;
  gammaOverlay: GammaOverlay | null;
  deltaPrice: number | null;
  dayHigh: number | null | undefined;
  dayLow: number | null | undefined;
}) {
  const epsilon = priceLineEpsilon(args.symbol);
  const strongerPrices = [
    args.livePrice,
    args.gammaOverlay?.callWall,
    args.gammaOverlay?.putWall,
    args.gammaOverlay?.gammaFlip,
    args.gammaOverlay?.anchor,
    args.gammaOverlay?.spotReference,
    args.deltaPrice,
  ];

  const entries = ([
    { kind: "dayHigh", price: args.dayHigh, title: "HOD" },
    { kind: "dayLow", price: args.dayLow, title: "LOD" },
  ] as const).filter((entry) => typeof entry.price === "number" && Number.isFinite(entry.price));

  const result: Record<SecondaryReferenceKind, { axisLabelVisible: boolean; title: string }> = {
    dayHigh: { axisLabelVisible: false, title: "HOD" },
    dayLow: { axisLabelVisible: false, title: "LOD" },
  };

  const visibleSecondaryPrices: number[] = [];
  entries.forEach((entry) => {
    const nextPrice = Number(entry.price);
    const overlapsStronger = strongerPrices.some(
      (price) => hasFinitePrice(price) && Math.abs(Number(price) - nextPrice) <= epsilon,
    );
    const overlapsVisibleSecondary = visibleSecondaryPrices.some((price) => Math.abs(price - nextPrice) <= epsilon);

    result[entry.kind] = {
      axisLabelVisible: !overlapsStronger && !overlapsVisibleSecondary,
      title: entry.title,
    };

    if (!overlapsStronger && !overlapsVisibleSecondary) {
      visibleSecondaryPrices.push(nextPrice);
    }
  });

  return result;
}

function deltaVisualTone(signal: DeltaSignal | null) {
  if (signal?.deltaAvailability === "DIRECTIONAL") {
    const bullish = signal.bias === "LONG" || signal.condition === "ACCUMULATION";
    return {
      label: "Delta Directional",
      color: bullish ? "#d7ffea" : "#ffd7e2",
      accent: bullish ? "#45ffb5" : "#ff8ea8",
      background: bullish ? "rgba(69,255,181,0.1)" : "rgba(255,142,168,0.1)",
      border: bullish ? "rgba(69,255,181,0.22)" : "rgba(255,142,168,0.22)",
    };
  }
  if (signal?.deltaAvailability === "SOURCE_ONLY") {
    return {
      label: "Delta Source Only",
      color: "#d8e7ff",
      accent: "#67b7ff",
      background: "rgba(103,183,255,0.1)",
      border: "rgba(103,183,255,0.2)",
    };
  }
  if (signal?.deltaAvailability === "UNSUPPORTED") {
    return {
      label: "Delta Unsupported",
      color: "#b8c6de",
      accent: "#8ea0bf",
      background: "rgba(142,160,191,0.08)",
      border: "rgba(142,160,191,0.16)",
    };
  }
  return {
    label: "Delta Unavailable",
    color: "#d3c1cb",
    accent: "#ff9db3",
    background: "rgba(255,111,145,0.07)",
    border: "rgba(255,111,145,0.14)",
  };
}

function deltaStructurePlan(signal: DeltaSignal | null) {
  const referencePrice = hasFinitePrice(signal?.deltaReferencePrice) ? Number(signal?.deltaReferencePrice) : null;
  if (!signal || referencePrice === null) {
    return {
      visible: false,
      price: null,
      title: "DELTA",
      color: "#67b7ff",
      lineStyle: LineStyle.Dotted,
      lineWidth: 1 as const,
      axisLabelVisible: false,
    };
  }

  if (signal.deltaAvailability === "DIRECTIONAL") {
    const bullish = signal.bias === "LONG" || signal.condition === "ACCUMULATION";
    return {
      visible: true,
      price: referencePrice,
      title: bullish ? "DELTA LONG" : signal.bias === "SHORT" || signal.condition === "DISTRIBUTION" ? "DELTA SHORT" : "DELTA",
      color: bullish ? "rgba(69,255,181,0.56)" : "rgba(255,142,168,0.56)",
      lineStyle: LineStyle.Dashed,
      lineWidth: 1 as const,
      axisLabelVisible: true,
    };
  }

  if (signal.deltaAvailability === "SOURCE_ONLY") {
    return {
      visible: true,
      price: referencePrice,
      title: "DELTA FLOW",
      color: "rgba(103,183,255,0.42)",
      lineStyle: LineStyle.Dotted,
      lineWidth: 1 as const,
      axisLabelVisible: true,
    };
  }

  return {
    visible: false,
    price: null,
    title: "DELTA",
    color: "#67b7ff",
    lineStyle: LineStyle.Dotted,
    lineWidth: 1 as const,
    axisLabelVisible: false,
  };
}

function deltaAxisLabelVisible(args: {
  symbol?: string;
  livePrice: number | null;
  deltaPrice: number | null;
  gammaOverlay: GammaOverlay | null;
}) {
  const { symbol, livePrice, deltaPrice, gammaOverlay } = args;
  if (!hasFinitePrice(deltaPrice)) {
    return false;
  }

  const epsilon = priceLineEpsilon(symbol);
  if (hasFinitePrice(livePrice) && Math.abs(Number(deltaPrice) - Number(livePrice)) <= epsilon) {
    return false;
  }

  const structuralPrices = [
    gammaOverlay?.callWall,
    gammaOverlay?.putWall,
    gammaOverlay?.gammaFlip,
    gammaOverlay?.anchor,
  ];

  return !structuralPrices.some((price) => hasFinitePrice(price) && Math.abs(Number(deltaPrice) - Number(price)) <= epsilon);
}

function hasFiniteOverlayValue(value: number | null | undefined) {
  return hasFinitePrice(value);
}

function gammaVisualTone(overlay: GammaOverlay | null) {
  const sourceAvailable = Boolean(overlay?.source);
  const levelsAvailable =
    hasFiniteOverlayValue(overlay?.callWall ?? null) ||
    hasFiniteOverlayValue(overlay?.putWall ?? null) ||
    hasFiniteOverlayValue(overlay?.anchor ?? null) ||
    hasFiniteOverlayValue(overlay?.gammaFlip ?? null);
  const directionalAvailable = hasFiniteOverlayValue(overlay?.gammaFlip ?? null);

  if (sourceAvailable && levelsAvailable && directionalAvailable) {
    return {
      label: "Gamma Directional",
      color: "#d7ffea",
      accent: "#45ffb5",
      background: "rgba(69,255,181,0.1)",
      border: "rgba(69,255,181,0.22)",
    };
  }
  if (sourceAvailable && levelsAvailable) {
    return {
      label: "Gamma Levels Active",
      color: "#d8e7ff",
      accent: "#67b7ff",
      background: "rgba(103,183,255,0.1)",
      border: "rgba(103,183,255,0.2)",
    };
  }
  if (sourceAvailable) {
    return {
      label: "Gamma Source Only",
      color: "#d8e7ff",
      accent: "#8fbfff",
      background: "rgba(103,183,255,0.08)",
      border: "rgba(103,183,255,0.16)",
    };
  }
  return {
    label: "Gamma Unavailable",
    color: "#d3c1cb",
    accent: "#ff9db3",
    background: "rgba(255,111,145,0.07)",
    border: "rgba(255,111,145,0.14)",
  };
}

function gammaVisualSummary(overlay: GammaOverlay | null) {
  if (!overlay?.source) {
    return {
      title: "Gamma pending",
      detail: "No source yet",
    };
  }

  if (hasFiniteOverlayValue(overlay?.gammaFlip ?? null)) {
    return {
      title: "Walls + flip",
      detail: "Resolved structure",
    };
  }

  if (
    hasFiniteOverlayValue(overlay?.callWall ?? null) ||
    hasFiniteOverlayValue(overlay?.putWall ?? null) ||
    hasFiniteOverlayValue(overlay?.anchor ?? null)
  ) {
    return {
      title: "Levels visible",
      detail: "Exposure map only",
    };
  }

  return {
    title: "Source active",
    detail: "Structure still sparse",
  };
}

function deltaVisualSummary(signal: DeltaSignal | null) {
  if (!signal) {
    return {
      title: "Delta pending",
      detail: "Awaiting live flow",
    };
  }

  if (signal.deltaAvailability === "DIRECTIONAL") {
    const bias = signal.bias ?? "NEUTRAL";
    const condition = (signal.condition ?? "NEUTRAL").replace("_", " ");
    const strength = `${Math.round((signal.strength ?? 0) * 100)}%`;
    return {
      title: bias === "NEUTRAL" ? "Directional flow" : `${bias} flow`,
      detail: `${condition} • ${strength}`,
    };
  }

  if (signal.deltaAvailability === "SOURCE_ONLY") {
    const strength = signal.strength && signal.strength > 0 ? `${Math.round(signal.strength * 100)}% flow` : "Flow present";
    return {
      title: "Flow present",
      detail: strength,
    };
  }

  if (signal.deltaAvailability === "UNSUPPORTED") {
    return {
      title: "Delta unsupported",
      detail: "Not in current stack",
    };
  }

  return {
    title: "Flow unavailable",
    detail: "No usable source",
  };
}

export function ActusChart({
  symbol,
  candles,
  livePrice,
  timeframe,
  height,
  entry,
  invalidation,
  dayHigh,
  dayLow,
  gammaOverlay,
  deltaSignal,
}: Props) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const candleSeriesRef = useRef<ISeriesApi<"Candlestick", Time> | null>(null);
  const livePriceLineRef = useRef<IPriceLine | null>(null);
  const entryPriceLineRef = useRef<IPriceLine | null>(null);
  const stopPriceLineRef = useRef<IPriceLine | null>(null);
  const deltaPriceLineRef = useRef<IPriceLine | null>(null);
  const gammaFlipLineRef = useRef<IPriceLine | null>(null);
  const callWallLineRef = useRef<IPriceLine | null>(null);
  const putWallLineRef = useRef<IPriceLine | null>(null);
  const anchorLineRef = useRef<IPriceLine | null>(null);
  const spotReferenceLineRef = useRef<IPriceLine | null>(null);
  const dayHighLineRef = useRef<IPriceLine | null>(null);
  const dayLowLineRef = useRef<IPriceLine | null>(null);
  const previousDataRef = useRef<ReturnType<typeof buildCandlestickData> | null>(null);
  const latestCandleDataRef = useRef<ReturnType<typeof buildCandlestickData> | null>(null);
  const visibleRangeFrameRef = useRef<number | null>(null);
  const suppressRangeTrackingRef = useRef(false);
  const userAtLiveEdgeRef = useRef(true);
  const resizeObserverRef = useRef<ResizeObserver | null>(null);
  const mountFrameRef = useRef<number | null>(null);
  const livePriceValueRef = useRef<number | null>(null);
  const livePriceSymbolRef = useRef<string | undefined>(undefined);
  const entryPriceValueRef = useRef<number | null>(null);
  const stopPriceValueRef = useRef<number | null>(null);
  const deltaPriceValueRef = useRef<number | null>(null);
  const deltaPriceTitleRef = useRef("DELTA");
  const overlayValuesRef = useRef<{
    gammaFlip: number | null;
    callWall: number | null;
    putWall: number | null;
    anchor: number | null;
    spotReference: number | null;
    source: string | null;
    updatedAt: string | null;
  }>({
    gammaFlip: null,
    callWall: null,
    putWall: null,
    anchor: null,
    spotReference: null,
    source: null,
    updatedAt: null,
  });
  const overlayTitleRef = useRef<Record<OverlayKind, string>>({
    gammaFlip: "G-FLIP",
    callWall: "CALL WALL",
    putWall: "PUT WALL",
    anchor: "ANCHOR",
    spotReference: "REF",
  });
  const secondaryReferenceValuesRef = useRef<{
    dayHigh: number | null;
    dayLow: number | null;
  }>({
    dayHigh: null,
    dayLow: null,
  });
  const secondaryReferenceTitleRef = useRef<Record<SecondaryReferenceKind, string>>({
    dayHigh: "HOD",
    dayLow: "LOD",
  });

  const candleData = useMemo(() => {
    if (!candles?.length) return null;
    return sanitizeCandlestickData(buildCandlestickData(candles));
  },
    [candles],
  );
  const lastValue = candleData?.[candleData.length - 1]?.close ?? null;
  const effectiveLivePrice = typeof livePrice === "number" && Number.isFinite(livePrice) ? livePrice : lastValue;
  const traceKey = useMemo(() => actusTraceKey(symbol, timeframe), [symbol, timeframe]);
  const [atLiveEdge, setAtLiveEdge] = useState(true);
  const [chartReadyTick, setChartReadyTick] = useState(0);
  const priceFormat = useMemo(() => symbolPriceFormat(symbol), [symbol]);
  const sourceLabels = useMemo(() => sourceIdentityLabels(symbol), [symbol]);
  const gammaTone = useMemo(() => gammaVisualTone(gammaOverlay ?? null), [gammaOverlay]);
  const gammaSummary = useMemo(() => gammaVisualSummary(gammaOverlay ?? null), [gammaOverlay]);
  const deltaTone = useMemo(() => deltaVisualTone(deltaSignal ?? null), [deltaSignal]);
  const deltaSummary = useMemo(() => deltaVisualSummary(deltaSignal ?? null), [deltaSignal]);
  const deltaPlan = useMemo(() => deltaStructurePlan(deltaSignal ?? null), [deltaSignal]);

  const tickMarkFormatter = useCallback((time: Time, _tickMarkType: TickMarkType, _locale: string) => {
    return formatActusTickMark(time, _tickMarkType, _locale, timeframe);
  }, [timeframe]);

  useEffect(() => {
    latestCandleDataRef.current = candleData;
  }, [candleData]);

  const currentBias =
    effectiveLivePrice !== null && typeof entry === "number" && typeof invalidation === "number"
      ? entry > invalidation
        ? effectiveLivePrice >= entry
          ? "positive"
          : effectiveLivePrice <= invalidation
            ? "negative"
            : "neutral"
        : effectiveLivePrice <= entry
          ? "positive"
          : effectiveLivePrice >= invalidation
            ? "negative"
            : "neutral"
      : "neutral";

  const liveColor = currentBias === "positive" ? "#82d8b2" : currentBias === "negative" ? "#f08aa1" : "#e1c15f";

  const applyVisibleRange = useCallback((chartBars: NonNullable<typeof candleData>, mode: "fit" | "live-edge" = "fit") => {
    if (!chartRef.current || !chartBars.length) return;
    if (visibleRangeFrameRef.current !== null) {
      window.cancelAnimationFrame(visibleRangeFrameRef.current);
    }

    visibleRangeFrameRef.current = window.requestAnimationFrame(() => {
      const chart = chartRef.current;
      if (!chart || !chartBars.length) return;
      suppressRangeTrackingRef.current = true;

      chart.timeScale().applyOptions({
        rightOffset: 1,
        fixRightEdge: false,
      });

      if (mode === "fit") {
        chart.timeScale().fitContent();
      }

      const total = chartBars.length;
      const to = Math.max(0, total - 0.5);
      const from = Math.max(0, to - ACTUS_VISIBLE_BARS + 1);

      chart.timeScale().setVisibleLogicalRange({ from, to });
      userAtLiveEdgeRef.current = true;
      if (traceKey) {
        console.info(`[ACTUS][${traceKey}][viewport]`, {
          sanitizedCount: chartBars.length,
          from,
          to,
          mode,
        });
      }
      window.setTimeout(() => {
        suppressRangeTrackingRef.current = false;
      }, 0);
      visibleRangeFrameRef.current = null;
    });
  }, [timeframe, traceKey]);

  useEffect(() => {
    if (!containerRef.current) return;

    let chart: IChartApi | null = null;
    const container = containerRef.current;

    const ensureChart = () => {
      if (chartRef.current || !containerRef.current) return;

      const width = containerRef.current.clientWidth;
      const measuredHeight = containerRef.current.clientHeight || height;
      if (width <= 0 || measuredHeight <= 0) {
        mountFrameRef.current = window.requestAnimationFrame(ensureChart);
        return;
      }

      try {
        chart = createChart(containerRef.current, {
          autoSize: true,
          height,
          layout: {
            background: { type: ColorType.Solid, color: "#0b1018" },
            textColor: "rgba(177,191,216,0.74)",
            attributionLogo: false,
          },
          localization: {
            timeFormatter: (time: Time) => formatActusAxisTime(time, timeframe),
          },
          grid: {
            vertLines: { color: "rgba(255,255,255,0.012)" },
            horzLines: { color: "rgba(255,255,255,0.024)" },
          },
          rightPriceScale: {
            visible: true,
            borderColor: "rgba(255,255,255,0.035)",
            mode: PriceScaleMode.Normal,
            scaleMargins: { top: 0.09, bottom: 0.08 },
          },
          leftPriceScale: {
            visible: false,
          },
          timeScale: {
            borderColor: "rgba(255,255,255,0.04)",
            timeVisible: true,
            secondsVisible: timeframe === "1m",
            ticksVisible: true,
            rightOffset: 1.4,
            barSpacing: 8.6,
            minBarSpacing: 3.1,
            fixLeftEdge: true,
            fixRightEdge: false,
            tickMarkFormatter,
          },
          crosshair: {
            mode: CrosshairMode.Normal,
            vertLine: {
              visible: true,
              color: "rgba(184,198,222,0.1)",
              width: 1,
              style: LineStyle.Dotted,
              labelVisible: false,
            },
            horzLine: {
              visible: true,
              color: "rgba(184,198,222,0.12)",
              width: 1,
              style: LineStyle.Dotted,
              labelVisible: true,
            },
          },
          handleScroll: {
            mouseWheel: true,
            pressedMouseMove: true,
            horzTouchDrag: true,
            vertTouchDrag: false,
          },
          handleScale: {
            mouseWheel: true,
            pinch: true,
            axisPressedMouseMove: {
              time: true,
              price: false,
            },
            axisDoubleClickReset: {
              time: false,
              price: false,
            },
          },
        });
      } catch (error) {
        Sentry.captureException(error, {
          tags: { scope: "actus-chart-create", timeframe },
        });
        throw error;
      }

      const candleSeries = chart.addSeries(CandlestickSeries, {
        upColor: "#19d987",
        borderUpColor: "#19d987",
        wickUpColor: "rgba(25,217,135,0.88)",
        downColor: "#ff5f7d",
        borderDownColor: "#ff5f7d",
        wickDownColor: "rgba(255,95,125,0.88)",
        borderVisible: true,
        wickVisible: true,
        lastValueVisible: false,
        priceLineVisible: false,
        priceFormat,
      });

      chartRef.current = chart;
      candleSeriesRef.current = candleSeries;
      chart.resize(width, measuredHeight);
      setChartReadyTick((current) => current + 1);

      chart.timeScale().subscribeVisibleLogicalRangeChange((range) => {
        if (!latestCandleDataRef.current?.length || suppressRangeTrackingRef.current) return;
        if (!range) {
          userAtLiveEdgeRef.current = true;
          setAtLiveEdge(true);
          return;
        }

        const liveTo = latestCandleDataRef.current.length - 0.5;
        userAtLiveEdgeRef.current = range.to >= liveTo - 2;
        setAtLiveEdge(userAtLiveEdgeRef.current);
      });
    };

    ensureChart();

    resizeObserverRef.current = new ResizeObserver((entries) => {
      const entry = entries[0];
      if (!entry || !chartRef.current) return;
      const width = entry.contentRect.width;
      const nextHeight = entry.contentRect.height;
      if (width <= 0 || nextHeight <= 0) return;

      chartRef.current.resize(width, nextHeight);
    });
    resizeObserverRef.current.observe(container);

    return () => {
      if (mountFrameRef.current !== null) {
        window.cancelAnimationFrame(mountFrameRef.current);
        mountFrameRef.current = null;
      }
      resizeObserverRef.current?.disconnect();
      resizeObserverRef.current = null;
      chart?.remove();
      chartRef.current = null;
      candleSeriesRef.current = null;
      livePriceLineRef.current = null;
      entryPriceLineRef.current = null;
      stopPriceLineRef.current = null;
      deltaPriceLineRef.current = null;
      gammaFlipLineRef.current = null;
      callWallLineRef.current = null;
      putWallLineRef.current = null;
      anchorLineRef.current = null;
      spotReferenceLineRef.current = null;
      dayHighLineRef.current = null;
      dayLowLineRef.current = null;
      previousDataRef.current = null;
      if (visibleRangeFrameRef.current !== null) {
        window.cancelAnimationFrame(visibleRangeFrameRef.current);
        visibleRangeFrameRef.current = null;
      }
    };
  }, [height, timeframe, tickMarkFormatter]);

  useEffect(() => {
    if (!candleSeriesRef.current) return;

    const nextDeltaPrice = deltaPlan.visible ? deltaPlan.price : null;
    const nextAxisLabelVisible =
      deltaPlan.axisLabelVisible &&
      deltaAxisLabelVisible({
        symbol,
        livePrice: livePriceValueRef.current,
        deltaPrice: nextDeltaPrice,
        gammaOverlay: gammaOverlay ?? null,
      });

    if (deltaPriceValueRef.current === nextDeltaPrice && deltaPriceTitleRef.current === deltaPlan.title) {
      if (deltaPriceLineRef.current && "applyOptions" in deltaPriceLineRef.current) {
        deltaPriceLineRef.current.applyOptions({
          axisLabelVisible: nextAxisLabelVisible,
        });
      }
      return;
    }

    if (nextDeltaPrice !== null) {
      if (deltaPriceLineRef.current && "applyOptions" in deltaPriceLineRef.current) {
        deltaPriceLineRef.current.applyOptions({
          price: nextDeltaPrice,
          color: deltaPlan.color,
          lineWidth: deltaPlan.lineWidth,
          lineStyle: deltaPlan.lineStyle,
          axisLabelVisible: nextAxisLabelVisible,
          title: deltaPlan.title,
        });
      } else {
        if (deltaPriceLineRef.current) {
          candleSeriesRef.current.removePriceLine(deltaPriceLineRef.current);
        }
        deltaPriceLineRef.current = candleSeriesRef.current.createPriceLine({
          price: nextDeltaPrice,
          color: deltaPlan.color,
          lineWidth: deltaPlan.lineWidth,
          lineStyle: deltaPlan.lineStyle,
          axisLabelVisible: nextAxisLabelVisible,
          title: deltaPlan.title,
        });
      }
    } else if (deltaPriceLineRef.current) {
      candleSeriesRef.current.removePriceLine(deltaPriceLineRef.current);
      deltaPriceLineRef.current = null;
    }

    deltaPriceValueRef.current = nextDeltaPrice;
    deltaPriceTitleRef.current = deltaPlan.title;
  }, [chartReadyTick, deltaPlan, effectiveLivePrice, gammaOverlay, symbol]);

  useEffect(() => {
    if (!candleSeriesRef.current) return;

    const symbolChanged = livePriceSymbolRef.current !== symbol;
    if (symbolChanged) {
      livePriceSymbolRef.current = symbol;
      livePriceValueRef.current = null;
    }

    const nextLivePrice =
      typeof effectiveLivePrice === "number" && Number.isFinite(effectiveLivePrice)
        ? effectiveLivePrice
        : symbolChanged
          ? null
          : livePriceValueRef.current;

    if (livePriceValueRef.current === nextLivePrice) {
      return;
    }

    if (nextLivePrice !== null) {
      if (livePriceLineRef.current && "applyOptions" in livePriceLineRef.current) {
        livePriceLineRef.current.applyOptions({
          price: nextLivePrice,
          color: liveColor,
          lineWidth: 2,
          lineStyle: LineStyle.Solid,
          axisLabelVisible: true,
          title: sourceLabels.live,
        });
      } else {
        if (livePriceLineRef.current) {
          candleSeriesRef.current.removePriceLine(livePriceLineRef.current);
        }
        livePriceLineRef.current = candleSeriesRef.current.createPriceLine({
          price: nextLivePrice,
          color: liveColor,
          lineWidth: 2,
          lineStyle: LineStyle.Solid,
          axisLabelVisible: true,
          title: sourceLabels.live,
        });
      }
    } else if (livePriceLineRef.current) {
      candleSeriesRef.current.removePriceLine(livePriceLineRef.current);
      livePriceLineRef.current = null;
    }

    livePriceValueRef.current = nextLivePrice;
  }, [chartReadyTick, effectiveLivePrice, liveColor, sourceLabels.live]);

  useEffect(() => {
    if (!candleSeriesRef.current) return;

    if (!candleData?.length) {
      if (traceKey) {
        console.info(`[ACTUS][${traceKey}][setData]`, {
          stage: "empty",
          propCount: candles?.length ?? 0,
          sanitizedCount: 0,
        });
      }
      candleSeriesRef.current.setData([]);
      previousDataRef.current = null;
      return;
    }

    const previousData = previousDataRef.current;
    const shouldReset =
      !previousData?.length ||
      candleData.length < previousData.length ||
      candleData[0]?.time !== previousData[0]?.time ||
      candleData.length - previousData.length > 1;

    if (shouldReset) {
      if (traceKey) {
        console.info(`[ACTUS][${traceKey}][setData]`, {
          stage: "bind",
          propCount: candles?.length ?? 0,
          sanitizedCount: candleData.length,
          first: candleData[0] ?? null,
          last: candleData[candleData.length - 1] ?? null,
        });
      }
      candleSeriesRef.current.setData(candleData);
      applyVisibleRange(candleData, "fit");
    } else {
      const latest = candleData[candleData.length - 1];
      if (traceKey) {
        console.info(`[ACTUS][${traceKey}][update]`, {
          propCount: candles?.length ?? 0,
          sanitizedCount: candleData.length,
          latest: latest ?? null,
        });
      }
      candleSeriesRef.current.update(latest);
      if (userAtLiveEdgeRef.current) {
        applyVisibleRange(candleData, "live-edge");
      }
    }
    previousDataRef.current = candleData;
  }, [applyVisibleRange, candleData, candles?.length, chartReadyTick, traceKey]);

  useEffect(() => {
    const series = candleSeriesRef.current;
    if (!series) return;
    const labelPlan = dedupeOverlayLabels({
      symbol,
      livePrice: livePriceValueRef.current,
      overlay: {
        gammaFlip: gammaOverlay?.gammaFlip,
        callWall: gammaOverlay?.callWall,
        putWall: gammaOverlay?.putWall,
        anchor: gammaOverlay?.anchor,
        spotReference: gammaOverlay?.spotReference,
      },
    });

    const syncPriceLine = (
      ref: { current: IPriceLine | null },
      price: number | null | undefined,
      kind: OverlayKind,
      previousPrice: number | null,
    ) => {
      const nextPrice = typeof price === "number" && Number.isFinite(price) ? price : null;
      const style = overlayLineStyle(kind, symbol);
      const plan = labelPlan[kind];
      const nextTitle = plan.title;
      const previousTitle = overlayTitleRef.current[kind];

      if (previousPrice === nextPrice && previousTitle === nextTitle) {
        return previousPrice;
      }

      if (nextPrice === null) {
        if (ref.current) {
          series.removePriceLine(ref.current);
          ref.current = null;
        }
        overlayTitleRef.current[kind] = nextTitle;
        return null;
      }

      if (ref.current && "applyOptions" in ref.current) {
        ref.current.applyOptions({
          price: nextPrice,
          color: style.color,
          lineWidth: style.lineWidth,
          lineStyle: style.lineStyle,
          axisLabelVisible: plan.axisLabelVisible && style.axisLabelVisible,
          title: nextTitle,
        });
      } else {
        if (ref.current) {
          series.removePriceLine(ref.current);
        }
        ref.current = series.createPriceLine({
          price: nextPrice,
          color: style.color,
          lineWidth: style.lineWidth,
          lineStyle: style.lineStyle,
          axisLabelVisible: plan.axisLabelVisible && style.axisLabelVisible,
          title: nextTitle,
        });
      }
      overlayTitleRef.current[kind] = nextTitle;
      return nextPrice;
    };

    const previousOverlay = overlayValuesRef.current;
    const nextSource = gammaOverlay?.source ?? null;
    const nextUpdatedAt = gammaOverlay?.updatedAt ?? null;

    const nextGammaFlip = syncPriceLine(gammaFlipLineRef, gammaOverlay?.gammaFlip, "gammaFlip", previousOverlay.gammaFlip);
    const nextCallWall = syncPriceLine(callWallLineRef, gammaOverlay?.callWall, "callWall", previousOverlay.callWall);
    const nextPutWall = syncPriceLine(putWallLineRef, gammaOverlay?.putWall, "putWall", previousOverlay.putWall);
    const nextAnchor = syncPriceLine(anchorLineRef, gammaOverlay?.anchor, "anchor", previousOverlay.anchor);
    const nextSpot = syncPriceLine(spotReferenceLineRef, gammaOverlay?.spotReference, "spotReference", previousOverlay.spotReference);

    overlayValuesRef.current = {
      gammaFlip: nextGammaFlip,
      callWall: nextCallWall,
      putWall: nextPutWall,
      anchor: nextAnchor,
      spotReference: nextSpot,
      source: nextSource,
      updatedAt: nextUpdatedAt,
    };

    if (traceKey) {
      console.info(`[ACTUS][${traceKey}][overlay]`, {
        gammaFlip: overlayValuesRef.current.gammaFlip,
        callWall: overlayValuesRef.current.callWall,
        putWall: overlayValuesRef.current.putWall,
        anchor: overlayValuesRef.current.anchor,
        spotReference: overlayValuesRef.current.spotReference,
        source: overlayValuesRef.current.source,
        updatedAt: overlayValuesRef.current.updatedAt,
      });
    }
  }, [chartReadyTick, effectiveLivePrice, gammaOverlay, symbol, traceKey]);

  useEffect(() => {
    const series = candleSeriesRef.current;
    if (!series) return;

    const nextDeltaPrice = deltaPlan.visible ? deltaPlan.price : null;
    const labelPlan = secondaryReferenceLabelPlan({
      symbol,
      livePrice: effectiveLivePrice,
      gammaOverlay: gammaOverlay ?? null,
      deltaPrice: nextDeltaPrice,
      dayHigh,
      dayLow,
    });

    const syncSecondaryReference = (
      ref: { current: IPriceLine | null },
      price: number | null | undefined,
      kind: SecondaryReferenceKind,
      previousPrice: number | null,
    ) => {
      const nextPrice = typeof price === "number" && Number.isFinite(price) ? price : null;
      const style = secondaryReferenceStyle(kind);
      const plan = labelPlan[kind];
      const nextTitle = plan.title;
      const previousTitle = secondaryReferenceTitleRef.current[kind];

      if (previousPrice === nextPrice && previousTitle === nextTitle) {
        if (ref.current && "applyOptions" in ref.current) {
          ref.current.applyOptions({
            axisLabelVisible: plan.axisLabelVisible && style.axisLabelVisible,
            title: nextTitle,
          });
        }
        return previousPrice;
      }

      if (nextPrice === null) {
        if (ref.current) {
          series.removePriceLine(ref.current);
          ref.current = null;
        }
        secondaryReferenceTitleRef.current[kind] = nextTitle;
        return null;
      }

      if (ref.current && "applyOptions" in ref.current) {
        ref.current.applyOptions({
          price: nextPrice,
          color: style.color,
          lineWidth: style.lineWidth,
          lineStyle: style.lineStyle,
          axisLabelVisible: plan.axisLabelVisible && style.axisLabelVisible,
          title: nextTitle,
        });
      } else {
        if (ref.current) {
          series.removePriceLine(ref.current);
        }
        ref.current = series.createPriceLine({
          price: nextPrice,
          color: style.color,
          lineWidth: style.lineWidth,
          lineStyle: style.lineStyle,
          axisLabelVisible: plan.axisLabelVisible && style.axisLabelVisible,
          title: nextTitle,
        });
      }
      secondaryReferenceTitleRef.current[kind] = nextTitle;
      return nextPrice;
    };

    const previousSecondary = secondaryReferenceValuesRef.current;
    const nextDayHigh = syncSecondaryReference(dayHighLineRef, dayHigh, "dayHigh", previousSecondary.dayHigh);
    const nextDayLow = syncSecondaryReference(dayLowLineRef, dayLow, "dayLow", previousSecondary.dayLow);

    secondaryReferenceValuesRef.current = {
      dayHigh: nextDayHigh,
      dayLow: nextDayLow,
    };

    if (traceKey) {
      console.info(`[ACTUS][${traceKey}][session-structure]`, {
        dayHigh: secondaryReferenceValuesRef.current.dayHigh,
        dayLow: secondaryReferenceValuesRef.current.dayLow,
        dayHighLabelVisible: labelPlan.dayHigh.axisLabelVisible,
        dayLowLabelVisible: labelPlan.dayLow.axisLabelVisible,
      });
    }
  }, [chartReadyTick, dayHigh, dayLow, deltaPlan, effectiveLivePrice, gammaOverlay, symbol, traceKey]);

  useEffect(() => {
    if (!candleSeriesRef.current) return;

    const nextEntry = typeof entry === "number" && Number.isFinite(entry) ? entry : null;
    if (entryPriceValueRef.current === nextEntry) {
      return;
    }

    if (candleSeriesRef.current && nextEntry !== null) {
      if (entryPriceLineRef.current) {
        candleSeriesRef.current.removePriceLine(entryPriceLineRef.current);
      }
      entryPriceLineRef.current = candleSeriesRef.current.createPriceLine({
        price: nextEntry,
        color: "#46dca8",
        lineWidth: 1,
        lineStyle: LineStyle.Solid,
        axisLabelVisible: true,
        title: "ENTRY",
      });
      entryPriceValueRef.current = nextEntry;
    } else if (candleSeriesRef.current) {
      if (entryPriceLineRef.current) {
        candleSeriesRef.current.removePriceLine(entryPriceLineRef.current);
        entryPriceLineRef.current = null;
      }
      entryPriceValueRef.current = null;
    }
  }, [chartReadyTick, entry]);

  useEffect(() => {
    if (!candleSeriesRef.current) return;

    const nextStop = typeof invalidation === "number" && Number.isFinite(invalidation) ? invalidation : null;
    if (stopPriceValueRef.current === nextStop) {
      return;
    }

    if (candleSeriesRef.current && nextStop !== null) {
      if (stopPriceLineRef.current) {
        candleSeriesRef.current.removePriceLine(stopPriceLineRef.current);
      }
      stopPriceLineRef.current = candleSeriesRef.current.createPriceLine({
        price: nextStop,
        color: "#eb728f",
        lineWidth: 1,
        lineStyle: LineStyle.Solid,
        axisLabelVisible: true,
        title: "STOP",
      });
      stopPriceValueRef.current = nextStop;
    } else if (candleSeriesRef.current) {
      if (stopPriceLineRef.current) {
        candleSeriesRef.current.removePriceLine(stopPriceLineRef.current);
        stopPriceLineRef.current = null;
      }
      stopPriceValueRef.current = null;
    }
  }, [chartReadyTick, invalidation]);

  return (
    <div
      style={{
        position: "relative",
        width: "100%",
        minWidth: 0,
        height,
        minHeight: height,
        display: "block",
        borderRadius: 10,
        overflow: "hidden",
        background: "linear-gradient(180deg, rgba(10,16,28,0.78), rgba(5,9,16,0.94))",
      }}
    >
      <div
        style={{
          position: "absolute",
          top: 8,
          right: 10,
          zIndex: 2,
          display: "inline-flex",
          alignItems: "center",
          gap: 7,
          padding: "5px 9px",
          borderRadius: 999,
          background: atLiveEdge ? "rgba(69,255,181,0.1)" : "rgba(255,255,255,0.04)",
          border: atLiveEdge ? "1px solid rgba(69,255,181,0.22)" : "1px solid rgba(142,160,191,0.12)",
          color: atLiveEdge ? "#d7ffea" : "#b8c6de",
          fontSize: 10,
          letterSpacing: "0.08em",
          textTransform: "uppercase",
          fontWeight: 800,
          pointerEvents: "none",
          opacity: 0.95,
        }}
      >
        <span
          style={{
            width: 6,
            height: 6,
            borderRadius: 999,
            background: atLiveEdge ? "#45ffb5" : "#8ea0bf",
            boxShadow: atLiveEdge ? "0 0 10px rgba(69,255,181,0.7)" : "none",
          }}
        />
        <span>{atLiveEdge ? "Live Edge" : "Manual View"}</span>
      </div>
      <div
        style={{
          position: "absolute",
          left: 10,
          bottom: 10,
          zIndex: 2,
          display: "grid",
          gap: 6,
          width: "min(280px, calc(100% - 20px))",
          maxWidth: "46%",
          pointerEvents: "none",
        }}
      >
        <div
          style={{
            display: "grid",
            gap: 3,
            minWidth: 0,
            padding: "7px 9px",
            borderRadius: 12,
            background: gammaTone.background,
            border: `1px solid ${gammaTone.border}`,
            boxShadow: "inset 0 1px 0 rgba(255,255,255,0.025)",
            backdropFilter: "blur(4px)",
            opacity: 0.94,
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 7, minWidth: 0 }}>
            <span
              style={{
                width: 6,
                height: 6,
                borderRadius: 999,
                background: gammaTone.accent,
                boxShadow: `0 0 8px ${gammaTone.accent}`,
                flex: "0 0 auto",
              }}
            />
            <span
              style={{
                fontSize: 10,
                color: gammaTone.color,
                letterSpacing: "0.1em",
                textTransform: "uppercase",
                fontWeight: 800,
                whiteSpace: "nowrap",
              }}
            >
              {gammaTone.label}
            </span>
          </div>
          <div style={{ fontSize: 11, color: "#eef4ff", fontWeight: 700, lineHeight: 1.2 }}>{gammaSummary.title}</div>
          <div style={{ fontSize: 10, color: "#b8c6de", lineHeight: 1.2 }}>{gammaSummary.detail}</div>
        </div>
        <div
          style={{
            display: "grid",
            gap: 3,
            minWidth: 0,
            padding: "7px 9px",
            borderRadius: 12,
            background: deltaTone.background,
            border: `1px solid ${deltaTone.border}`,
            boxShadow: "inset 0 1px 0 rgba(255,255,255,0.025)",
            backdropFilter: "blur(4px)",
            opacity: 0.94,
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 7, minWidth: 0 }}>
            <span
              style={{
                width: 6,
                height: 6,
                borderRadius: 999,
                background: deltaTone.accent,
                boxShadow: `0 0 8px ${deltaTone.accent}`,
                flex: "0 0 auto",
              }}
            />
            <span
              style={{
                fontSize: 10,
                color: deltaTone.color,
                letterSpacing: "0.1em",
                textTransform: "uppercase",
                fontWeight: 800,
                whiteSpace: "nowrap",
              }}
            >
              {deltaTone.label}
            </span>
          </div>
          <div style={{ fontSize: 11, color: "#eef4ff", fontWeight: 700, lineHeight: 1.2 }}>{deltaSummary.title}</div>
          <div style={{ fontSize: 10, color: "#b8c6de", lineHeight: 1.2 }}>{deltaSummary.detail}</div>
        </div>
      </div>
      <div ref={containerRef} style={{ width: "100%", minWidth: 0, height, minHeight: height, display: "block" }} />
    </div>
  );
}
