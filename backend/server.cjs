const express = require("express");
const cors = require("cors");
const dotenv = require("dotenv");
const path = require("node:path");
const { applyStateEngine, finalizeStateBoard, getStateCacheTtlMs } = require("./stateEngine.cjs");

dotenv.config({ path: path.resolve(__dirname, "..", ".env") });

const app = express();
app.use(cors());
app.use(express.json());

const PORT = process.env.PORT || 3001;
const MASSIVE_API_KEY = process.env.MASSIVE_API_KEY || "";
const MASSIVE_API_URL = process.env.MASSIVE_API_URL || "https://api.massive.com";
const DATABENTO_API_KEY = process.env.DATABENTO_API_KEY || "";
const DATABENTO_HISTORICAL_API_URL =
  process.env.DATABENTO_HISTORICAL_API_URL || "https://hist.databento.com/v0";

const DEFAULT_TIMEFRAME = "5m";
const TIMEFRAME_CONFIGS = {
  "1m": { timeframe: "1m", multiplier: 1, timespan: "minute", daysBack: 2 },
  "5m": { timeframe: "5m", multiplier: 5, timespan: "minute", daysBack: 5 },
  "15m": { timeframe: "15m", multiplier: 15, timespan: "minute", daysBack: 7 },
  "1h": { timeframe: "1h", multiplier: 1, timespan: "hour", daysBack: 21 },
};

const ASSET_CONFIGS = [
  { name: "Bitcoin", symbol: "BTC/USD", ticker: "X:BTCUSD", precision: 2 },
  { name: "Ethereum", symbol: "ETH/USD", ticker: "X:ETHUSD", precision: 2 },
  { name: "Solana", symbol: "SOL/USD", ticker: "X:SOLUSD", precision: 2 },
  { name: "Gold", symbol: "XAU/USD", ticker: "GLD", precision: 2 },
  { name: "Nasdaq", symbol: "NQ", ticker: "QQQ", precision: 2 },
  { name: "Crude Oil", symbol: "CL", ticker: "USO", precision: 2 },
  { name: "EUR/USD", symbol: "EUR/USD", ticker: "C:EURUSD", precision: 5 },
];
const GAMMA_CONFIGS = {
  NQ: {
    asset: "NQ",
    dataset: "GLBX.MDP3",
    futureParent: "NQ.FUT",
    optionParent: "NQ.OPT",
    strikeWindowPct: 0.035,
    defaultTradeMinutes: 90,
  },
  GC: {
    asset: "GC",
    dataset: "GLBX.MDP3",
    futureParent: "GC.FUT",
    optionParent: "OG.OPT",
    strikeWindowPct: 0.03,
    defaultTradeMinutes: 120,
  },
  CL: {
    asset: "CL",
    dataset: "GLBX.MDP3",
    futureParent: "CL.FUT",
    optionParent: "LO.OPT",
    strikeWindowPct: 0.05,
    defaultTradeMinutes: 120,
  },
};
const OPTIONS_CONFIGS = {
  NQ: {
    underlyingAsset: "NQ",
    underlyingSymbol: "NQ.c.0",
    optionParent: "NQ.OPT",
    dataset: "GLBX.MDP3",
    strikeWindowPct: 0.035,
    maxContracts: 60,
    definitionLookbackDays: 3,
    maxExpiries: 2,
  },
  GC: {
    underlyingAsset: "GC",
    underlyingSymbol: "GC.c.0",
    optionParent: "OG.OPT",
    dataset: "GLBX.MDP3",
    strikeWindowPct: 0.06,
    maxContracts: 60,
    definitionLookbackDays: 2,
    maxExpiries: 2,
  },
  CL: {
    underlyingAsset: "CL",
    underlyingSymbol: "CL.c.0",
    optionParent: "LO.OPT",
    dataset: "GLBX.MDP3",
    strikeWindowPct: 0.08,
    maxContracts: 60,
    definitionLookbackDays: 2,
    maxExpiries: 2,
  },
};
const DATABENTO_FUTURES = {
  NQ: { asset: "NQ", symbol: "NQ.c.0", displayName: "Nasdaq", assetClass: "equity-index", priceScale: 2 },
  GC: { asset: "GC", symbol: "GC.c.0", displayName: "Gold", assetClass: "metal", priceScale: 2 },
  CL: { asset: "CL", symbol: "CL.c.0", displayName: "Crude Oil", assetClass: "energy", priceScale: 2 },
};
const BOARD_DATABENTO_MAP = {
  NQ: "NQ",
  "XAU/USD": "GC",
  CL: "CL",
};

let cardsCache = {};
let lastFetchAt = {};
let fetchInFlight = {};
let lastMode = "live-disconnected";
let lastWarning = null;
const stateTracker = new Map();
const assetCardCache = new Map();

function clamp(v, min, max) {
  return Math.max(min, Math.min(max, v));
}

function round(value, digits) {
  return Number(value.toFixed(digits));
}

function parseCsvLine(line) {
  const values = [];
  let current = "";
  let inQuotes = false;

  for (let i = 0; i < line.length; i += 1) {
    const char = line[i];

    if (char === '"') {
      if (inQuotes && line[i + 1] === '"') {
        current += '"';
        i += 1;
      } else {
        inQuotes = !inQuotes;
      }
      continue;
    }

    if (char === "," && !inQuotes) {
      values.push(current);
      current = "";
      continue;
    }

    current += char;
  }

  values.push(current);
  return values;
}

function parseCsv(text) {
  const lines = text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);

  if (!lines.length) return [];

  const header = parseCsvLine(lines[0]);
  return lines.slice(1).map((line) => {
    const row = parseCsvLine(line);
    return header.reduce((record, key, index) => {
      record[key] = row[index] ?? "";
      return record;
    }, {});
  });
}

function normalizeDatabentoNumber(value) {
  if (value === null || value === undefined || value === "") return null;
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return null;
  if (Math.abs(numeric) >= 1_000_000) {
    return numeric / 1_000_000_000;
  }
  return numeric;
}

function normalizeDatabentoTimestamp(value) {
  if (typeof value === "string" && /^\d+$/.test(value)) {
    const numeric = Number(value);
    if (Number.isFinite(numeric)) {
      return new Date(Math.floor(numeric / 1_000_000)).toISOString();
    }
  }

  const parsed = Date.parse(value);
  if (Number.isFinite(parsed)) {
    return new Date(parsed).toISOString();
  }

  return value;
}

function parseDatabentoNanoTimestamp(value) {
  if (value === null || value === undefined || value === "") {
    return null;
  }

  const numeric = Number(value);
  if (!Number.isFinite(numeric)) {
    return null;
  }

  return numeric;
}

function toIsoFromNano(value) {
  const numeric = parseDatabentoNanoTimestamp(value);
  if (numeric === null) {
    return null;
  }

  return new Date(Math.floor(numeric / 1_000_000)).toISOString();
}

function toIsoMinutesAgo(minutes) {
  return new Date(Date.now() - minutes * 60 * 1000).toISOString();
}

function toIsoDaysAgo(days) {
  return new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();
}

function databentoSafeEndIso() {
  return new Date(Date.now() - 30 * 60 * 1000).toISOString();
}

function isoMinutesBefore(referenceIso, minutes) {
  return new Date(Date.parse(referenceIso) - minutes * 60 * 1000).toISOString();
}

function timeframeToMinutes(timeframe) {
  if (timeframe === "1m") return 1;
  if (timeframe === "5m") return 5;
  if (timeframe === "15m") return 15;
  return 60;
}

function databentoLookbackMultiplier(timeframe) {
  if (timeframe === "1h") return 2.2;
  if (timeframe === "15m") return 1.8;
  if (timeframe === "5m") return 1.5;
  return 1.35;
}

function databentoSchemaForTimeframe(timeframe) {
  return "ohlcv-1m";
}

function normalizeDatabentoTimeframe(value) {
  return normalizeTimeframe(value);
}

function getDatabentoFuture(asset) {
  return DATABENTO_FUTURES[asset];
}

function aggregateCandles(rows, timeframe, future) {
  const minutes = timeframeToMinutes(timeframe);
  if (minutes === 1) {
    return rows.map((row) => ({
      asset: future.asset,
      symbol: future.symbol,
      timeframe,
      timestamp: normalizeDatabentoTimestamp(row.ts_event),
      open: round(normalizeDatabentoNumber(row.open) ?? 0, future.priceScale),
      high: round(normalizeDatabentoNumber(row.high) ?? 0, future.priceScale),
      low: round(normalizeDatabentoNumber(row.low) ?? 0, future.priceScale),
      close: round(normalizeDatabentoNumber(row.close) ?? 0, future.priceScale),
      volume: Number(row.volume ?? 0),
    }));
  }

  const grouped = new Map();

  rows.forEach((row) => {
    const timestamp = Date.parse(normalizeDatabentoTimestamp(row.ts_event));
    if (!Number.isFinite(timestamp)) return;
    const bucketStart = Math.floor(timestamp / (minutes * 60 * 1000)) * minutes * 60 * 1000;
    const key = new Date(bucketStart).toISOString();
    const open = normalizeDatabentoNumber(row.open) ?? 0;
    const high = normalizeDatabentoNumber(row.high) ?? 0;
    const low = normalizeDatabentoNumber(row.low) ?? 0;
    const close = normalizeDatabentoNumber(row.close) ?? 0;
    const volume = Number(row.volume ?? 0);

    const existing = grouped.get(key);
    if (!existing) {
      grouped.set(key, {
        asset: future.asset,
        symbol: future.symbol,
        timeframe,
        timestamp: key,
        open,
        high,
        low,
        close,
        volume,
      });
      return;
    }

    existing.high = Math.max(existing.high, high);
    existing.low = Math.min(existing.low, low);
    existing.close = close;
    existing.volume += volume;
  });

  return [...grouped.values()]
    .sort((a, b) => Date.parse(a.timestamp) - Date.parse(b.timestamp))
    .map((row) => ({
      ...row,
      open: round(row.open, future.priceScale),
      high: round(row.high, future.priceScale),
      low: round(row.low, future.priceScale),
      close: round(row.close, future.priceScale),
    }));
}

async function fetchDatabentoFuturesHistory(asset, timeframe, options = {}) {
  const future = getDatabentoFuture(asset);
  if (!future) {
    throw new Error(`Unsupported Databento futures asset: ${asset}`);
  }

  const normalizedTimeframe = normalizeDatabentoTimeframe(timeframe);
  const schema = databentoSchemaForTimeframe(normalizedTimeframe);
  const timeframeMinutes = timeframeToMinutes(normalizedTimeframe);
  const requestedAggregatedLimit = Number.isFinite(Number(options.limit))
    ? Math.max(1, Math.floor(Number(options.limit)))
    : normalizedTimeframe === "1h"
      ? 300
      : 4000;
  const end = options.end ?? databentoSafeEndIso();
  const computedLookbackMinutes = Math.ceil(
    requestedAggregatedLimit * timeframeMinutes * databentoLookbackMultiplier(normalizedTimeframe),
  );
  const rawLimit = Math.max(
    computedLookbackMinutes,
    timeframeMinutes === 1 ? requestedAggregatedLimit : timeframeMinutes * 24,
  );
  const start =
    options.start ??
    isoMinutesBefore(end, computedLookbackMinutes);

  const rows = await databentoHistorical({
    dataset: "GLBX.MDP3",
    schema,
    symbols: future.symbol,
    stype_in: "continuous",
    start,
    end,
    encoding: "csv",
    limit: rawLimit,
  });

  const aggregated = aggregateCandles(rows, normalizedTimeframe, future);
  if (normalizedTimeframe === "1h") {
    const firstRaw = rows[0]?.ts_event ?? null;
    const lastRaw = rows[rows.length - 1]?.ts_event ?? null;
    const firstAggregated = aggregated[0]?.timestamp ?? null;
    const lastAggregated = aggregated[aggregated.length - 1]?.timestamp ?? null;
    console.info("[ACTUS][1H][backend-fetch]", {
      asset,
      timeframe: normalizedTimeframe,
      requestedFinalLimit: requestedAggregatedLimit,
      rawMinuteRowsFetched: rows.length,
      firstRawTimestamp: firstRaw,
      lastRawTimestamp: lastRaw,
      aggregatedHourlyCandles: aggregated.length,
      firstAggregatedTimestamp: firstAggregated,
      lastAggregatedTimestamp: lastAggregated,
    });
  }
  return aggregated.slice(-requestedAggregatedLimit);
}

function writeSse(res, event, payload) {
  res.write(`event: ${event}\n`);
  res.write(`data: ${JSON.stringify(payload)}\n\n`);
}

async function databentoHistorical(query) {
  if (!DATABENTO_API_KEY) {
    throw new Error("Missing DATABENTO_API_KEY");
  }

  const url = new URL(`${DATABENTO_HISTORICAL_API_URL}/timeseries.get_range`);
  Object.entries(query).forEach(([key, value]) => {
    if (value !== undefined && value !== null && value !== "") {
      url.searchParams.set(key, String(value));
    }
  });

  const auth = Buffer.from(`${DATABENTO_API_KEY}:`).toString("base64");
  const res = await fetch(url.toString(), {
    headers: {
      Authorization: `Basic ${auth}`,
      Accept: "text/csv",
    },
  });

  const text = await res.text();
  if (!res.ok) {
    throw new Error(text || `Databento request failed with ${res.status}`);
  }

  return parseCsv(text);
}

function parseExpiration(value) {
  const time = value ? Date.parse(value) : Number.NaN;
  return Number.isFinite(time) ? time : null;
}

function pickNearestFutureDefinition(definitions) {
  const now = Date.now();
  return definitions
    .map((item) => ({
      rawSymbol: item.raw_symbol || item.symbol,
      expiration: parseExpiration(item.expiration),
      securityType: item.security_type || "",
      instrumentClass: item.instrument_class || "",
    }))
    .filter(
      (item) =>
        item.rawSymbol &&
        item.expiration &&
        item.expiration > now &&
        (item.securityType === "FUT" || item.instrumentClass === "F"),
    )
    .sort((a, b) => a.expiration - b.expiration)[0];
}

function normalizeOptionDefinition(row) {
  return {
    rawSymbol: row.raw_symbol || row.symbol,
    strike: normalizeDatabentoNumber(row.strike_price),
    expiration: parseExpiration(row.expiration),
    instrumentClass: row.instrument_class || "",
    securityType: row.security_type || "",
    underlying: row.underlying || "",
  };
}

function computeMid(bid, ask) {
  if (bid !== null && ask !== null && bid > 0 && ask > 0 && ask >= bid) {
    return round((bid + ask) / 2, 4);
  }
  return null;
}

function uniqueSortedNumbers(values) {
  return [...new Set(values.filter((value) => Number.isFinite(value)))].sort((a, b) => a - b);
}

async function buildOptionChainSnapshot(asset) {
  const config = OPTIONS_CONFIGS[asset];
  if (!config) {
    throw new Error(`Unsupported options underlying: ${asset}`);
  }

  const safeEnd = databentoSafeEndIso();
  const underlyingCandles = await fetchDatabentoFuturesHistory(asset, "1m", {
    start: asset === "GC" ? toIsoDaysAgo(7) : asset === "CL" ? toIsoDaysAgo(3) : toIsoMinutesAgo(240),
    end: safeEnd,
    limit: asset === "GC" ? 4000 : asset === "CL" ? 1800 : 240,
  });
  const latestUnderlying = underlyingCandles[underlyingCandles.length - 1];

  if (!latestUnderlying) {
    throw new Error(`No underlying futures price available for ${asset}`);
  }

  const definitions = await databentoHistorical({
    dataset: config.dataset,
    schema: "definition",
    symbols: config.optionParent,
    stype_in: "parent",
    start: toIsoDaysAgo(config.definitionLookbackDays ?? 3),
    end: safeEnd,
    encoding: "csv",
    limit: 8000,
  });

  const optionDefinitions = definitions
    .map((row) => ({
      rawSymbol: row.raw_symbol || row.symbol,
      expiry: toIsoFromNano(row.expiration),
      expiryNano: parseDatabentoNanoTimestamp(row.expiration),
      strike: normalizeDatabentoNumber(row.strike_price),
      right: row.instrument_class === "C" ? "C" : row.instrument_class === "P" ? "P" : null,
      securityType: row.security_type || "",
      underlying: row.underlying || "",
    }))
    .filter(
      (item) =>
        item.rawSymbol &&
        item.expiry &&
        item.expiryNano &&
        item.expiryNano > Date.now() * 1_000_000 &&
        item.strike !== null &&
        item.right &&
        (item.securityType === "OOF" || item.securityType === "OPT"),
    );

  const eligibleExpiries = uniqueSortedNumbers(optionDefinitions.map((item) => item.expiryNano)).slice(0, config.maxExpiries ?? 1);
  const nearestExpiryNano = eligibleExpiries[0] ?? null;

  if (!nearestExpiryNano) {
    throw new Error(`No active ${asset} options expiry found`);
  }

  const filteredDefinitions = optionDefinitions.filter((item) => eligibleExpiries.includes(item.expiryNano));
  const selectedDefinitions = optionDefinitions
    .filter((item) => eligibleExpiries.includes(item.expiryNano))
    .filter(
      (item) =>
        Math.abs((item.strike ?? 0) - latestUnderlying.close) / Math.max(latestUnderlying.close, 1) <= config.strikeWindowPct,
    )
    .sort((a, b) => Math.abs((a.strike ?? 0) - latestUnderlying.close) - Math.abs((b.strike ?? 0) - latestUnderlying.close))
    .reduce((acc, item) => {
      if (!acc.some((existing) => existing.rawSymbol === item.rawSymbol)) {
        acc.push(item);
      }
      return acc;
    }, [])
    .slice(0, config.maxContracts);

  const selectedSymbols = selectedDefinitions.map((item) => item.rawSymbol);
  if (!selectedSymbols.length) {
    throw new Error(
      `No ${asset} options contracts found near current price (expiries=${filteredDefinitions.length}, strikeWindowPct=${config.strikeWindowPct})`,
    );
  }

  const symbolQuery = selectedSymbols.join(",");
  const [quotes, trades, statistics] = await Promise.all([
    databentoHistorical({
      dataset: config.dataset,
      schema: "mbp-1",
      symbols: symbolQuery,
      stype_in: "raw_symbol",
      start: isoMinutesBefore(safeEnd, 30),
      end: safeEnd,
      encoding: "csv",
      limit: 50000,
    }),
    databentoHistorical({
      dataset: config.dataset,
      schema: "trades",
      symbols: symbolQuery,
      stype_in: "raw_symbol",
      start: isoMinutesBefore(safeEnd, 90),
      end: safeEnd,
      encoding: "csv",
      limit: 50000,
    }),
    databentoHistorical({
      dataset: config.dataset,
      schema: "statistics",
      symbols: symbolQuery,
      stype_in: "raw_symbol",
      start: toIsoDaysAgo(3),
      end: safeEnd,
      encoding: "csv",
      limit: 50000,
    }).catch(() => []),
  ]);

  const latestQuoteBySymbol = new Map();
  quotes.forEach((row) => {
    const symbol = row.symbol || row.raw_symbol;
    if (!symbol) return;
    latestQuoteBySymbol.set(symbol, row);
  });

  const tradeBySymbol = new Map();
  trades.forEach((row) => {
    const symbol = row.symbol || row.raw_symbol;
    if (!symbol) return;
    const bucket = tradeBySymbol.get(symbol) || { volume: 0, last: null, tsEvent: null };
    const size = Number(row.size || 0);
    bucket.volume += Number.isFinite(size) ? size : 0;
    bucket.last = normalizeDatabentoNumber(row.price);
    bucket.tsEvent = row.ts_event;
    tradeBySymbol.set(symbol, bucket);
  });

  const statisticsBySymbol = new Map();
  statistics.forEach((row) => {
    const symbol = row.symbol || row.raw_symbol;
    if (!symbol) return;
    statisticsBySymbol.set(symbol, row);
  });

  const nowMs = Date.now();

  const chain = selectedDefinitions.map((item) => {
    const quote = latestQuoteBySymbol.get(item.rawSymbol) ?? null;
    const trade = tradeBySymbol.get(item.rawSymbol) ?? null;
    const stats = statisticsBySymbol.get(item.rawSymbol) ?? null;
    const bid = normalizeDatabentoNumber(quote?.bid_px_00);
    const ask = normalizeDatabentoNumber(quote?.ask_px_00);
    const last = trade?.last ?? null;
    const mid = computeMid(bid, ask);
    const expiryMs = item.expiryNano ? Math.floor(item.expiryNano / 1_000_000) : null;
    const timeToExpiryYears =
      expiryMs && expiryMs > nowMs ? Number((((expiryMs - nowMs) / (365.25 * 24 * 60 * 60 * 1000))).toFixed(6)) : null;

    return {
      underlyingAsset: config.underlyingAsset,
      underlyingSymbol: config.underlyingSymbol,
      optionSymbol: item.rawSymbol,
      expiry: item.expiry,
      strike: item.strike,
      right: item.right,
      bid,
      ask,
      last,
      mid,
      volume: trade?.volume ?? (Number(stats?.volume ?? 0) || null),
      openInterest: Number(stats?.open_interest ?? 0) || null,
      timeToExpiryYears,
    };
  });

  return {
    underlyingAsset: config.underlyingAsset,
    underlyingSymbol: config.underlyingSymbol,
    underlyingPrice: latestUnderlying.close,
    expiry: new Date(Math.floor(nearestExpiryNano / 1_000_000)).toISOString(),
    contracts: chain,
  };
}

function aggregateStrikeVolumes(trades, selectedSymbols, optionLookup) {
  const byStrike = new Map();

  trades.forEach((trade) => {
    const rawSymbol = trade.symbol || trade.raw_symbol;
    if (!selectedSymbols.has(rawSymbol)) {
      return;
    }

    const option = optionLookup.get(rawSymbol);
    if (!option || !option.strike) {
      return;
    }

    const size = Number(trade.size || 0);
    if (!Number.isFinite(size) || size <= 0) {
      return;
    }

    const strikeKey = option.strike;
    const bucket = byStrike.get(strikeKey) || {
      strike: strikeKey,
      callVolume: 0,
      putVolume: 0,
      totalVolume: 0,
      symbols: [],
    };

    if (option.instrumentClass === "C") {
      bucket.callVolume += size;
    } else if (option.instrumentClass === "P") {
      bucket.putVolume += size;
    }

    bucket.totalVolume += size;
    if (!bucket.symbols.includes(rawSymbol)) {
      bucket.symbols.push(rawSymbol);
    }

    byStrike.set(strikeKey, bucket);
  });

  return [...byStrike.values()].sort((a, b) => b.totalVolume - a.totalVolume || a.strike - b.strike);
}

function pickCluster(strikes, side, currentPrice) {
  const filtered = strikes
    .filter((item) => (side === "above" ? item.strike >= currentPrice : item.strike <= currentPrice))
    .sort((a, b) => b.totalVolume - a.totalVolume || Math.abs(a.strike - currentPrice) - Math.abs(b.strike - currentPrice));

  return filtered[0] ?? null;
}

async function buildGammaSnapshot(asset, timeframe) {
  const config = GAMMA_CONFIGS[asset];
  if (!config) {
    throw new Error(`Unsupported gamma asset: ${asset}`);
  }

  const [futureDefinitions, optionDefinitionsRaw] = await Promise.all([
    databentoHistorical({
      dataset: config.dataset,
      schema: "definition",
      symbols: config.futureParent,
      stype_in: "parent",
      start: toIsoDaysAgo(3),
      encoding: "csv",
      limit: 500,
    }),
    databentoHistorical({
      dataset: config.dataset,
      schema: "definition",
      symbols: config.optionParent,
      stype_in: "parent",
      start: toIsoDaysAgo(3),
      encoding: "csv",
      limit: 25000,
    }),
  ]);

  const nearestFuture = pickNearestFutureDefinition(futureDefinitions);
  if (!nearestFuture?.rawSymbol) {
    throw new Error(`No active future found for ${asset}`);
  }

  const priceBars = await databentoHistorical({
    dataset: config.dataset,
    schema: timeframe === "1h" ? "ohlcv-1h" : "ohlcv-1m",
    symbols: nearestFuture.rawSymbol,
    start: timeframe === "1h" ? toIsoDaysAgo(5) : toIsoMinutesAgo(180),
    encoding: "csv",
    limit: timeframe === "1h" ? 64 : 240,
  });

  const lastBar = priceBars[priceBars.length - 1];
  const currentPrice = normalizeDatabentoNumber(lastBar?.close);
  if (!currentPrice) {
    throw new Error(`No usable futures price returned for ${nearestFuture.rawSymbol}`);
  }

  const optionDefinitions = optionDefinitionsRaw
    .map(normalizeOptionDefinition)
    .filter(
      (item) =>
        item.rawSymbol &&
        item.strike !== null &&
        item.expiration &&
        item.expiration > Date.now() &&
        item.securityType === "OOF" &&
        (item.instrumentClass === "C" || item.instrumentClass === "P"),
    );

  const nearestExpiry = optionDefinitions
    .map((item) => item.expiration)
    .sort((a, b) => a - b)[0];

  if (!nearestExpiry) {
    throw new Error(`No active option expiry found for ${asset}`);
  }

  const candidateOptions = optionDefinitions
    .filter((item) => item.expiration === nearestExpiry)
    .filter((item) => Math.abs(item.strike - currentPrice) / Math.max(currentPrice, 1) <= config.strikeWindowPct)
    .sort((a, b) => Math.abs(a.strike - currentPrice) - Math.abs(b.strike - currentPrice))
    .slice(0, 80);

  const selectedSymbols = new Set(candidateOptions.map((item) => item.rawSymbol));
  const optionLookup = new Map(candidateOptions.map((item) => [item.rawSymbol, item]));

  const trades = await databentoHistorical({
    dataset: config.dataset,
    schema: "trades",
    symbols: config.optionParent,
    stype_in: "parent",
    start: toIsoMinutesAgo(config.defaultTradeMinutes),
    end: new Date().toISOString(),
    encoding: "csv",
    limit: 50000,
  });

  const clusteredStrikes = aggregateStrikeVolumes(trades, selectedSymbols, optionLookup);
  const highestCallVolume = clusteredStrikes
    .filter((item) => item.callVolume > 0)
    .sort((a, b) => b.callVolume - a.callVolume || Math.abs(a.strike - currentPrice) - Math.abs(b.strike - currentPrice))[0] ?? null;
  const highestPutVolume = clusteredStrikes
    .filter((item) => item.putVolume > 0)
    .sort((a, b) => b.putVolume - a.putVolume || Math.abs(a.strike - currentPrice) - Math.abs(b.strike - currentPrice))[0] ?? null;
  const pinLevel =
    clusteredStrikes
      .slice()
      .sort((a, b) => b.totalVolume - a.totalVolume || Math.abs(a.strike - currentPrice) - Math.abs(b.strike - currentPrice))[0] ?? null;
  const aboveCluster = pickCluster(clusteredStrikes, "above", currentPrice);
  const belowCluster = pickCluster(clusteredStrikes, "below", currentPrice);

  return {
    asset,
    timeframe,
    futuresSymbol: nearestFuture.rawSymbol,
    currentPrice: round(currentPrice, 2),
    nearestExpiry: new Date(nearestExpiry).toISOString(),
    contractCount: candidateOptions.length,
    clusters: {
      highestCallVolume: highestCallVolume
        ? { strike: highestCallVolume.strike, volume: highestCallVolume.callVolume }
        : null,
      highestPutVolume: highestPutVolume
        ? { strike: highestPutVolume.strike, volume: highestPutVolume.putVolume }
        : null,
      highGammaZoneAbovePrice: aboveCluster
        ? { strike: aboveCluster.strike, volume: aboveCluster.totalVolume, distance: round(aboveCluster.strike - currentPrice, 2) }
        : null,
      highGammaZoneBelowPrice: belowCluster
        ? { strike: belowCluster.strike, volume: belowCluster.totalVolume, distance: round(currentPrice - belowCluster.strike, 2) }
        : null,
      potentialPinLevel: pinLevel
        ? { strike: pinLevel.strike, volume: pinLevel.totalVolume, distance: round(Math.abs(pinLevel.strike - currentPrice), 2) }
        : null,
      expansionZones: {
        above: clusteredStrikes
          .filter((item) => item.strike > currentPrice)
          .slice(0, 3)
          .map((item) => ({ strike: item.strike, volume: item.totalVolume })),
        below: clusteredStrikes
          .filter((item) => item.strike < currentPrice)
          .slice(0, 3)
          .map((item) => ({ strike: item.strike, volume: item.totalVolume })),
      },
    },
    notes: [
      "Phase 1 uses strike-volume clustering and proximity to price.",
      "This does not calculate full theoretical gamma yet.",
    ],
  };
}

function classifyOverlayRegime(spotReference, gammaFlip, callWall, putWall) {
  if (!Number.isFinite(spotReference)) {
    return null;
  }

  const distanceToFlipPct =
    Number.isFinite(gammaFlip) && gammaFlip !== 0 ? Math.abs((spotReference - gammaFlip) / gammaFlip) : Number.POSITIVE_INFINITY;
  const insideWalls =
    Number.isFinite(callWall) &&
    Number.isFinite(putWall) &&
    spotReference >= Math.min(callWall, putWall) &&
    spotReference <= Math.max(callWall, putWall);

  return insideWalls && distanceToFlipPct <= 0.0035 ? "PIN" : "EXPANSION";
}

function summarizeOverlayExposures(spotReference, strikeRows) {
  if (!strikeRows.length || !Number.isFinite(spotReference)) {
    return {
      gammaFlip: null,
      callWall: null,
      putWall: null,
      regime: null,
    };
  }

  const byStrike = new Map();
  strikeRows.forEach((row) => {
    if (!Number.isFinite(row.strike) || !Number.isFinite(row.exposure) || !row.side) {
      return;
    }

    const existing = byStrike.get(row.strike) || {
      strike: row.strike,
      callExposure: 0,
      putExposure: 0,
      netExposure: 0,
    };

    if (row.side === "call") {
      existing.callExposure += row.exposure;
    } else {
      existing.putExposure += row.exposure;
    }
    existing.netExposure = existing.callExposure - existing.putExposure;
    byStrike.set(row.strike, existing);
  });

  const strikes = [...byStrike.values()].sort((a, b) => a.strike - b.strike);
  const callWall =
    strikes
      .filter((strike) => strike.strike >= spotReference)
      .sort((a, b) => b.callExposure - a.callExposure || a.strike - b.strike)[0]?.strike ?? null;
  const putWall =
    strikes
      .filter((strike) => strike.strike <= spotReference)
      .sort((a, b) => b.putExposure - a.putExposure || b.strike - a.strike)[0]?.strike ?? null;

  let gammaFlip = null;
  for (let index = 1; index < strikes.length; index += 1) {
    const previous = strikes[index - 1];
    const current = strikes[index];
    if (previous.netExposure === 0 || current.netExposure === 0) continue;
    if ((previous.netExposure < 0 && current.netExposure > 0) || (previous.netExposure > 0 && current.netExposure < 0)) {
      gammaFlip = current.strike;
      break;
    }
  }

  return {
    gammaFlip,
    callWall,
    putWall,
    regime: classifyOverlayRegime(spotReference, gammaFlip, callWall, putWall),
  };
}

async function deribitPublic(method, params = {}) {
  const url = new URL(`https://www.deribit.com/api/v2/${method}`);
  Object.entries(params).forEach(([key, value]) => {
    if (value !== undefined && value !== null && value !== "") {
      url.searchParams.set(key, String(value));
    }
  });

  const response = await fetch(url.toString(), { headers: { Accept: "application/json" } });
  if (!response.ok) {
    throw new Error(`Deribit request failed: ${response.status}`);
  }

  const payload = await response.json();
  if (payload?.error) {
    throw new Error(payload.error.message || `Deribit error for ${method}`);
  }
  return payload.result;
}

async function buildBtcGammaOverlay() {
  const spotTicker = await deribitPublic("public/ticker", { instrument_name: "BTC-PERPETUAL" });
  const spotReference = Number(spotTicker?.index_price ?? spotTicker?.underlying_price ?? spotTicker?.last_price ?? 0);
  if (!Number.isFinite(spotReference) || spotReference <= 0) {
    throw new Error("BTC spot reference unavailable from Deribit");
  }

  const instruments = await deribitPublic("public/get_instruments", {
    currency: "BTC",
    kind: "option",
    expired: "false",
  });

  const active = Array.isArray(instruments)
    ? instruments.filter(
        (instrument) =>
          instrument &&
          instrument.is_active &&
          Number.isFinite(Number(instrument.expiration_timestamp)) &&
          Number.isFinite(Number(instrument.strike)) &&
          (instrument.option_type === "call" || instrument.option_type === "put"),
      )
    : [];

  const nearestExpiry =
    active
      .map((instrument) => Number(instrument.expiration_timestamp))
      .filter((expiry) => Number.isFinite(expiry) && expiry > Date.now())
      .sort((a, b) => a - b)[0] ?? null;

  if (!nearestExpiry) {
    throw new Error("BTC Deribit options expiry unavailable");
  }

  const selected = active
    .filter((instrument) => Number(instrument.expiration_timestamp) === nearestExpiry)
    .filter((instrument) => Math.abs(Number(instrument.strike) - spotReference) / spotReference <= 0.18)
    .sort((a, b) => Math.abs(Number(a.strike) - spotReference) - Math.abs(Number(b.strike) - spotReference))
    .slice(0, 64);

  if (!selected.length) {
    throw new Error("BTC Deribit options selection empty");
  }

  const tickers = await Promise.all(
    selected.map(async (instrument) => {
      const ticker = await deribitPublic("public/ticker", { instrument_name: instrument.instrument_name });
      return {
        strike: Number(instrument.strike),
        side: instrument.option_type === "call" ? "call" : "put",
        gamma: Number(ticker?.greeks?.gamma ?? NaN),
        openInterest: Number(ticker?.open_interest ?? 0),
        contractSize: Number(instrument.contract_size ?? 1),
        updatedAt: Number(ticker?.timestamp ?? nearestExpiry),
      };
    }),
  );

  const rows = tickers
    .filter((ticker) => Number.isFinite(ticker.gamma) && ticker.gamma > 0 && Number.isFinite(ticker.openInterest) && ticker.openInterest > 0)
    .map((ticker) => ({
      strike: ticker.strike,
      side: ticker.side,
      exposure: ticker.gamma * ticker.openInterest * ticker.contractSize * spotReference,
      updatedAt: ticker.updatedAt,
    }));

  const levels = summarizeOverlayExposures(spotReference, rows);

  return {
    gammaFlip: levels.gammaFlip,
    callWall: levels.callWall,
    putWall: levels.putWall,
    spotReference,
    regime: levels.regime,
    updatedAt: new Date(Math.max(...rows.map((row) => row.updatedAt).filter((value) => Number.isFinite(value)), Date.now())).toISOString(),
    source: "deribit-btc-option-chain",
  };
}

async function buildXauGammaOverlay(spotReferenceOverride) {
  let payload;
  try {
    payload = await massive("/v3/snapshot/options/GLD", {
      limit: 250,
      sort: "expiration_date",
      order: "asc",
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (message.includes("NOT_AUTHORIZED")) {
      return null;
    }
    throw error;
  }

  const results = Array.isArray(payload?.results) ? payload.results : [];
  const gldSpot = Number(results[0]?.underlying_asset?.price ?? 0);
  const xauSpot = Number.isFinite(Number(spotReferenceOverride)) ? Number(spotReferenceOverride) : gldSpot;

  if (!results.length || !Number.isFinite(gldSpot) || gldSpot <= 0 || !Number.isFinite(xauSpot) || xauSpot <= 0) {
    return null;
  }

  const nearestExpiry = results
    .map((item) => item?.details?.expiration_date)
    .filter(Boolean)
    .sort()[0];

  const ratio = xauSpot / gldSpot;
  const rows = results
    .filter((item) => item?.details?.expiration_date === nearestExpiry)
    .map((item) => {
      const gamma = Number(item?.greeks?.gamma ?? NaN);
      const openInterest = Number(item?.open_interest ?? 0);
      const strike = Number(item?.details?.strike_price ?? NaN);
      const sharesPerContract = Number(item?.details?.shares_per_contract ?? 100);
      const side = item?.details?.contract_type === "call" ? "call" : item?.details?.contract_type === "put" ? "put" : null;

      if (!Number.isFinite(gamma) || gamma <= 0 || !Number.isFinite(openInterest) || openInterest <= 0 || !Number.isFinite(strike) || !side) {
        return null;
      }

      return {
        strike: strike * ratio,
        side,
        exposure: gamma * openInterest * sharesPerContract * xauSpot,
      };
    })
    .filter(Boolean);

  if (!rows.length) {
    return null;
  }

  const levels = summarizeOverlayExposures(xauSpot, rows);
  return {
    gammaFlip: levels.gammaFlip,
    callWall: levels.callWall,
    putWall: levels.putWall,
    spotReference: xauSpot,
    regime: levels.regime,
    updatedAt: new Date().toISOString(),
    source: "gld-option-chain-proxy",
  };
}

async function buildActusGammaOverlay(asset, options = {}) {
  if (asset === "BTC") {
    return buildBtcGammaOverlay();
  }

  if (asset === "XAU") {
    return buildXauGammaOverlay(options.spotReference);
  }

  throw new Error(`Unsupported overlay asset: ${asset}`);
}

function normalizeTimeframe(value) {
  if (typeof value === "string" && TIMEFRAME_CONFIGS[value]) {
    return value;
  }
  return DEFAULT_TIMEFRAME;
}

async function massive(pathname, query = {}) {
  if (!MASSIVE_API_KEY) throw new Error("Missing MASSIVE_API_KEY");

  const url = new URL(`${MASSIVE_API_URL}${pathname}`);
  Object.entries(query).forEach(([key, value]) => {
    if (value !== undefined && value !== null && value !== "") {
      url.searchParams.set(key, String(value));
    }
  });
  url.searchParams.set("apiKey", MASSIVE_API_KEY);

  const res = await fetch(url.toString(), { headers: { Accept: "application/json" } });
  const text = await res.text();
  let body;
  try {
    body = JSON.parse(text);
  } catch {
    body = text;
  }

  if (!res.ok) {
    throw new Error(typeof body === "string" ? body : JSON.stringify(body));
  }

  return body;
}

function isoDateDaysAgo(daysAgo) {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() - daysAgo);
  return d.toISOString().slice(0, 10);
}

async function massiveAggs(ticker, multiplier, timespan, daysBack, limit = 5000) {
  const from = isoDateDaysAgo(daysBack);
  const to = isoDateDaysAgo(0);

  const payload = await massive(
    `/v2/aggs/ticker/${encodeURIComponent(ticker)}/range/${multiplier}/${timespan}/${from}/${to}`,
    { adjusted: "true", sort: "asc", limit: String(limit) },
  );

  const results = Array.isArray(payload?.results) ? payload.results : [];
  if (results.length < 2) {
    throw new Error(`Not enough aggregate bars returned for ${ticker}`);
  }
  return results;
}

function buildSparklineSeries(bars, precision) {
  return bars.slice(-32).map((bar) => round(Number(bar.c ?? bar.o ?? 0), precision));
}

function average(values) {
  if (!values.length) return 0;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function readBarValue(bar, primary, fallback) {
  return Number(bar[primary] ?? bar[fallback] ?? 0);
}

function getDecisionLookback(timeframe) {
  if (timeframe === "1m") return 6;
  if (timeframe === "5m") return 8;
  if (timeframe === "15m") return 10;
  return 12;
}

function buildLiveCard(config, timeframeConfig, bars) {
  const latest = bars[bars.length - 1];
  const previous = bars[bars.length - 2];
  const lookback = getDecisionLookback(timeframeConfig.timeframe);
  const windowBars = bars.slice(-lookback);
  const anchorBar = bars[Math.max(0, bars.length - lookback)];
  const open = readBarValue(latest, "o", "open") || readBarValue(previous ?? latest, "c", "close");
  const close = readBarValue(latest, "c", "close") || readBarValue(latest, "o", "open");
  const high = readBarValue(latest, "h", "high") || close;
  const low = readBarValue(latest, "l", "low") || close;
  const prevClose = readBarValue(previous ?? latest, "c", "close") || open;
  const anchorClose = readBarValue(anchorBar ?? previous ?? latest, "c", "close") || prevClose;
  const closes = windowBars.map((bar) => readBarValue(bar, "c", "close") || readBarValue(bar, "o", "open") || close);
  const windowHigh = Math.max(...windowBars.map((bar) => readBarValue(bar, "h", "high") || high));
  const windowLow = Math.min(...windowBars.map((bar) => readBarValue(bar, "l", "low") || low));
  const averageClose = average(closes);

  const price = round(close, config.precision);
  const change = anchorClose > 0 ? Number((((price - anchorClose) / anchorClose) * 100).toFixed(2)) : 0;
  const bias = change >= 0 ? "LONG" : "SHORT";
  const range = Math.max(windowHigh - windowLow, Math.max(price * 0.004, config.symbol === "EUR/USD" ? 0.0005 : 0.01));
  const baseline = averageClose || price;
  const distanceFromBaseline = baseline > 0 ? (price - baseline) / baseline : 0;
  const momentum = Number((distanceFromBaseline * (timeframeConfig.timeframe === "1h" ? 4.2 : timeframeConfig.timeframe === "15m" ? 5.2 : timeframeConfig.timeframe === "5m" ? 6.1 : 7.2)).toFixed(2));
  const rsi = Number((50 + Math.max(-24, Math.min(24, distanceFromBaseline * 1800))).toFixed(1));

  return {
    name: config.name,
    symbol: config.symbol,
    timeframe: timeframeConfig.timeframe,
    price,
    changePercent: change,
    bias,
    status: "BUILDING",
    action: "WAIT",
    quality: "B",
    entry: round(bias === "LONG" ? price - range * 0.14 : price + range * 0.14, config.precision),
    support: round(bias === "LONG" ? price - range * 0.34 : price + range * 0.34, config.precision),
    rsi,
    momentum,
    priceLevel: price,
    greenLine: round(baseline + range * 0.04, config.precision),
    redLine: round(baseline - range * 0.04, config.precision),
    sparkline: buildSparklineSeries(bars, config.precision),
    latestBar: {
      open: round(open, config.precision),
      high: round(high, config.precision),
      low: round(low, config.precision),
      close: round(close, config.precision),
    },
  };
}

async function refreshCards(timeframe) {
  const timeframeConfig = TIMEFRAME_CONFIGS[timeframe];
  const settled = await Promise.allSettled(
    ASSET_CONFIGS.map(async (config) => {
      const databentoAsset = BOARD_DATABENTO_MAP[config.symbol];
      const bars = databentoAsset
        ? await fetchDatabentoFuturesHistory(databentoAsset, timeframeConfig.timeframe, {
            limit: timeframeConfig.timeframe === "1h" ? 240 : 720,
          })
        : await massiveAggs(
            config.ticker,
            timeframeConfig.multiplier,
            timeframeConfig.timespan,
            timeframeConfig.daysBack,
          );
      return buildLiveCard(config, timeframeConfig, bars);
    }),
  );

  const warnings = [];
  const cards = [];

  settled.forEach((result, index) => {
    const config = ASSET_CONFIGS[index];
    const cacheKey = `${timeframe}:${config.symbol}`;

    if (result.status === "fulfilled") {
      assetCardCache.set(cacheKey, result.value);
      cards.push(result.value);
      return;
    }

    warnings.push(`${config.symbol}: ${result.reason?.message || "fetch failed"}`);
    const cachedCard = assetCardCache.get(cacheKey);
    if (cachedCard) {
      cards.push(cachedCard);
    }
  });

  if (!cards.length) {
    throw new Error(warnings[0] || "Massive aggregate request failed for every asset");
  }

  cardsCache[timeframe] = finalizeStateBoard(applyStateEngine(cards, timeframe, stateTracker, Date.now()), timeframe);
  lastFetchAt[timeframe] = Date.now();
  lastMode = warnings.length ? "massive-aggs-live-partial" : "massive-aggs-live";
  lastWarning = warnings.length ? warnings.join(" | ") : null;
  return cardsCache[timeframe];
}

async function getCardsCached(timeframe, forceRefresh = false) {
  const cached = cardsCache[timeframe];
  const fetchedAt = lastFetchAt[timeframe] ?? 0;
  const isFresh = cached && Date.now() - fetchedAt < getStateCacheTtlMs(timeframe);
  if (!forceRefresh && isFresh) return cached;
  if (!forceRefresh && fetchInFlight[timeframe]) return fetchInFlight[timeframe];

  fetchInFlight[timeframe] = refreshCards(timeframe)
    .catch((error) => {
      lastFetchAt[timeframe] = Date.now();
      lastMode = cardsCache[timeframe]?.length ? "massive-stale-fallback" : "massive-error";
      lastWarning = error.message || "Massive aggregate request failed";
      if (!cardsCache[timeframe]?.length) {
        cardsCache[timeframe] = [];
      }
      return cardsCache[timeframe];
    })
    .finally(() => {
      fetchInFlight[timeframe] = null;
    });

  return fetchInFlight[timeframe];
}

app.get("/api/health", async (req, res) => {
  const timeframe = normalizeTimeframe(req.query.timeframe);
  const cards = cardsCache[timeframe];
  res.json({
    ok: true,
    source: "actus-massive-aggs-cached",
    massiveConfigured: !!MASSIVE_API_KEY,
    cacheAgeMs: cards ? Date.now() - (lastFetchAt[timeframe] ?? 0) : null,
    mode: lastMode,
    timeframe,
    warning: lastWarning,
    assetCount: Array.isArray(cards) ? cards.length : 0,
    cachedSymbols: Array.isArray(cards) ? cards.map((card) => card.symbol) : [],
  });
});

app.get("/api/actus/cards", async (req, res) => {
  const timeframe = normalizeTimeframe(req.query.timeframe);
  const forceRefresh = String(req.query.force ?? "").toLowerCase() === "true";
  const cards = await getCardsCached(timeframe, forceRefresh);
  res.json({
    ok: true,
    mode: lastMode,
    timeframe,
    cards: cards.map((card) => ({
      ...card,
      debugState: {
        rawStateInputs: card.stateDebug?.rawStateInputs ?? null,
        chosenState: card.stateDebug?.chosenState ?? card.currentState ?? null,
        stateConfidence: card.stateDebug?.stateConfidence ?? card.stateConfidence ?? null,
        freshnessScore: card.stateDebug?.freshnessScore ?? card.freshnessScore ?? null,
        tooLateFlag: card.stateDebug?.tooLateFlag ?? card.tooLateFlag ?? null,
        topReasons: card.stateDebug?.topReasons ?? card.reasons?.slice(0, 3) ?? [],
      },
    })),
    warning: lastWarning,
    cacheAgeMs: cardsCache[timeframe] ? Date.now() - (lastFetchAt[timeframe] ?? 0) : null,
    assetCount: cards.length,
  });
});

app.get("/api/actus/gamma", async (req, res) => {
  try {
    const asset = typeof req.query.asset === "string" ? req.query.asset.toUpperCase() : "NQ";
    const timeframe = normalizeTimeframe(req.query.timeframe);
    const snapshot = await buildGammaSnapshot(asset, timeframe);
    res.json({
      ok: true,
      mode: "databento-volume-cluster-phase-1",
      snapshot,
    });
  } catch (error) {
    res.status(500).json({
      ok: false,
      error: error instanceof Error ? error.message : "Gamma snapshot failed",
    });
  }
});

app.get("/api/actus/gamma/overlay", async (req, res) => {
  try {
    const asset = typeof req.query.asset === "string" ? req.query.asset.toUpperCase() : "NQ";
    const spotReference = typeof req.query.spot === "string" ? Number(req.query.spot) : null;
    const overlay = await buildActusGammaOverlay(asset, { spotReference });

    res.json({
      ok: true,
      asset,
      overlay,
    });
  } catch (error) {
    res.status(500).json({
      ok: false,
      asset: typeof req.query.asset === "string" ? req.query.asset.toUpperCase() : "UNKNOWN",
      overlay: null,
      error: error instanceof Error ? error.message : "Gamma overlay failed",
    });
  }
});

app.get("/api/databento/futures/history", async (req, res) => {
  try {
    const asset = typeof req.query.asset === "string" ? req.query.asset.toUpperCase() : "NQ";
    const timeframe = normalizeDatabentoTimeframe(req.query.timeframe);
    const candles = await fetchDatabentoFuturesHistory(asset, timeframe, {
      start: typeof req.query.start === "string" ? req.query.start : undefined,
      end: typeof req.query.end === "string" ? req.query.end : undefined,
      limit: typeof req.query.limit === "string" ? Number(req.query.limit) : undefined,
    });

    if (timeframe === "1h") {
      console.info("[ACTUS][1H][api-response]", {
        asset,
        timeframe,
        returnedCandles: candles.length,
        firstReturnedTimestamp: candles[0]?.timestamp ?? null,
        lastReturnedTimestamp: candles[candles.length - 1]?.timestamp ?? null,
      });
    }

    res.json({
      ok: true,
      asset,
      timeframe,
      candles,
    });
  } catch (error) {
    res.status(500).json({
      ok: false,
      error: error instanceof Error ? error.message : "Databento futures history failed",
    });
  }
});

app.get("/api/databento/futures/live", async (req, res) => {
  const requestedAssets =
    typeof req.query.assets === "string"
      ? req.query.assets
          .split(",")
          .map((value) => value.trim().toUpperCase())
          .filter((value) => Boolean(DATABENTO_FUTURES[value]))
      : ["NQ", "GC", "CL"];
  const assets = requestedAssets.length ? requestedAssets : ["NQ", "GC", "CL"];
  const timeframe = normalizeDatabentoTimeframe(req.query.timeframe);
  const pollMs = timeframe === "1m" ? 4000 : timeframe === "5m" ? 8000 : 12000;
  const previous = new Map();

  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");
  res.flushHeaders?.();

  writeSse(res, "ready", { ok: true, assets, timeframe });

  let closed = false;
  req.on("close", () => {
    closed = true;
  });

  const pump = async () => {
    try {
      const payload = [];
      const settled = await Promise.allSettled(
        assets.map(async (asset) => ({
          asset,
          candles: await fetchDatabentoFuturesHistory(asset, timeframe, {
            start: timeframe === "1h" ? toIsoDaysAgo(2) : toIsoMinutesAgo(120),
            end: databentoSafeEndIso(),
            limit: timeframe === "1h" ? 48 : 240,
          }),
        })),
      );

      settled.forEach((result) => {
        if (result.status !== "fulfilled") {
          return;
        }

        const latest = result.value.candles[result.value.candles.length - 1];
        if (!latest) {
          return;
        }

        const key = `${result.value.asset}:${timeframe}`;
        const previousValue = previous.get(key);
        const nextValue = JSON.stringify(latest);

        if (previousValue !== nextValue) {
          previous.set(key, nextValue);
          payload.push(latest);
        }
      });

      if (payload.length) {
        writeSse(res, "candles", payload);
      } else {
        writeSse(res, "heartbeat", { ts: new Date().toISOString(), assets, timeframe });
      }
    } catch (error) {
      writeSse(res, "error", {
        ok: false,
        error: error instanceof Error ? error.message : "Databento futures live update failed",
      });
    }
  };

  const interval = setInterval(() => {
    if (closed) {
      clearInterval(interval);
      return;
    }
    void pump();
  }, pollMs);

  void pump();
});

app.get("/api/databento/options/chain", async (req, res) => {
  try {
    const asset = typeof req.query.asset === "string" ? req.query.asset.toUpperCase() : "NQ";
    const snapshot = await buildOptionChainSnapshot(asset);
    res.json({
      ok: true,
      snapshot,
    });
  } catch (error) {
    res.status(500).json({
      ok: false,
      error: error instanceof Error ? error.message : "Databento options chain failed",
    });
  }
});

app.listen(PORT, () => {
  console.log(`ACTUS Massive cached backend on http://localhost:${PORT}`);
});
