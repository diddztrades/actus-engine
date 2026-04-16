import { TickMarkType, type Time } from "lightweight-charts";
import type { TimeframeFilter } from "../types/chart";
import type { NormalizedFuturesCandle } from "../types/market";

export const ACTUS_VISIBLE_BARS = 200;
export const ACTUS_HISTORY_BUFFER = 80;
export const ACTUS_HISTORY_BARS = ACTUS_VISIBLE_BARS + ACTUS_HISTORY_BUFFER;
export const ACTUS_CHART_TIMEZONE =
  typeof Intl !== "undefined" ? Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC" : "UTC";

function timeToDate(time: Time) {
  if (typeof time === "number") {
    return new Date(time * 1000);
  }

  if (typeof time === "string") {
    return new Date(time);
  }

  return new Date(Date.UTC(time.year, time.month - 1, time.day));
}

export function actusTimeframeDurationMs(timeframe: TimeframeFilter) {
  if (timeframe === "1m") return 60_000;
  if (timeframe === "5m") return 300_000;
  if (timeframe === "15m") return 900_000;
  return 3_600_000;
}

export function actusHistoryLimit() {
  return ACTUS_HISTORY_BARS;
}

export function minimumActusHistoryCandles() {
  return ACTUS_VISIBLE_BARS;
}

export function closedCandleBoundaryMs(timeframe: TimeframeFilter, now: number) {
  const duration = actusTimeframeDurationMs(timeframe);
  return Math.floor(now / duration) * duration;
}

export function isClosedActusCandle(candle: NormalizedFuturesCandle, timeframe: TimeframeFilter, boundaryMs: number) {
  const startTime = new Date(candle.timestamp).getTime();
  if (!Number.isFinite(startTime)) {
    return false;
  }

  return startTime + actusTimeframeDurationMs(timeframe) <= boundaryMs;
}

export function formatActusAxisTime(time: Time, timeframe: TimeframeFilter) {
  const date = timeToDate(time);
  if (Number.isNaN(date.getTime())) {
    return "";
  }

  const options: Intl.DateTimeFormatOptions =
    timeframe === "1h"
      ? { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", hour12: false, timeZone: ACTUS_CHART_TIMEZONE }
      : { hour: "2-digit", minute: "2-digit", hour12: false, timeZone: ACTUS_CHART_TIMEZONE };

  return new Intl.DateTimeFormat("en-GB", options).format(date);
}

export function formatActusTickMark(time: Time, tickMarkType: TickMarkType, _locale: string, timeframe: TimeframeFilter) {
  const date = timeToDate(time);
  if (Number.isNaN(date.getTime())) {
    return "";
  }

  if (timeframe !== "1h") {
    return formatActusAxisTime(time, timeframe);
  }

  if (tickMarkType === TickMarkType.DayOfMonth) {
    return new Intl.DateTimeFormat("en-GB", {
      day: "numeric",
      month: "short",
      timeZone: ACTUS_CHART_TIMEZONE,
    }).format(date);
  }

  return new Intl.DateTimeFormat("en-GB", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
    timeZone: ACTUS_CHART_TIMEZONE,
  }).format(date);
}
