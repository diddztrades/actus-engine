import type { NormalizedFuturesCandle } from "../types/market";

export type ActusSessionName = "asia" | "london" | "new-york" | "overnight";

export type ActusSessionSnapshot = {
  asset: string;
  currentSession: ActusSessionName;
  asiaHigh: number | null;
  asiaLow: number | null;
  londonHigh: number | null;
  londonLow: number | null;
  nyOpenRangeHigh: number | null;
  nyOpenRangeLow: number | null;
  firstHourHigh: number | null;
  firstHourLow: number | null;
  dayHigh: number | null;
  dayLow: number | null;
  stretchFromBaseline: number | null;
  distanceFromSessionExtremes: {
    dayHigh: number | null;
    dayLow: number | null;
    asiaHigh: number | null;
    asiaLow: number | null;
    londonHigh: number | null;
    londonLow: number | null;
  };
  baseline: number | null;
  latestPrice: number | null;
  latestTimestamp: string | null;
};

type SessionWindow = {
  startMinutes: number;
  endMinutes: number;
};

type SessionEngineConfig = {
  asia: SessionWindow;
  london: SessionWindow;
  newYorkOpenRange: SessionWindow;
  firstHour: SessionWindow;
};

const DEFAULT_CONFIG: SessionEngineConfig = {
  asia: { startMinutes: 0, endMinutes: 8 * 60 },
  london: { startMinutes: 8 * 60, endMinutes: 13 * 60 + 30 },
  newYorkOpenRange: { startMinutes: 13 * 60 + 30, endMinutes: 14 * 60 },
  firstHour: { startMinutes: 13 * 60 + 30, endMinutes: 14 * 60 + 30 },
};

function round(value: number | null, digits = 2) {
  if (value === null || !Number.isFinite(value)) {
    return null;
  }

  return Number(value.toFixed(digits));
}

function candleMinutesUtc(timestamp: string) {
  const date = new Date(timestamp);
  return date.getUTCHours() * 60 + date.getUTCMinutes();
}

function candleDayKey(timestamp: string) {
  return new Date(timestamp).toISOString().slice(0, 10);
}

function inWindow(timestamp: string, window: SessionWindow) {
  const minutes = candleMinutesUtc(timestamp);
  return minutes >= window.startMinutes && minutes < window.endMinutes;
}

function computeRange(candles: NormalizedFuturesCandle[]) {
  if (!candles.length) {
    return { high: null, low: null };
  }

  return {
    high: candles.reduce((value, candle) => Math.max(value, candle.high), Number.NEGATIVE_INFINITY),
    low: candles.reduce((value, candle) => Math.min(value, candle.low), Number.POSITIVE_INFINITY),
  };
}

function averageClose(candles: NormalizedFuturesCandle[]) {
  if (!candles.length) {
    return null;
  }

  const total = candles.reduce((sum, candle) => sum + candle.close, 0);
  return total / candles.length;
}

function distance(current: number | null, level: number | null) {
  if (current === null || level === null) {
    return null;
  }

  return round(current - level, 2);
}

export function detectCurrentSession(timestamp: string, config: SessionEngineConfig = DEFAULT_CONFIG): ActusSessionName {
  if (inWindow(timestamp, config.asia)) return "asia";
  if (inWindow(timestamp, config.london)) return "london";
  if (inWindow(timestamp, config.firstHour)) return "new-york";
  return "overnight";
}

export function buildSessionSnapshot(
  candles: NormalizedFuturesCandle[],
  config: SessionEngineConfig = DEFAULT_CONFIG,
): ActusSessionSnapshot {
  const ordered = candles
    .slice()
    .sort((a, b) => Date.parse(a.timestamp) - Date.parse(b.timestamp));

  const latest = ordered[ordered.length - 1] ?? null;
  const asset = latest?.asset ?? "UNKNOWN";
  const latestPrice = latest?.close ?? null;
  const latestTimestamp = latest?.timestamp ?? null;

  if (!latest) {
    return {
      asset,
      currentSession: "overnight",
      asiaHigh: null,
      asiaLow: null,
      londonHigh: null,
      londonLow: null,
      nyOpenRangeHigh: null,
      nyOpenRangeLow: null,
      firstHourHigh: null,
      firstHourLow: null,
      dayHigh: null,
      dayLow: null,
      stretchFromBaseline: null,
      distanceFromSessionExtremes: {
        dayHigh: null,
        dayLow: null,
        asiaHigh: null,
        asiaLow: null,
        londonHigh: null,
        londonLow: null,
      },
      baseline: null,
      latestPrice,
      latestTimestamp,
    };
  }

  const currentDay = candleDayKey(latest.timestamp);
  const dayCandles = ordered.filter((candle) => candleDayKey(candle.timestamp) === currentDay);
  const asiaCandles = dayCandles.filter((candle) => inWindow(candle.timestamp, config.asia));
  const londonCandles = dayCandles.filter((candle) => inWindow(candle.timestamp, config.london));
  const nyOpenRangeCandles = dayCandles.filter((candle) => inWindow(candle.timestamp, config.newYorkOpenRange));
  const firstHourCandles = dayCandles.filter((candle) => inWindow(candle.timestamp, config.firstHour));

  const asiaRange = computeRange(asiaCandles);
  const londonRange = computeRange(londonCandles);
  const openRange = computeRange(nyOpenRangeCandles);
  const firstHourRange = computeRange(firstHourCandles);
  const dayRange = computeRange(dayCandles);
  const baseline = averageClose(dayCandles);
  const stretchFromBaseline =
    latestPrice !== null && baseline !== null && baseline !== 0
      ? round(((latestPrice - baseline) / baseline) * 100, 2)
      : null;

  return {
    asset,
    currentSession: detectCurrentSession(latest.timestamp, config),
    asiaHigh: round(asiaRange.high),
    asiaLow: round(asiaRange.low),
    londonHigh: round(londonRange.high),
    londonLow: round(londonRange.low),
    nyOpenRangeHigh: round(openRange.high),
    nyOpenRangeLow: round(openRange.low),
    firstHourHigh: round(firstHourRange.high),
    firstHourLow: round(firstHourRange.low),
    dayHigh: round(dayRange.high),
    dayLow: round(dayRange.low),
    stretchFromBaseline,
    distanceFromSessionExtremes: {
      dayHigh: distance(latestPrice, round(dayRange.high)),
      dayLow: distance(latestPrice, round(dayRange.low)),
      asiaHigh: distance(latestPrice, round(asiaRange.high)),
      asiaLow: distance(latestPrice, round(asiaRange.low)),
      londonHigh: distance(latestPrice, round(londonRange.high)),
      londonLow: distance(latestPrice, round(londonRange.low)),
    },
    baseline: round(baseline),
    latestPrice: round(latestPrice),
    latestTimestamp,
  };
}
