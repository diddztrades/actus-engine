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
import type { NormalizedFuturesCandle } from "../types/market";
import { Sentry } from "../sentry";

type Timeframe = TimeframeFilter;

type Props = {
  symbol?: string;
  candles?: NormalizedFuturesCandle[] | null;
  timeframe: Timeframe;
  height: number;
  entry?: number;
  invalidation?: number;
  gammaOverlay?: GammaOverlay | null;
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
  return null;
}

function overlayLineStyle(kind: "gammaFlip" | "callWall" | "putWall" | "anchor" | "spotReference") {
  if (kind === "gammaFlip") {
    return {
      title: "G-FLIP",
      color: "rgba(245, 200, 106, 0.88)",
      lineStyle: LineStyle.Dashed,
      lineWidth: 1 as const,
    };
  }

  if (kind === "callWall") {
    return {
      title: "CALL WALL",
      color: "rgba(98, 196, 255, 0.82)",
      lineStyle: LineStyle.Dashed,
      lineWidth: 2 as const,
    };
  }

  if (kind === "putWall") {
    return {
      title: "PUT WALL",
      color: "rgba(255, 123, 159, 0.82)",
      lineStyle: LineStyle.Dashed,
      lineWidth: 2 as const,
    };
  }

  if (kind === "anchor") {
    return {
      title: "ANCHOR",
      color: "rgba(122, 217, 209, 0.64)",
      lineStyle: LineStyle.Dashed,
      lineWidth: 1 as const,
    };
  }

  return {
    title: "SPOT",
    color: "rgba(179, 193, 218, 0.38)",
    lineStyle: LineStyle.Dotted,
    lineWidth: 1 as const,
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

export function ActusChart({ symbol, candles, timeframe, height, entry, invalidation, gammaOverlay }: Props) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const candleSeriesRef = useRef<ISeriesApi<"Candlestick", Time> | null>(null);
  const entryPriceLineRef = useRef<IPriceLine | null>(null);
  const stopPriceLineRef = useRef<IPriceLine | null>(null);
  const gammaFlipLineRef = useRef<IPriceLine | null>(null);
  const callWallLineRef = useRef<IPriceLine | null>(null);
  const putWallLineRef = useRef<IPriceLine | null>(null);
  const anchorLineRef = useRef<IPriceLine | null>(null);
  const spotReferenceLineRef = useRef<IPriceLine | null>(null);
  const previousDataRef = useRef<ReturnType<typeof buildCandlestickData> | null>(null);
  const latestCandleDataRef = useRef<ReturnType<typeof buildCandlestickData> | null>(null);
  const visibleRangeFrameRef = useRef<number | null>(null);
  const suppressRangeTrackingRef = useRef(false);
  const userAtLiveEdgeRef = useRef(true);
  const resizeObserverRef = useRef<ResizeObserver | null>(null);
  const mountFrameRef = useRef<number | null>(null);
  const entryPriceValueRef = useRef<number | null>(null);
  const stopPriceValueRef = useRef<number | null>(null);
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

  const candleData = useMemo(() => {
    if (!candles?.length) return null;
    return sanitizeCandlestickData(buildCandlestickData(candles));
  },
    [candles],
  );
  const lastValue = candleData?.[candleData.length - 1]?.close ?? null;
  const traceKey = useMemo(() => actusTraceKey(symbol, timeframe), [symbol, timeframe]);
  const [atLiveEdge, setAtLiveEdge] = useState(true);
  const priceFormat = useMemo(() => symbolPriceFormat(symbol), [symbol]);

  const tickMarkFormatter = useCallback((time: Time, _tickMarkType: TickMarkType, _locale: string) => {
    return formatActusTickMark(time, _tickMarkType, _locale, timeframe);
  }, [timeframe]);

  useEffect(() => {
    latestCandleDataRef.current = candleData;
  }, [candleData]);

  const currentBias =
    lastValue !== null && typeof entry === "number" && typeof invalidation === "number"
      ? entry > invalidation
        ? lastValue >= entry
          ? "positive"
          : lastValue <= invalidation
            ? "negative"
            : "neutral"
        : lastValue <= entry
          ? "positive"
          : lastValue >= invalidation
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
        lastValueVisible: true,
        priceLineVisible: true,
        priceLineColor: liveColor,
        priceFormat,
      });

      chartRef.current = chart;
      candleSeriesRef.current = candleSeries;
      chart.resize(width, measuredHeight);

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
      entryPriceLineRef.current = null;
      stopPriceLineRef.current = null;
      gammaFlipLineRef.current = null;
      callWallLineRef.current = null;
      putWallLineRef.current = null;
      anchorLineRef.current = null;
      spotReferenceLineRef.current = null;
      previousDataRef.current = null;
      if (visibleRangeFrameRef.current !== null) {
        window.cancelAnimationFrame(visibleRangeFrameRef.current);
        visibleRangeFrameRef.current = null;
      }
    };
  }, [height, timeframe, tickMarkFormatter]);

  useEffect(() => {
    if (!candleSeriesRef.current) return;

    candleSeriesRef.current.applyOptions({
      priceLineColor: liveColor,
    });
  }, [liveColor]);

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
  }, [applyVisibleRange, candleData, candles?.length, traceKey]);

  useEffect(() => {
    const series = candleSeriesRef.current;
    if (!series) return;

    const syncPriceLine = (
      ref: { current: IPriceLine | null },
      price: number | null | undefined,
      kind: "gammaFlip" | "callWall" | "putWall" | "anchor" | "spotReference",
      previousPrice: number | null,
    ) => {
      if (previousPrice === (typeof price === "number" && Number.isFinite(price) ? price : null)) {
        return previousPrice;
      }

      if (ref.current) {
        series.removePriceLine(ref.current);
        ref.current = null;
      }

      if (typeof price !== "number" || !Number.isFinite(price)) {
        return null;
      }

      const style = overlayLineStyle(kind);
      ref.current = series.createPriceLine({
        price,
        color: style.color,
        lineWidth: style.lineWidth,
        lineStyle: style.lineStyle,
        axisLabelVisible: true,
        title: style.title,
      });
      return price;
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
  }, [gammaOverlay, traceKey]);

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
  }, [entry]);

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
  }, [invalidation]);

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
      <div ref={containerRef} style={{ width: "100%", minWidth: 0, height, minHeight: height, display: "block" }} />
    </div>
  );
}
