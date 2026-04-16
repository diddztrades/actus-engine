const express = require("express");
const cors = require("cors");
const dotenv = require("dotenv");
const path = require("node:path");
const fs = require("node:fs");
const { spawn } = require("node:child_process");
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
  "6E": {
    asset: "6E",
    dataset: "GLBX.MDP3",
    futureParent: "6E.FUT",
    optionParent: "EUU.OPT",
    strikeWindowPct: 0.025,
    defaultTradeMinutes: 120,
  },
};
const OPTIONS_CONFIGS = {
  NQ: {
    underlyingAsset: "NQ",
    underlyingSymbol: "NQ.c.0",
    optionParent: "NQ.OPT",
    dataset: "GLBX.MDP3",
    strikeWindowPct: 0.045,
    maxContracts: 72,
    minContracts: 24,
    minContractsPerSide: 8,
    strikeWindowExpansionSteps: [1, 1.15, 1.3],
    definitionLookbackDays: 21,
    maxExpiries: 3,
    definitionLimit: 16000,
    underlyingHistoryDays: 2,
    underlyingHistoryLimit: 1200,
    enrichLiveContractData: true,
  },
  GC: {
    underlyingAsset: "GC",
    underlyingSymbol: "GC.c.0",
    optionParent: "OG.OPT",
    dataset: "GLBX.MDP3",
    strikeWindowPct: 0.065,
    maxContracts: 48,
    minContracts: 24,
    minContractsPerSide: 8,
    strikeWindowExpansionSteps: [1, 1.25, 1.5],
    definitionLookbackDays: 45,
    maxExpiries: 3,
    definitionLimit: 16000,
    underlyingHistoryDays: 2,
    underlyingHistoryLimit: 1200,
    enrichLiveContractData: true,
  },
  CL: {
    underlyingAsset: "CL",
    underlyingSymbol: "CL.c.0",
    optionParent: "LO.OPT",
    dataset: "GLBX.MDP3",
    strikeWindowPct: 0.08,
    maxContracts: 48,
    minContracts: 24,
    minContractsPerSide: 8,
    strikeWindowExpansionSteps: [1, 1.25, 1.5],
    definitionLookbackDays: 30,
    maxExpiries: 3,
    definitionLimit: 12000,
    underlyingHistoryDays: 2,
    underlyingHistoryLimit: 1200,
    enrichLiveContractData: true,
  },
  "6E": {
    underlyingAsset: "6E",
    underlyingSymbol: "6E.c.0",
    optionParent: "EUU.OPT",
    dataset: "GLBX.MDP3",
    strikeWindowPct: 0.03,
    maxContracts: 48,
    minContracts: 24,
    minContractsPerSide: 8,
    strikeWindowExpansionSteps: [1, 1.2, 1.4],
    definitionLookbackDays: 30,
    maxExpiries: 3,
    definitionLimit: 12000,
    underlyingHistoryDays: 2,
    underlyingHistoryLimit: 1200,
    enrichLiveContractData: true,
  },
  SOL_CME: {
    underlyingAsset: "SOL_CME",
    underlyingSymbol: "SOL.c.0",
    underlyingRoot: "SOL",
    optionParent: "SOL.OPT",
    optionParents: [
      "SOL.OPT",
      "SOM1.OPT",
      "SOM2.OPT",
      "SOM3.OPT",
      "SOM4.OPT",
      "SOM5.OPT",
      "SOT1.OPT",
      "SOT2.OPT",
      "SOT3.OPT",
      "SOT4.OPT",
      "SOT5.OPT",
      "SOW1.OPT",
      "SOW2.OPT",
      "SOW3.OPT",
      "SOW4.OPT",
      "SOW5.OPT",
      "SOH1.OPT",
      "SOH2.OPT",
      "SOH3.OPT",
      "SOH4.OPT",
      "SOH5.OPT",
      "SOF1.OPT",
      "SOF2.OPT",
      "SOF3.OPT",
      "SOF4.OPT",
    ],
    dataset: "GLBX.MDP3",
    strikeWindowPct: 0.18,
    maxContracts: 72,
    minContracts: 24,
    minContractsPerSide: 8,
    strikeWindowExpansionSteps: [1, 1.25, 1.5],
    definitionLookbackDays: 30,
    maxExpiries: 4,
    definitionLimit: 8000,
    underlyingHistoryDays: 2,
    underlyingHistoryLimit: 1200,
    enrichLiveContractData: true,
  },
};
const DATABENTO_FUTURES = {
  NQ: { asset: "NQ", symbol: "NQ.c.0", displayName: "Nasdaq", assetClass: "equity-index", priceScale: 2 },
  GC: { asset: "GC", symbol: "GC.c.0", displayName: "Gold", assetClass: "metal", priceScale: 2 },
  CL: { asset: "CL", symbol: "CL.c.0", displayName: "Crude Oil", assetClass: "energy", priceScale: 2 },
  "6E": { asset: "6E", symbol: "6E.c.0", displayName: "Euro FX", assetClass: "fx", priceScale: 5 },
  BTC: { asset: "BTC", symbol: "MBT.c.0", displayName: "Bitcoin", assetClass: "crypto", priceScale: 2, futureParent: "MBT.FUT" },
  SOL_CME: { asset: "SOL_CME", symbol: "SOL.c.0", displayName: "Solana CME", assetClass: "crypto", priceScale: 2, futureParent: "SOL.FUT" },
};
const BOARD_DATABENTO_MAP = {
  "BTC/USD": "BTC",
  NQ: "NQ",
  "XAU/USD": "GC",
  CL: "CL",
  "EUR/USD": "6E",
};
const OPTION_CHAIN_CACHE_FILE = path.resolve(__dirname, "option-chain-cache.json");
const NY_OPEN_FLOW_HISTORY_FILE = path.resolve(__dirname, "ny-open-flow-history.json");
const OPTION_CHAIN_CACHE_TTL_MS = 15 * 60 * 1000;
const DATABENTO_LIVE_STREAM_SCRIPT = path.resolve(__dirname, "databento_live_stream.py");
const STREAM_POINT_RETENTION_MS = 6 * 60 * 60 * 1000;
const STREAM_STALE_MS = 20_000;
const STREAM_HEARTBEAT_MS = 15_000;
const PYTHON_BIN = process.env.PYTHON_BIN || "python";

let cardsCache = {};
let lastFetchAt = {};
let fetchInFlight = {};
let lastMode = "live-disconnected";
let lastWarning = null;
const stateTracker = new Map();
const assetCardCache = new Map();
const optionChainCache = new Map();
const optionChainRefreshInFlight = new Map();
const activeFutureContractCache = new Map();
const activeFutureContractRefreshInFlight = new Map();
const actusTickStreams = new Map();
const nyOpenFlowCache = new Map();
const nyOpenFlowHistory = new Map();

try {
  if (fs.existsSync(OPTION_CHAIN_CACHE_FILE)) {
    const raw = fs.readFileSync(OPTION_CHAIN_CACHE_FILE, "utf8");
    const parsed = JSON.parse(raw);
    Object.entries(parsed ?? {}).forEach(([asset, entry]) => {
      if (entry?.snapshot && typeof entry?.cachedAt === "number") {
        optionChainCache.set(asset, entry);
      }
    });
  }
} catch {
  // Cache bootstrap is best-effort only.
}

try {
  if (fs.existsSync(NY_OPEN_FLOW_HISTORY_FILE)) {
    const raw = fs.readFileSync(NY_OPEN_FLOW_HISTORY_FILE, "utf8");
    const parsed = JSON.parse(raw);
    Object.entries(parsed ?? {}).forEach(([key, entry]) => {
      if (entry?.asset && entry?.date) {
        nyOpenFlowHistory.set(key, entry);
      }
    });
  }
} catch {
  // History bootstrap is best-effort only.
}

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

function databentoHistorySafeEndIso(timeframe) {
  const minutes = timeframeToMinutes(normalizeDatabentoTimeframe(timeframe));
  const bucketMs = minutes * 60 * 1000;
  const boundary = Math.floor(Date.now() / bucketMs) * bucketMs;
  return new Date(Math.max(boundary - 1, 0)).toISOString();
}

function databentoTradeSafeEndIso() {
  return new Date(Date.now() - 20 * 60 * 1000).toISOString();
}

function databentoLiveSafeEndIso() {
  return new Date().toISOString();
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

function databentoMinimumLookbackMinutes(asset, timeframe) {
  const normalizedAsset = typeof asset === "string" ? asset.toUpperCase() : "";
  if (!getDatabentoFuture(normalizedAsset)) return 0;
  if (normalizedAsset === "SOL_CME") {
    if (timeframe === "1m") return 24 * 60;
    if (timeframe === "5m") return 24 * 60;
    if (timeframe === "15m") return 48 * 60;
    return 24 * 60;
  }
  if (timeframe === "1m") return 12 * 60;
  if (timeframe === "5m") return 12 * 60;
  if (timeframe === "15m") return 18 * 60;
  return 24 * 60;
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

function getDatabentoFutureParent(asset) {
  return DATABENTO_FUTURES[asset]?.futureParent || GAMMA_CONFIGS[asset]?.futureParent || null;
}

function normalizeActusLivePriceAsset(asset) {
  const normalized = typeof asset === "string" ? asset.toUpperCase() : "";
  if (normalized === "XAU" || normalized === "XAU/USD" || normalized === "GC") return "GC";
  if (normalized === "NQ") return "NQ";
  if (normalized === "CL" || normalized === "OIL") return "CL";
  if (normalized === "EUR" || normalized === "EUR/USD" || normalized === "EURUSD" || normalized === "6E") return "6E";
  if (normalized === "BTC" || normalized === "BTC/USD") return "BTC";
  if (normalized === "ETH" || normalized === "ETH/USD") return "ETH";
  if (normalized === "SOL_CME" || normalized === "SOL-CME" || normalized === "SOL CME") return "SOL_CME";
  if (normalized === "SOL" || normalized === "SOL/USD") return "SOL";
  return null;
}

async function resolveDatabentoLiveRows(asset, schema, start, end, limit) {
  const activeRows = await resolveActiveDatabentoFutureRows(asset, schema, start, end, limit);
  if (activeRows?.rows?.length) {
    return activeRows;
  }

  const future = getDatabentoFuture(asset);
  if (!future) {
    return null;
  }

  const rows = await databentoHistoricalWithAvailableEndRetry({
    dataset: "GLBX.MDP3",
    schema,
    symbols: future.symbol,
    start,
    end,
    encoding: "csv",
    limit,
  }).catch(() => []);

  if (!rows.length) {
    return null;
  }

  return {
    rows,
    symbol: future.symbol,
    sourceType: "continuous",
  };
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
  const end = options.end ?? databentoHistorySafeEndIso(normalizedTimeframe);
  const computedLookbackMinutes = Math.max(
    Math.ceil(
      requestedAggregatedLimit * timeframeMinutes * databentoLookbackMultiplier(normalizedTimeframe),
    ),
    databentoMinimumLookbackMinutes(asset, normalizedTimeframe),
  );
  const rawLimit = Math.max(
    computedLookbackMinutes,
    timeframeMinutes === 1 ? requestedAggregatedLimit : timeframeMinutes * 24,
  );
  const start =
    options.start ??
    isoMinutesBefore(end, computedLookbackMinutes);

  const resolvedRows =
    (await resolveActiveDatabentoFutureRows(asset, schema, start, end, rawLimit)) ?? {
      rows: await databentoHistoricalWithAvailableEndRetry({
        dataset: "GLBX.MDP3",
        schema,
        symbols: future.symbol,
        stype_in: "continuous",
        start,
        end,
        encoding: "csv",
        limit: rawLimit,
      }),
      symbol: future.symbol,
      sourceType: "continuous",
    };

  const rows = resolvedRows.rows;

  const aggregated = aggregateCandles(rows, normalizedTimeframe, future);
  const candles = aggregated.slice(-requestedAggregatedLimit);
  if (options.includeMeta) {
    return {
      candles,
      resolvedSymbol: resolvedRows.symbol ?? future.symbol,
      sourceType: resolvedRows.sourceType ?? "continuous",
    };
  }
  return candles;
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

function extractDatabentoAvailableEnd(error) {
  const message = error instanceof Error ? error.message : String(error ?? "");
  if (!message) {
    return null;
  }

  const normalizedFromJson = message.match(/"available_end"\s*:\s*"([^"]+)"/i)?.[1] ?? null;
  if (normalizedFromJson) {
    const parsed = new Date(normalizedFromJson).toISOString();
    return Number.isFinite(Date.parse(parsed)) ? parsed : null;
  }

  const normalizedFromText = message.match(/available up to\s+([0-9:\-+\s.]+(?:Z|UTC)?)/i)?.[1] ?? null;
  if (!normalizedFromText) {
    return null;
  }

  const candidate = normalizedFromText.replace(/\s+/g, " ").trim().replace(" UTC", "Z").replace(" ", "T");
  const parsed = Date.parse(candidate);
  return Number.isFinite(parsed) ? new Date(parsed).toISOString() : null;
}

async function databentoHistoricalWithAvailableEndRetry(query) {
  try {
    return await databentoHistorical(query);
  } catch (error) {
    const availableEnd = extractDatabentoAvailableEnd(error);
    const currentEnd = typeof query.end === "string" ? query.end : null;
    if (!availableEnd || !currentEnd || availableEnd === currentEnd) {
      throw error;
    }

    return databentoHistorical({
      ...query,
      end: availableEnd,
    });
  }
}

function parseExpiration(value) {
  if (value === undefined || value === null || value === "") {
    return null;
  }

  const numeric = Number(value);
  if (Number.isFinite(numeric) && numeric > 0) {
    if (numeric > 1e15) {
      return Math.floor(numeric / 1e6);
    }
    if (numeric > 1e12) {
      return Math.floor(numeric / 1e3);
    }
    return numeric;
  }

  const time = Date.parse(value);
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
        !item.rawSymbol.includes("-") &&
        item.expiration &&
        item.expiration > now &&
        (item.securityType === "FUT" || item.instrumentClass === "F"),
    )
    .sort((a, b) => a.expiration - b.expiration)[0];
}

function pickCandidateFutureDefinitions(definitions, maxCount = 4) {
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
        !item.rawSymbol.includes("-") &&
        item.expiration &&
        item.expiration > now &&
        (item.securityType === "FUT" || item.instrumentClass === "F"),
    )
    .sort((a, b) => a.expiration - b.expiration)
    .slice(0, maxCount);
}

async function resolveActiveDatabentoFutureRows(asset, schema, start, end, limit) {
  const resolvedContract = await resolveActiveDatabentoFutureContract(asset, { end });
  if (resolvedContract?.rawSymbol) {
    const rows = await databentoHistoricalWithAvailableEndRetry({
      dataset: "GLBX.MDP3",
      schema,
      symbols: resolvedContract.rawSymbol,
      stype_in: "raw_symbol",
      start,
      end,
      encoding: "csv",
      limit,
    }).catch(() => []);
    if (rows.length) {
      return {
        rows,
        symbol: resolvedContract.rawSymbol,
        sourceType: "raw_symbol",
      };
    }
  }

  const futureParent = getDatabentoFutureParent(asset);
  if (!futureParent) {
    return null;
  }

  const definitions = await databentoHistorical({
    dataset: "GLBX.MDP3",
    schema: "definition",
    symbols: futureParent,
    stype_in: "parent",
    start: isoDateDaysAgo(3),
    encoding: "csv",
    limit: 500,
  }).catch(() => []);

  const candidates = pickCandidateFutureDefinitions(definitions);
  let bestMatch = null;
  for (const candidate of candidates) {
    const rows = await databentoHistoricalWithAvailableEndRetry({
      dataset: "GLBX.MDP3",
      schema,
      symbols: candidate.rawSymbol,
      stype_in: "raw_symbol",
      start,
      end,
      encoding: "csv",
      limit,
    }).catch(() => []);
    if (rows.length) {
      const latestTimestamp = Date.parse(rows[rows.length - 1]?.ts_event || "") || 0;
      const nextMatch = {
        rows,
        symbol: candidate.rawSymbol,
        sourceType: "raw_symbol",
        score: rows.length,
        latestTimestamp,
      };
      if (
        !bestMatch ||
        nextMatch.score > bestMatch.score ||
        (nextMatch.score === bestMatch.score && nextMatch.latestTimestamp > bestMatch.latestTimestamp)
      ) {
        bestMatch = nextMatch;
      }
    }
  }

  if (!bestMatch) {
    return null;
  }

  return {
    rows: bestMatch.rows,
    symbol: bestMatch.symbol,
    sourceType: bestMatch.sourceType,
  };
}

async function resolveActiveDatabentoFutureContract(asset, options = {}) {
  const normalizedAsset = typeof asset === "string" ? asset.toUpperCase() : asset;
  const cacheKey = normalizedAsset;
  const cached = activeFutureContractCache.get(cacheKey);
  if (cached && Date.now() - cached.cachedAt <= 15_000) {
    return cached.contract;
  }

  if (activeFutureContractRefreshInFlight.has(cacheKey)) {
    return activeFutureContractRefreshInFlight.get(cacheKey);
  }

  const request = (async () => {
    const futureParent = getDatabentoFutureParent(normalizedAsset);
    if (!futureParent) {
      return null;
    }

    const definitions = await databentoHistorical({
      dataset: "GLBX.MDP3",
      schema: "definition",
      symbols: futureParent,
      stype_in: "parent",
      start: isoDateDaysAgo(3),
      encoding: "csv",
      limit: 500,
    }).catch(() => []);

    const candidates = pickCandidateFutureDefinitions(definitions);
    if (!candidates.length) {
      return null;
    }

    const end = options.end ?? databentoLiveSafeEndIso();
    const start = isoMinutesBefore(end, normalizedAsset === "GC" ? 360 : 180);

    let bestMatch = null;
    for (const candidate of candidates) {
      const tradeRows = await databentoHistoricalWithAvailableEndRetry({
        dataset: "GLBX.MDP3",
        schema: "trades",
        symbols: candidate.rawSymbol,
        stype_in: "raw_symbol",
        start,
        end,
        encoding: "csv",
        limit: 4000,
      }).catch(() => []);

      const quoteRows = tradeRows.length
        ? []
        : await databentoHistoricalWithAvailableEndRetry({
            dataset: "GLBX.MDP3",
            schema: "mbp-1",
            symbols: candidate.rawSymbol,
            stype_in: "raw_symbol",
            start,
            end,
            encoding: "csv",
            limit: 4000,
          }).catch(() => []);

      const ohlcvRows = tradeRows.length || quoteRows.length
        ? []
        : await databentoHistoricalWithAvailableEndRetry({
            dataset: "GLBX.MDP3",
            schema: "ohlcv-1m",
            symbols: candidate.rawSymbol,
            stype_in: "raw_symbol",
            start,
            end,
            encoding: "csv",
            limit: 180,
          }).catch(() => []);

      const rows = tradeRows.length ? tradeRows : quoteRows.length ? quoteRows : ohlcvRows;
      if (!rows.length) {
        continue;
      }

      const latestTimestamp = Date.parse(rows[rows.length - 1]?.ts_event || "") || 0;
      const nextMatch = {
        rawSymbol: candidate.rawSymbol,
        sourceType: "raw_symbol",
        resolvedAt: new Date().toISOString(),
        score: tradeRows.length
          ? tradeRows.length + 3_000_000
          : quoteRows.length
            ? quoteRows.length + 2_000_000
            : ohlcvRows.length + 1_000_000,
        latestTimestamp,
      };

      if (
        !bestMatch ||
        nextMatch.latestTimestamp > bestMatch.latestTimestamp ||
        (nextMatch.latestTimestamp === bestMatch.latestTimestamp && nextMatch.score > bestMatch.score)
      ) {
        bestMatch = nextMatch;
      }
    }

    const resolved = bestMatch
      ? {
          rawSymbol: bestMatch.rawSymbol,
          sourceType: bestMatch.sourceType,
          resolvedAt: bestMatch.resolvedAt,
        }
      : null;

    activeFutureContractCache.set(cacheKey, {
      cachedAt: Date.now(),
      contract: resolved,
    });

    return resolved;
  })().finally(() => {
    activeFutureContractRefreshInFlight.delete(cacheKey);
  });

  activeFutureContractRefreshInFlight.set(cacheKey, request);
  return request;
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

function countOptionRights(definitions) {
  return definitions.reduce(
    (acc, item) => {
      if (item?.right === "C") acc.calls += 1;
      if (item?.right === "P") acc.puts += 1;
      return acc;
    },
    { calls: 0, puts: 0 },
  );
}

function countContractsWithLiveData(contracts) {
  return contracts.reduce((count, contract) => {
    const hasLiveData =
      Number.isFinite(contract?.mid) ||
      Number.isFinite(contract?.last) ||
      Number.isFinite(contract?.bid) ||
      Number.isFinite(contract?.ask) ||
      (Number.isFinite(contract?.openInterest) && contract.openInterest > 0) ||
      (Number.isFinite(contract?.volume) && contract.volume > 0);
    return hasLiveData ? count + 1 : count;
  }, 0);
}

function summarizeOptionChainSnapshot(snapshot) {
  const contracts = Array.isArray(snapshot?.contracts) ? snapshot.contracts : [];
  const counts = countOptionRights(contracts);
  return {
    contractCount: contracts.length,
    callCount: counts.calls,
    putCount: counts.puts,
    liveContractCount: countContractsWithLiveData(contracts),
  };
}

function shouldPreserveCachedOptionSnapshot(cachedSnapshot, nextSnapshot, config) {
  if (!cachedSnapshot || !nextSnapshot) {
    return false;
  }

  const cachedSummary = summarizeOptionChainSnapshot(cachedSnapshot);
  const nextSummary = summarizeOptionChainSnapshot(nextSnapshot);
  const minContracts = Math.max(0, Number(config?.minContracts ?? 0));
  const minContractsPerSide = Math.max(0, Number(config?.minContractsPerSide ?? 0));
  const cachedMeetsFloor =
    cachedSummary.contractCount >= minContracts &&
    cachedSummary.callCount >= minContractsPerSide &&
    cachedSummary.putCount >= minContractsPerSide;
  const nextBelowFloor =
    nextSummary.contractCount < minContracts ||
    nextSummary.callCount < minContractsPerSide ||
    nextSummary.putCount < minContractsPerSide;

  if (cachedMeetsFloor && nextBelowFloor) {
    return true;
  }

  const thinnerThreshold = 0.75;
  const nextMuchThinner =
    nextSummary.contractCount < Math.max(minContracts, Math.floor(cachedSummary.contractCount * thinnerThreshold)) ||
    nextSummary.callCount < Math.max(minContractsPerSide, Math.floor(cachedSummary.callCount * thinnerThreshold)) ||
    nextSummary.putCount < Math.max(minContractsPerSide, Math.floor(cachedSummary.putCount * thinnerThreshold));

  if (!nextMuchThinner) {
    return false;
  }

  return nextSummary.liveContractCount <= cachedSummary.liveContractCount;
}

function selectBalancedOptionDefinitions(definitions, currentPrice, config) {
  const expansionSteps =
    Array.isArray(config?.strikeWindowExpansionSteps) && config.strikeWindowExpansionSteps.length
      ? config.strikeWindowExpansionSteps
      : [1];
  const maxContracts = Math.max(1, Number(config?.maxContracts ?? 32));
  const minContracts = Math.max(0, Number(config?.minContracts ?? 0));
  const minContractsPerSide = Math.max(0, Number(config?.minContractsPerSide ?? 0));
  let best = [];

  for (const multiplier of expansionSteps) {
    const strikeWindowPct = Number(config?.strikeWindowPct ?? 0.05) * Number(multiplier || 1);
    const withinWindow = definitions
      .filter(
        (item) =>
          Math.abs((item.strike ?? 0) - currentPrice) / Math.max(currentPrice, 1) <= strikeWindowPct,
      )
      .sort((a, b) => Math.abs((a.strike ?? 0) - currentPrice) - Math.abs((b.strike ?? 0) - currentPrice));

    const calls = withinWindow.filter((item) => item.right === "C");
    const puts = withinWindow.filter((item) => item.right === "P");
    const perSideTarget = Math.min(Math.floor(maxContracts / 2), Math.max(minContractsPerSide, Math.floor(maxContracts / 3)));
    const selected = [];
    const selectedSymbols = new Set();

    [...calls.slice(0, perSideTarget), ...puts.slice(0, perSideTarget)].forEach((item) => {
      if (!selectedSymbols.has(item.rawSymbol)) {
        selected.push(item);
        selectedSymbols.add(item.rawSymbol);
      }
    });

    withinWindow.forEach((item) => {
      if (selected.length >= maxContracts || selectedSymbols.has(item.rawSymbol)) {
        return;
      }
      selected.push(item);
      selectedSymbols.add(item.rawSymbol);
    });

    const counts = countOptionRights(selected);
    if (
      selected.length >= minContracts &&
      counts.calls >= minContractsPerSide &&
      counts.puts >= minContractsPerSide
    ) {
      return selected;
    }

    if (selected.length > best.length) {
      best = selected;
    }
  }

  return best;
}

function optionDefinitionParentsForConfig(config) {
  const parents = Array.isArray(config?.optionParents)
    ? config.optionParents
    : config?.optionParent
      ? [config.optionParent]
      : [];
  return [...new Set(parents.filter((value) => typeof value === "string" && value.trim()))];
}

function optionDefinitionMatchesUnderlying(item, config) {
  const underlying = typeof item?.underlying === "string" ? item.underlying.trim().toUpperCase() : "";
  if (!underlying) {
    return true;
  }

  const exactSymbol = typeof config?.underlyingSymbol === "string" ? config.underlyingSymbol.trim().toUpperCase() : "";
  if (exactSymbol && underlying === exactSymbol) {
    return true;
  }

  const root = typeof config?.underlyingRoot === "string" ? config.underlyingRoot.trim().toUpperCase() : "";
  if (root && underlying.startsWith(root)) {
    return true;
  }

  return false;
}

async function buildOptionChainSnapshot(asset) {
  const config = OPTIONS_CONFIGS[asset];
  if (!config) {
    throw new Error(`Unsupported options underlying: ${asset}`);
  }

  const safeEnd = databentoSafeEndIso();
  const underlyingCandles = await fetchDatabentoFuturesHistory(asset, "1m", {
    start: toIsoDaysAgo(config.underlyingHistoryDays ?? 1),
    end: safeEnd,
    limit: config.underlyingHistoryLimit ?? 240,
  });
  const latestUnderlying = underlyingCandles[underlyingCandles.length - 1];

  if (!latestUnderlying) {
    throw new Error(`No underlying futures price available for ${asset}`);
  }

  const optionParents = optionDefinitionParentsForConfig(config);
  if (!optionParents.length) {
    throw new Error(`No options parent configured for ${asset}`);
  }

  const definitionSets = await Promise.all(
    optionParents.map((parent) =>
      databentoHistorical({
        dataset: config.dataset,
        schema: "definition",
        symbols: parent,
        stype_in: "parent",
        start: isoDateDaysAgo(config.definitionLookbackDays ?? 3),
        encoding: "csv",
        limit: config.definitionLimit ?? 8000,
      }).catch(() => []),
    ),
  );
  const definitions = definitionSets.flat();

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
        optionDefinitionMatchesUnderlying(item, config) &&
        (item.securityType === "OOF" || item.securityType === "OPT"),
    );

  if (!optionDefinitions.length) {
    throw new Error(
      `No active ${asset} option definitions found (parents=${optionParents.join(",")}, rawDefinitions=${definitions.length})`,
    );
  }

  const eligibleExpiries = uniqueSortedNumbers(optionDefinitions.map((item) => item.expiryNano)).slice(0, config.maxExpiries ?? 1);
  const nearestExpiryNano = eligibleExpiries[0] ?? null;

  if (!nearestExpiryNano) {
    throw new Error(
      `No active ${asset} options expiry found (parents=${optionParents.join(",")}, optionDefinitions=${optionDefinitions.length})`,
    );
  }

  const filteredDefinitions = optionDefinitions.filter((item) => eligibleExpiries.includes(item.expiryNano));
  const selectedDefinitions = selectBalancedOptionDefinitions(
    optionDefinitions.filter((item) => eligibleExpiries.includes(item.expiryNano)),
    latestUnderlying.close,
    config,
  );
  const selectedCounts = countOptionRights(selectedDefinitions);

  const selectedSymbols = selectedDefinitions.map((item) => item.rawSymbol);
  if (!selectedSymbols.length) {
    throw new Error(
      `No ${asset} options contracts found near current price (expiries=${filteredDefinitions.length}, strikeWindowPct=${config.strikeWindowPct})`,
    );
  }

  const symbolQuery = selectedSymbols.join(",");
  const [quotes, trades, statistics] = config.enrichLiveContractData === false
    ? [[], [], []]
    : await Promise.all([
        databentoHistorical({
          dataset: config.dataset,
          schema: "mbp-1",
          symbols: symbolQuery,
          stype_in: "raw_symbol",
          start: isoMinutesBefore(safeEnd, 30),
          end: safeEnd,
          encoding: "csv",
          limit: 50000,
        }).catch(() => []),
        databentoHistorical({
          dataset: config.dataset,
          schema: "trades",
          symbols: symbolQuery,
          stype_in: "raw_symbol",
          start: isoMinutesBefore(safeEnd, 90),
          end: safeEnd,
          encoding: "csv",
          limit: 50000,
        }).catch(() => []),
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
    selectionDebug: {
      queriedParents: optionParents,
      rawDefinitionCount: definitions.length,
      eligibleExpiryCount: filteredDefinitions.length,
      contractCount: selectedDefinitions.length,
      callCount: selectedCounts.calls,
      putCount: selectedCounts.puts,
      liveQuoteCount: latestQuoteBySymbol.size,
      liveTradeCount: tradeBySymbol.size,
      statisticsCount: statisticsBySymbol.size,
    },
  };
}

async function getOptionChainSnapshot(asset, options = {}) {
  const normalizedAsset = typeof asset === "string" ? asset.toUpperCase() : asset;
  const cached = optionChainCache.get(normalizedAsset) ?? null;
  const cacheAgeMs = cached ? Date.now() - cached.cachedAt : Number.POSITIVE_INFINITY;
  const cacheFresh = cacheAgeMs <= OPTION_CHAIN_CACHE_TTL_MS;

  if (cached?.snapshot && cacheFresh && !options.forceRefresh) {
    return cached.snapshot;
  }

  if (cached?.snapshot && !cacheFresh && !optionChainRefreshInFlight.has(normalizedAsset) && !options.forceRefresh) {
    optionChainRefreshInFlight.set(
      normalizedAsset,
      buildOptionChainSnapshot(normalizedAsset)
        .then((snapshot) => {
          const config = OPTIONS_CONFIGS[normalizedAsset] ?? {};
          const chosenSnapshot = shouldPreserveCachedOptionSnapshot(cached.snapshot, snapshot, config)
            ? cached.snapshot
            : snapshot;
          optionChainCache.set(normalizedAsset, { cachedAt: Date.now(), snapshot: chosenSnapshot });
          persistOptionChainCache();
        })
        .catch(() => {})
        .finally(() => {
          optionChainRefreshInFlight.delete(normalizedAsset);
        }),
    );

    return cached.snapshot;
  }

  if (!options.forceRefresh && optionChainRefreshInFlight.has(normalizedAsset)) {
    if (cached?.snapshot) {
      return cached.snapshot;
    }
    await optionChainRefreshInFlight.get(normalizedAsset);
    const refreshed = optionChainCache.get(normalizedAsset);
    if (refreshed?.snapshot) {
      return refreshed.snapshot;
    }
  }

  const buildPromise = buildOptionChainSnapshot(normalizedAsset)
    .then((snapshot) => {
      const config = OPTIONS_CONFIGS[normalizedAsset] ?? {};
      const chosenSnapshot = shouldPreserveCachedOptionSnapshot(cached?.snapshot ?? null, snapshot, config)
        ? cached.snapshot
        : snapshot;
      optionChainCache.set(normalizedAsset, { cachedAt: Date.now(), snapshot: chosenSnapshot });
      persistOptionChainCache();
      return chosenSnapshot;
    })
    .catch((error) => {
      if (cached?.snapshot) {
        return cached.snapshot;
      }
      throw error;
    })
    .finally(() => {
      optionChainRefreshInFlight.delete(normalizedAsset);
    });

  optionChainRefreshInFlight.set(normalizedAsset, buildPromise);
  return buildPromise;
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
      start: isoDateDaysAgo(3),
      encoding: "csv",
      limit: 500,
    }),
    databentoHistorical({
      dataset: config.dataset,
      schema: "definition",
      symbols: config.optionParent,
      stype_in: "parent",
      start: isoDateDaysAgo(3),
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
    end: databentoSafeEndIso(),
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
      "Uses strike-volume clustering and proximity to price.",
      "This does not calculate full theoretical gamma.",
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

const OVERLAY_VOL_FLOOR = 0.0001;
const OVERLAY_VOL_CAP = 5;
const OVERLAY_DEFAULT_ESTIMATED_VOL = 0.22;
const OVERLAY_RISK_FREE_RATE = 0.045;
const CME_GAMMA_OVERLAY_SOURCES = {
  NQ: "nq-option-chain",
  GC: "gc-option-chain",
  CL: "cl-option-chain",
  "6E": "6e-option-chain",
  SOL_CME: "sol-option-chain",
};

function overlayErf(x) {
  const sign = x >= 0 ? 1 : -1;
  const absoluteX = Math.abs(x);
  const a1 = 0.254829592;
  const a2 = -0.284496736;
  const a3 = 1.421413741;
  const a4 = -1.453152027;
  const a5 = 1.061405429;
  const p = 0.3275911;
  const t = 1 / (1 + p * absoluteX);
  const y = 1 - (((((a5 * t + a4) * t + a3) * t + a2) * t + a1) * t * Math.exp(-absoluteX * absoluteX));
  return sign * y;
}

function overlayNormalCdf(x) {
  return 0.5 * (1 + overlayErf(x / Math.sqrt(2)));
}

function overlayNormalPdf(x) {
  return Math.exp(-(x * x) / 2) / Math.sqrt(2 * Math.PI);
}

function overlayBlack76Price(forward, strike, timeToExpiryYears, sigma, right, riskFreeRate = OVERLAY_RISK_FREE_RATE) {
  if (forward <= 0 || strike <= 0 || timeToExpiryYears <= 0 || sigma <= 0) {
    return null;
  }

  const sigmaRootT = sigma * Math.sqrt(timeToExpiryYears);
  const d1 = (Math.log(forward / strike) + 0.5 * sigma * sigma * timeToExpiryYears) / sigmaRootT;
  const d2 = d1 - sigmaRootT;
  const discount = Math.exp(-riskFreeRate * timeToExpiryYears);

  if (right === "C") {
    return discount * (forward * overlayNormalCdf(d1) - strike * overlayNormalCdf(d2));
  }

  return discount * (strike * overlayNormalCdf(-d2) - forward * overlayNormalCdf(-d1));
}

function overlayBlack76Gamma(forward, strike, timeToExpiryYears, sigma, riskFreeRate = OVERLAY_RISK_FREE_RATE) {
  if (forward <= 0 || strike <= 0 || timeToExpiryYears <= 0 || sigma <= 0) {
    return null;
  }

  const sigmaRootT = sigma * Math.sqrt(timeToExpiryYears);
  const d1 = (Math.log(forward / strike) + 0.5 * sigma * sigma * timeToExpiryYears) / sigmaRootT;
  return Math.exp(-riskFreeRate * timeToExpiryYears) * overlayNormalPdf(d1) / (forward * sigmaRootT);
}

function overlayIntrinsicValue(forward, strike, right, riskFreeRate = OVERLAY_RISK_FREE_RATE, timeToExpiryYears = 0) {
  const payoff = right === "C" ? Math.max(forward - strike, 0) : Math.max(strike - forward, 0);
  return Math.exp(-riskFreeRate * timeToExpiryYears) * payoff;
}

function solveOverlayImpliedVolatility({ marketPrice, forward, strike, timeToExpiryYears, right, riskFreeRate = OVERLAY_RISK_FREE_RATE }) {
  if (marketPrice <= 0 || forward <= 0 || strike <= 0 || timeToExpiryYears <= 0) {
    return null;
  }

  const intrinsic = overlayIntrinsicValue(forward, strike, right, riskFreeRate, timeToExpiryYears);
  if (marketPrice < intrinsic - 1e-6) {
    return null;
  }

  let low = OVERLAY_VOL_FLOOR;
  let high = OVERLAY_VOL_CAP;
  let best = null;

  for (let index = 0; index < 100; index += 1) {
    const mid = (low + high) / 2;
    const price = overlayBlack76Price(forward, strike, timeToExpiryYears, mid, right, riskFreeRate);
    if (price === null) {
      return null;
    }

    best = mid;
    const difference = price - marketPrice;
    if (Math.abs(difference) < 1e-6) {
      return mid;
    }

    if (difference > 0) {
      high = mid;
    } else {
      low = mid;
    }
  }

  return best;
}

function chooseOverlayMarketPrice(contract) {
  if (Number.isFinite(Number(contract?.mid))) {
    return Number(contract.mid);
  }
  if (Number.isFinite(Number(contract?.last))) {
    return Number(contract.last);
  }
  return null;
}

function chooseOverlayInterestWeight(contract) {
  if (Number.isFinite(Number(contract?.openInterest)) && Number(contract.openInterest) > 0) {
    return Number(contract.openInterest);
  }
  if (Number.isFinite(Number(contract?.volume)) && Number(contract.volume) > 0) {
    return Number(contract.volume);
  }
  return 1;
}

function deriveCmeOverlayExposureRows(optionChainSnapshot) {
  const forward = Number(optionChainSnapshot?.underlyingPrice ?? NaN);
  const contracts = Array.isArray(optionChainSnapshot?.contracts) ? optionChainSnapshot.contracts : [];
  if (!Number.isFinite(forward) || forward <= 0 || !contracts.length) {
    return [];
  }

  return contracts
    .map((contract) => {
      const strike = Number(contract?.strike ?? NaN);
      const timeToExpiryYears = Number(contract?.timeToExpiryYears ?? NaN);
      const right = contract?.right === "P" ? "P" : contract?.right === "C" ? "C" : null;
      if (!Number.isFinite(strike) || strike <= 0 || !Number.isFinite(timeToExpiryYears) || timeToExpiryYears <= 0 || !right) {
        return null;
      }

      const marketPrice = chooseOverlayMarketPrice(contract);
      const solvedVol =
        marketPrice !== null
          ? solveOverlayImpliedVolatility({
              marketPrice,
              forward,
              strike,
              timeToExpiryYears,
              right,
            })
          : null;
      const sigma = solvedVol ?? OVERLAY_DEFAULT_ESTIMATED_VOL;
      const gamma = overlayBlack76Gamma(forward, strike, timeToExpiryYears, sigma);
      const weight = chooseOverlayInterestWeight(contract);
      if (!Number.isFinite(gamma) || gamma <= 0 || !Number.isFinite(weight) || weight <= 0) {
        return null;
      }

      return {
        strike,
        side: right === "C" ? "call" : "put",
        exposure: gamma * weight,
      };
    })
    .filter(Boolean);
}

async function buildCmeGammaOverlay(asset, spotReferenceOverride) {
  const normalizedAsset = typeof asset === "string" ? asset.toUpperCase() : asset;
  if (!CME_GAMMA_OVERLAY_SOURCES[normalizedAsset]) {
    throw new Error(`Unsupported CME gamma asset: ${asset}`);
  }

  try {
    const snapshot = await getOptionChainSnapshot(normalizedAsset);
    const snapshotSpot = Number(snapshot?.underlyingPrice ?? NaN);
    const spotReference =
      typeof spotReferenceOverride === "number" && Number.isFinite(spotReferenceOverride)
        ? spotReferenceOverride
        : snapshotSpot;
    const rows = deriveCmeOverlayExposureRows(snapshot);
    if (!Number.isFinite(spotReference) || spotReference <= 0 || !rows.length) {
      return null;
    }

    const levels = summarizeOverlayExposures(spotReference, rows);
    return {
      gammaFlip: levels.gammaFlip,
      callWall: levels.callWall,
      putWall: levels.putWall,
      spotReference,
      regime: levels.regime,
      updatedAt: new Date().toISOString(),
      source: CME_GAMMA_OVERLAY_SOURCES[normalizedAsset],
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (
      message.includes("No active") ||
      message.includes("No underlying futures price available") ||
      message.includes("No ") ||
      message.includes("Missing DATABENTO_API_KEY")
    ) {
      return null;
    }
    throw error;
  }
}

function normalizeActusGammaAsset(asset) {
  const normalizedAsset = typeof asset === "string" ? asset.trim().toUpperCase() : "";
  if (!normalizedAsset) {
    return "NQ";
  }
  if (normalizedAsset === "BTC/USD") return "BTC";
  if (normalizedAsset === "ETH/USD") return "ETH";
  if (normalizedAsset === "SOL_CME" || normalizedAsset === "SOL-CME" || normalizedAsset === "SOL CME") return "SOL_CME";
  if (normalizedAsset === "SOL/USD") return "SOL";
  if (normalizedAsset === "XAU/USD" || normalizedAsset === "GC") return "XAU";
  if (normalizedAsset === "OIL") return "CL";
  if (normalizedAsset === "EUR/USD" || normalizedAsset === "EURUSD" || normalizedAsset === "EUR") return "6E";
  return normalizedAsset;
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

async function buildDeribitGammaOverlay(currency) {
  const normalizedCurrency = typeof currency === "string" ? currency.toUpperCase() : "";
  if (normalizedCurrency !== "BTC" && normalizedCurrency !== "ETH" && normalizedCurrency !== "SOL") {
    throw new Error(`Unsupported Deribit gamma asset: ${currency}`);
  }

  const spotTicker = await deribitPublic("public/ticker", { instrument_name: `${normalizedCurrency}-PERPETUAL` });
  const spotReference = Number(spotTicker?.index_price ?? spotTicker?.underlying_price ?? spotTicker?.last_price ?? 0);
  if (!Number.isFinite(spotReference) || spotReference <= 0) {
    throw new Error(`${normalizedCurrency} spot reference unavailable from Deribit`);
  }

  const instruments = await deribitPublic("public/get_instruments", {
    currency: normalizedCurrency,
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
    throw new Error(`${normalizedCurrency} Deribit options expiry unavailable`);
  }

  const selected = active
    .filter((instrument) => Number(instrument.expiration_timestamp) === nearestExpiry)
    .filter((instrument) => Math.abs(Number(instrument.strike) - spotReference) / spotReference <= 0.18)
    .sort((a, b) => Math.abs(Number(a.strike) - spotReference) - Math.abs(Number(b.strike) - spotReference))
    .slice(0, 64);

  if (!selected.length) {
    throw new Error(`${normalizedCurrency} Deribit options selection empty`);
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
    source: `deribit-${normalizedCurrency.toLowerCase()}-option-chain`,
  };
}

async function buildBtcGammaOverlay() {
  return buildDeribitGammaOverlay("BTC");
}

async function buildEthGammaOverlay() {
  return buildDeribitGammaOverlay("ETH");
}

async function buildSolGammaOverlay() {
  try {
    return await buildDeribitGammaOverlay("SOL");
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (
      message.includes("Deribit request failed: 400") ||
      message.includes("SOL Deribit options expiry unavailable") ||
      message.includes("SOL Deribit options selection empty") ||
      message.includes("SOL spot reference unavailable from Deribit")
    ) {
      return null;
    }
    throw error;
  }
}

async function buildXauGammaOverlay(spotReferenceOverride) {
  return buildCmeGammaOverlay("GC", spotReferenceOverride);
}

async function buildActusGammaOverlay(asset, options = {}) {
  const normalizedAsset = normalizeActusGammaAsset(asset);

  if (normalizedAsset === "BTC") {
    return buildBtcGammaOverlay();
  }

  if (normalizedAsset === "ETH") {
    return buildEthGammaOverlay();
  }

  if (normalizedAsset === "SOL") {
    return buildSolGammaOverlay();
  }

  if (normalizedAsset === "SOL_CME") {
      return buildCmeGammaOverlay("SOL_CME", options.spotReference);
  }

  if (normalizedAsset === "XAU") {
    return buildXauGammaOverlay(options.spotReference);
  }

  if (normalizedAsset === "NQ" || normalizedAsset === "CL" || normalizedAsset === "6E") {
    return buildCmeGammaOverlay(normalizedAsset, options.spotReference);
  }

  return null;
}

const DELTA_CONFIGS = {
  NQ: {
    windowMinutes: 30,
    minDirectionalStrength: 0.12,
    minDirectionalTrades: 24,
    source: "databento-cme-futures-trades",
  },
  GC: {
    windowMinutes: 240,
    minDirectionalStrength: 0.14,
    minDirectionalTrades: 20,
    source: "databento-cme-futures-trades",
  },
  CL: {
    windowMinutes: 45,
    minDirectionalStrength: 0.13,
    minDirectionalTrades: 20,
    source: "databento-cme-futures-trades",
  },
  "6E": {
    windowMinutes: 60,
    minDirectionalStrength: 0.12,
    minDirectionalTrades: 24,
    source: "databento-cme-futures-trades",
  },
  BTC: {
    windowMinutes: 30,
    minDirectionalStrength: 0.12,
    minDirectionalTrades: 30,
    source: "databento-cme-futures-trades",
  },
  ETH: {
    windowMinutes: 30,
    minDirectionalStrength: 0.12,
    minDirectionalTrades: 30,
    source: "deribit-eth-futures-trades",
  },
  SOL: {
    windowMinutes: 30,
    minDirectionalStrength: 0.14,
    minDirectionalTrades: 40,
    source: "binance-solusdt-agg-trades",
  },
  SOL_CME: {
    windowMinutes: 30,
    minDirectionalStrength: 0.14,
    minDirectionalTrades: 24,
    source: "databento-cme-futures-trades",
  },
};

function normalizeActusDeltaAsset(asset) {
  const normalized = typeof asset === "string" ? asset.toUpperCase() : "";
  if (normalized === "XAU" || normalized === "XAU/USD" || normalized === "GC") return "GC";
  if (normalized === "OIL" || normalized === "CL") return "CL";
  if (normalized === "EUR" || normalized === "EUR/USD" || normalized === "EURUSD" || normalized === "6E") return "6E";
  if (normalized === "BTC" || normalized === "BTC/USD") return "BTC";
  if (normalized === "ETH" || normalized === "ETH/USD") return "ETH";
  if (normalized === "SOL_CME" || normalized === "SOL-CME" || normalized === "SOL CME") return "SOL_CME";
  if (normalized === "SOL" || normalized === "SOL/USD") return "SOL";
  if (normalized === "NQ") return "NQ";
  return null;
}

function normalizeNyOpenFlowAsset(asset) {
  const normalized = typeof asset === "string" ? asset.toUpperCase() : "";
  if (normalized === "XAU" || normalized === "XAU/USD" || normalized === "GC") return "GC";
  if (normalized === "OIL" || normalized === "CL") return "CL";
  if (normalized === "EUR" || normalized === "EUR/USD" || normalized === "EURUSD" || normalized === "6E") return "6E";
  if (normalized === "BTC" || normalized === "BTC/USD" || normalized === "MBT") return "BTC";
  if (normalized === "NQ") return "NQ";
  return null;
}

function currentNyOpenFlowSessionWindow(now = new Date()) {
  const year = now.getUTCFullYear();
  const month = now.getUTCMonth();
  const date = now.getUTCDate();
  const startMs = Date.UTC(year, month, date, 13, 30, 0, 0);
  const endMs = Date.UTC(year, month, date, 14, 0, 0, 0);
  return {
    sessionDate: new Date(Date.UTC(year, month, date, 0, 0, 0, 0)).toISOString().slice(0, 10),
    startMs,
    endMs,
    ready: now.getTime() >= endMs,
  };
}

function classifyNyOpenFlowBalance(balancePct) {
  if (!Number.isFinite(balancePct)) return "Balanced";
  if (balancePct >= 0.06) return "Buyer-led";
  if (balancePct <= -0.06) return "Seller-led";
  return "Balanced";
}

function buildStoredNyOpenFlowSnapshot(flow) {
  return {
    date: flow.sessionDate,
    asset: flow.asset,
    buyVolume: flow.buyVolume,
    sellVolume: flow.sellVolume,
    netVolume: flow.netVolume,
    balancePct: flow.balancePct,
    label: flow.label,
  };
}

function persistNyOpenFlowSnapshot(flow) {
  if (!flow?.asset || !flow?.sessionDate || !flow?.ready) {
    return;
  }

  const key = `${flow.asset}:${flow.sessionDate}`;
  const nextValue = buildStoredNyOpenFlowSnapshot(flow);
  const existing = nyOpenFlowHistory.get(key);
  const existingSignature = existing ? JSON.stringify(existing) : null;
  const nextSignature = JSON.stringify(nextValue);

  if (existingSignature === nextSignature) {
    return;
  }

  nyOpenFlowHistory.set(key, nextValue);
  persistNyOpenFlowHistory();
}

async function buildNyOpenFlowBalance(asset) {
  const normalizedAsset = normalizeNyOpenFlowAsset(asset);
  if (!normalizedAsset) {
    return {
      asset: typeof asset === "string" ? asset.toUpperCase() : "UNKNOWN",
      supportedAsset: false,
      ready: false,
      sessionDate: null,
      sessionStart: null,
      sessionEnd: null,
      buyVolume: null,
      sellVolume: null,
      netVolume: null,
      balancePct: null,
      label: null,
      source: null,
      liveSymbol: null,
      liveSourceType: null,
      updatedAt: null,
    };
  }

  const now = new Date();
  const sessionWindow = currentNyOpenFlowSessionWindow(now);
  if (!sessionWindow.ready) {
    return {
      asset: normalizedAsset,
      supportedAsset: true,
      ready: false,
      sessionDate: sessionWindow.sessionDate,
      sessionStart: new Date(sessionWindow.startMs).toISOString(),
      sessionEnd: new Date(sessionWindow.endMs).toISOString(),
      buyVolume: null,
      sellVolume: null,
      netVolume: null,
      balancePct: null,
      label: null,
      source: "databento-cme-futures-trades",
      liveSymbol: null,
      liveSourceType: null,
      updatedAt: null,
    };
  }

  const cacheKey = `${normalizedAsset}:${sessionWindow.sessionDate}`;
  const cached = nyOpenFlowCache.get(cacheKey);
  if (cached) {
    return cached;
  }

  const start = new Date(sessionWindow.startMs).toISOString();
  const end = new Date(sessionWindow.endMs).toISOString();
  const activeRows = await resolveActiveDatabentoFutureRows(normalizedAsset, "trades", start, end, 150000);
  const rows = activeRows?.rows ?? [];

  let buyVolume = 0;
  let sellVolume = 0;

  rows.forEach((row) => {
    const size = normalizeDatabentoNumber(row?.size) ?? normalizeDatabentoNumber(row?.quantity) ?? 0;
    if (!Number.isFinite(size) || size <= 0) {
      return;
    }
    if (row.side === "B") {
      buyVolume += size;
      return;
    }
    if (row.side === "A") {
      sellVolume += size;
    }
  });

  const totalKnownVolume = buyVolume + sellVolume;
  const netVolume = buyVolume - sellVolume;
  const balancePct = totalKnownVolume > 0 ? round(netVolume / totalKnownVolume, 4) : 0;
  const payload = {
    asset: normalizedAsset,
    supportedAsset: true,
    ready: true,
    sessionDate: sessionWindow.sessionDate,
    sessionStart: start,
    sessionEnd: end,
    buyVolume: round(buyVolume, 2),
    sellVolume: round(sellVolume, 2),
    netVolume: round(netVolume, 2),
    balancePct,
    label: classifyNyOpenFlowBalance(balancePct),
    source: "databento-cme-futures-trades",
    liveSymbol: activeRows?.rawSymbol ?? null,
    liveSourceType: activeRows?.sourceType ?? null,
    updatedAt: rows[rows.length - 1]?.ts_event ? normalizeDatabentoTimestamp(rows[rows.length - 1].ts_event) : end,
  };

  nyOpenFlowCache.set(cacheKey, payload);
  persistNyOpenFlowSnapshot(payload);
  return payload;
}

function buildDeltaSignalPayload({
  supportedAsset,
  sourceAvailable,
  directionalAvailable,
  netVolume,
  totalKnownVolume,
  totalVolume,
  referencePrice,
  updatedAt,
  source,
}) {
  const strength = totalKnownVolume > 0 ? round(clamp(Math.abs(netVolume) / totalKnownVolume, 0, 1), 3) : 0;
  const bias = directionalAvailable ? (netVolume > 0 ? "LONG" : netVolume < 0 ? "SHORT" : "NEUTRAL") : "NEUTRAL";
  const deltaAvailability = !supportedAsset
    ? "UNSUPPORTED"
    : directionalAvailable
      ? "DIRECTIONAL"
      : sourceAvailable
        ? "SOURCE_ONLY"
        : "UNAVAILABLE";
  const condition = !sourceAvailable
    ? "NEUTRAL"
    : directionalAvailable
      ? bias === "LONG"
        ? "ACCUMULATION"
        : "DISTRIBUTION"
      : totalKnownVolume > 0 && totalVolume > 0 && totalKnownVolume / totalVolume >= 0.55 && strength <= 0.08
        ? "ABSORPTION"
        : "NEUTRAL";

  return {
    deltaAvailability,
    deltaSupportedAsset: supportedAsset,
    deltaSourceAvailable: sourceAvailable,
    deltaDirectionalAvailable: directionalAvailable,
    bias,
    strength,
    condition,
    deltaReferencePrice: Number.isFinite(referencePrice) && referencePrice > 0 ? referencePrice : null,
    source,
    updatedAt,
  };
}

function buildUnavailableDeltaSignal(asset, source = null) {
  return {
    deltaAvailability: "UNAVAILABLE",
    deltaSupportedAsset: true,
    deltaSourceAvailable: false,
    deltaDirectionalAvailable: false,
    bias: "NEUTRAL",
    strength: 0,
    condition: "NEUTRAL",
    deltaReferencePrice: null,
    source,
    updatedAt: null,
  };
}

function calculateWeightedReferencePrice(points, precision) {
  let weightedTotal = 0;
  let totalSize = 0;

  (points ?? []).forEach((point) => {
    const price = Number(point?.price ?? NaN);
    const size = Number(point?.size ?? 0);
    if (!Number.isFinite(price) || price <= 0 || !Number.isFinite(size) || size <= 0) {
      return;
    }
    weightedTotal += price * size;
    totalSize += size;
  });

  if (!Number.isFinite(weightedTotal) || !Number.isFinite(totalSize) || totalSize <= 0) {
    return null;
  }

  return round(weightedTotal / totalSize, precision);
}

async function buildDatabentoDeltaSignal(asset) {
  const normalizedAsset = normalizeActusDeltaAsset(asset);
  const config = normalizedAsset ? DELTA_CONFIGS[normalizedAsset] : null;
  const future = normalizedAsset ? DATABENTO_FUTURES[normalizedAsset] : null;

  if (!config || !future) {
    throw new Error(`Unsupported Databento delta asset: ${asset}`);
  }

  const safeEnd = databentoTradeSafeEndIso();
  const candidateWindows = Array.from(
    new Set([config.windowMinutes, Math.max(config.windowMinutes * 3, 180), 1440]),
  );

  let rows = [];
  for (const windowMinutes of candidateWindows) {
    const start = isoMinutesBefore(safeEnd, windowMinutes);
    const activeRows = await resolveActiveDatabentoFutureRows(normalizedAsset, "trades", start, safeEnd, 40000);
    if (activeRows?.rows?.length) {
      rows = activeRows.rows;
      break;
    }

    const continuousRows = await databentoHistoricalWithAvailableEndRetry({
      dataset: "GLBX.MDP3",
      schema: "trades",
      symbols: future.symbol,
      stype_in: "continuous",
      start,
      end: safeEnd,
      encoding: "csv",
      limit: 40000,
    }).catch(() => []);

    if (continuousRows.length) {
      rows = continuousRows;
      break;
    }
  }

  let buyVolume = 0;
  let sellVolume = 0;
  let unknownVolume = 0;
  let directionalTrades = 0;

  rows.forEach((row) => {
    const size = Number(row.size ?? 0);
    if (!Number.isFinite(size) || size <= 0) {
      return;
    }

    if (row.side === "B") {
      buyVolume += size;
      directionalTrades += 1;
    } else if (row.side === "A") {
      sellVolume += size;
      directionalTrades += 1;
    } else {
      unknownVolume += size;
    }
  });

  const totalKnownVolume = buyVolume + sellVolume;
  const totalVolume = totalKnownVolume + unknownVolume;
  const netVolume = buyVolume - sellVolume;
  const directionalStrength = totalKnownVolume > 0 ? Math.abs(netVolume) / totalKnownVolume : 0;
  const sourceAvailable = rows.length > 0;
  const directionalAvailable =
    sourceAvailable &&
    directionalTrades >= config.minDirectionalTrades &&
    totalKnownVolume > 0 &&
    directionalStrength >= config.minDirectionalStrength;
  const referencePrice = calculateWeightedReferencePrice(
    rows.map((row) => ({
      price: normalizeDatabentoNumber(row?.price),
      size: normalizeDatabentoNumber(row?.size) ?? normalizeDatabentoNumber(row?.quantity) ?? 0,
    })),
    future.priceScale,
  );

  return buildDeltaSignalPayload({
    supportedAsset: true,
    sourceAvailable,
    directionalAvailable,
    netVolume,
    totalKnownVolume,
    totalVolume,
    referencePrice,
    updatedAt: rows[rows.length - 1]?.ts_event ? normalizeDatabentoTimestamp(rows[rows.length - 1].ts_event) : null,
    source: config.source,
  });
}

async function buildDeribitDeltaSignal(currency) {
  const normalizedCurrency = typeof currency === "string" ? currency.toUpperCase() : "";
  const config = DELTA_CONFIGS[normalizedCurrency];
  if (!config) {
    throw new Error(`Unsupported Deribit delta asset: ${currency}`);
  }

  const result = await deribitPublic("public/get_last_trades_by_currency_and_time", {
    currency: normalizedCurrency,
    kind: "future",
    start_timestamp: Date.now() - config.windowMinutes * 60 * 1000,
    end_timestamp: Date.now(),
    count: 1000,
    sorting: "asc",
  });

  const trades = Array.isArray(result?.trades) ? result.trades : Array.isArray(result) ? result : [];
  let buyVolume = 0;
  let sellVolume = 0;
  let directionalTrades = 0;

  trades.forEach((trade) => {
    const size = Number(trade.amount ?? trade.contracts ?? 0);
    if (!Number.isFinite(size) || size <= 0) {
      return;
    }

    if (trade.direction === "buy") {
      buyVolume += size;
      directionalTrades += 1;
    } else if (trade.direction === "sell") {
      sellVolume += size;
      directionalTrades += 1;
    }
  });

  const totalKnownVolume = buyVolume + sellVolume;
  const netVolume = buyVolume - sellVolume;
  const directionalStrength = totalKnownVolume > 0 ? Math.abs(netVolume) / totalKnownVolume : 0;
  const sourceAvailable = trades.length > 0;
  const directionalAvailable =
    sourceAvailable &&
    directionalTrades >= config.minDirectionalTrades &&
    totalKnownVolume > 0 &&
    directionalStrength >= config.minDirectionalStrength;
  const referencePrice = calculateWeightedReferencePrice(
    trades.map((trade) => ({
      price: Number(trade?.price ?? NaN),
      size: Number(trade?.amount ?? trade?.contracts ?? 0),
    })),
    2,
  );

  return buildDeltaSignalPayload({
    supportedAsset: true,
    sourceAvailable,
    directionalAvailable,
    netVolume,
    totalKnownVolume,
    totalVolume: totalKnownVolume,
    referencePrice,
    updatedAt:
      trades.length && Number.isFinite(Number(trades[trades.length - 1]?.timestamp))
        ? new Date(Number(trades[trades.length - 1].timestamp)).toISOString()
        : null,
    source: config.source,
  });
}

async function binancePublic(pathname, query = {}) {
  const url = new URL(`https://api.binance.com${pathname}`);
  Object.entries(query).forEach(([key, value]) => {
    if (value !== undefined && value !== null && value !== "") {
      url.searchParams.set(key, String(value));
    }
  });

  const response = await fetch(url.toString(), { headers: { Accept: "application/json" } });
  const text = await response.text();
  let payload;
  try {
    payload = JSON.parse(text);
  } catch {
    payload = text;
  }

  if (!response.ok) {
    throw new Error(typeof payload === "string" ? payload : JSON.stringify(payload));
  }

  return payload;
}

async function buildBinanceDeltaSignal(symbol) {
  const normalizedSymbol = typeof symbol === "string" ? symbol.toUpperCase() : "";
  const config = DELTA_CONFIGS[normalizedSymbol];
  if (!config) {
    throw new Error(`Unsupported Binance delta asset: ${symbol}`);
  }

  const marketSymbol = normalizedSymbol === "SOL" ? "SOLUSDT" : normalizedSymbol;
  const endTime = Date.now();
  const startTime = endTime - config.windowMinutes * 60 * 1000;
  const payload = await binancePublic("/api/v3/aggTrades", {
    symbol: marketSymbol,
    startTime,
    endTime,
    limit: 1000,
  });

  const trades = Array.isArray(payload) ? payload : [];
  let buyVolume = 0;
  let sellVolume = 0;
  let directionalTrades = 0;

  trades.forEach((trade) => {
    const size = Number(trade.q ?? 0);
    if (!Number.isFinite(size) || size <= 0) {
      return;
    }

    if (trade.m === true) {
      sellVolume += size;
      directionalTrades += 1;
      return;
    }

    if (trade.m === false) {
      buyVolume += size;
      directionalTrades += 1;
    }
  });

  const totalKnownVolume = buyVolume + sellVolume;
  const netVolume = buyVolume - sellVolume;
  const directionalStrength = totalKnownVolume > 0 ? Math.abs(netVolume) / totalKnownVolume : 0;
  const sourceAvailable = trades.length > 0;
  const directionalAvailable =
    sourceAvailable &&
    directionalTrades >= config.minDirectionalTrades &&
    totalKnownVolume > 0 &&
    directionalStrength >= config.minDirectionalStrength;
  const referencePrice = calculateWeightedReferencePrice(
    trades.map((trade) => ({
      price: Number(trade?.p ?? NaN),
      size: Number(trade?.q ?? 0),
    })),
    2,
  );

  return buildDeltaSignalPayload({
    supportedAsset: true,
    sourceAvailable,
    directionalAvailable,
    netVolume,
    totalKnownVolume,
    totalVolume: totalKnownVolume,
    referencePrice,
    updatedAt:
      trades.length && Number.isFinite(Number(trades[trades.length - 1]?.T))
        ? new Date(Number(trades[trades.length - 1].T)).toISOString()
        : null,
    source: config.source,
  });
}

async function buildActusDeltaSignal(asset) {
  const normalizedAsset = normalizeActusDeltaAsset(asset);
  if (normalizedAsset === "ETH") {
    try {
      return await buildDeribitDeltaSignal("ETH");
    } catch {
      return buildUnavailableDeltaSignal("ETH", DELTA_CONFIGS.ETH?.source ?? null);
    }
  }

  if (normalizedAsset === "SOL") {
    try {
      return await buildBinanceDeltaSignal("SOL");
    } catch {
      return buildUnavailableDeltaSignal("SOL", DELTA_CONFIGS.SOL?.source ?? null);
    }
  }

  if (normalizedAsset === "NQ" || normalizedAsset === "GC" || normalizedAsset === "CL" || normalizedAsset === "6E" || normalizedAsset === "BTC" || normalizedAsset === "SOL_CME") {
    try {
      return await buildDatabentoDeltaSignal(normalizedAsset);
    } catch {
      return buildUnavailableDeltaSignal(normalizedAsset, DELTA_CONFIGS[normalizedAsset]?.source ?? null);
    }
  }

  return {
    deltaAvailability: "UNSUPPORTED",
    deltaSupportedAsset: false,
    deltaSourceAvailable: false,
    deltaDirectionalAvailable: false,
    bias: "NEUTRAL",
    strength: 0,
    condition: "NEUTRAL",
    deltaReferencePrice: null,
    source: null,
    updatedAt: null,
  };
}

function extractLatestDatabentoQuotePrice(rows, precision) {
  const latest = [...rows]
    .reverse()
    .find((row) => {
      const bid = normalizeDatabentoNumber(row?.bid_px_00);
      const ask = normalizeDatabentoNumber(row?.ask_px_00);
      return bid !== null && ask !== null && bid > 0 && ask > 0 && ask >= bid;
    });
  if (!latest) return null;

  const bid = normalizeDatabentoNumber(latest.bid_px_00);
  const ask = normalizeDatabentoNumber(latest.ask_px_00);
  const price = bid !== null && ask !== null && bid > 0 && ask > 0 && ask >= bid ? round((bid + ask) / 2, precision) : null;
  if (!Number.isFinite(price)) {
    return null;
  }

  return {
    price,
    updatedAt: normalizeDatabentoTimestamp(latest.ts_event),
    sourceType: "quote-mid",
  };
}

function extractLatestDatabentoTradePrice(rows, precision) {
  const latest = [...rows]
    .reverse()
    .find((row) => Number.isFinite(normalizeDatabentoNumber(row?.price)));
  if (!latest) return null;

  const rawPrice = normalizeDatabentoNumber(latest.price);
  if (!Number.isFinite(rawPrice)) {
    return null;
  }

  return {
    price: round(rawPrice, precision),
    updatedAt: normalizeDatabentoTimestamp(latest.ts_event),
    sourceType: "last-trade",
  };
}

async function buildDatabentoLivePrice(asset) {
  const normalizedAsset = normalizeActusLivePriceAsset(asset);
  const future = normalizedAsset ? getDatabentoFuture(normalizedAsset) : null;
  if (!normalizedAsset || !future) {
    throw new Error(`Unsupported Databento live price asset: ${asset}`);
  }

  const end = databentoLiveSafeEndIso();
  const activeContract = await resolveActiveDatabentoFutureContract(normalizedAsset, { end });
  if (!activeContract?.rawSymbol) {
    throw new Error(`No active Databento contract resolved for ${asset}`);
  }
  const quoteStart = isoMinutesBefore(end, normalizedAsset === "GC" ? 360 : 180);
  const tradeStart = isoMinutesBefore(end, normalizedAsset === "GC" ? 360 : 180);
  const [quoteRowsResult, tradeRowsResult] = await Promise.all([
    databentoHistoricalWithAvailableEndRetry({
      dataset: "GLBX.MDP3",
      schema: "mbp-1",
      symbols: activeContract.rawSymbol,
      stype_in: "raw_symbol",
      start: quoteStart,
      end,
      encoding: "csv",
      limit: 5000,
    })
      .then((rows) => ({ rows, symbol: activeContract.rawSymbol, sourceType: activeContract.sourceType }))
      .catch(() => null),
    databentoHistoricalWithAvailableEndRetry({
      dataset: "GLBX.MDP3",
      schema: "trades",
      symbols: activeContract.rawSymbol,
      stype_in: "raw_symbol",
      start: tradeStart,
      end,
      encoding: "csv",
      limit: 5000,
    })
      .then((rows) => ({ rows, symbol: activeContract.rawSymbol, sourceType: activeContract.sourceType }))
      .catch(() => null),
  ]);

  const quotePrice = extractLatestDatabentoQuotePrice(quoteRowsResult?.rows ?? [], future.priceScale);
  const tradePrice = extractLatestDatabentoTradePrice(tradeRowsResult?.rows ?? [], future.priceScale);
  const quoteTimestamp = quotePrice?.updatedAt ? Date.parse(quotePrice.updatedAt) : 0;
  const tradeTimestamp = tradePrice?.updatedAt ? Date.parse(tradePrice.updatedAt) : 0;
  const resolved = quoteTimestamp >= tradeTimestamp && quotePrice ? quotePrice : tradePrice ?? quotePrice;

  return {
    asset: normalizedAsset,
    supportedAsset: true,
    price: resolved?.price ?? null,
    updatedAt: resolved?.updatedAt ?? null,
    liveSymbol: activeContract.rawSymbol,
    source:
      resolved?.sourceType === "quote-mid"
        ? "databento-cme-futures-quote"
        : resolved?.sourceType === "last-trade"
          ? "databento-cme-futures-trade"
          : "databento-cme-futures",
    sourceType: resolved?.sourceType ?? null,
  };
}

async function buildDeribitLivePrice(currency) {
  const normalizedCurrency = typeof currency === "string" ? currency.toUpperCase() : "";
  if (normalizedCurrency !== "BTC" && normalizedCurrency !== "ETH") {
    throw new Error(`Unsupported Deribit live price asset: ${currency}`);
  }

  const result = await deribitPublic("public/ticker", {
    instrument_name: `${normalizedCurrency}-PERPETUAL`,
  });
  const lastPrice = Number(result?.last_price ?? 0);
  const bestBid = Number(result?.best_bid_price ?? 0);
  const bestAsk = Number(result?.best_ask_price ?? 0);
  const midPrice = bestBid > 0 && bestAsk > 0 && bestAsk >= bestBid ? (bestBid + bestAsk) / 2 : null;
  const resolvedPrice = Number.isFinite(lastPrice) && lastPrice > 0 ? lastPrice : midPrice;

  return {
    asset: normalizedCurrency,
    supportedAsset: true,
    price: Number.isFinite(resolvedPrice) && resolvedPrice > 0 ? round(resolvedPrice, 2) : null,
    updatedAt: Number.isFinite(Number(result?.timestamp)) ? new Date(Number(result.timestamp)).toISOString() : new Date().toISOString(),
    source: Number.isFinite(lastPrice) && lastPrice > 0 ? `deribit-${normalizedCurrency.toLowerCase()}-perpetual-trade` : `deribit-${normalizedCurrency.toLowerCase()}-perpetual-quote`,
    sourceType: Number.isFinite(lastPrice) && lastPrice > 0 ? "last-trade" : midPrice ? "quote-mid" : null,
  };
}

async function buildBinanceLivePrice(symbol) {
  const normalizedSymbol = typeof symbol === "string" ? symbol.toUpperCase() : "";
  if (normalizedSymbol !== "SOL") {
    throw new Error(`Unsupported Binance live price asset: ${symbol}`);
  }

  const trades = await binancePublic("/api/v3/aggTrades", {
    symbol: "SOLUSDT",
    limit: 1,
  });
  const latestTrade = Array.isArray(trades) ? trades[trades.length - 1] : null;
  const tradePrice = Number(latestTrade?.p ?? 0);

  if (Number.isFinite(tradePrice) && tradePrice > 0) {
    return {
      asset: normalizedSymbol,
      supportedAsset: true,
      price: round(tradePrice, 2),
      updatedAt: Number.isFinite(Number(latestTrade?.T)) ? new Date(Number(latestTrade.T)).toISOString() : new Date().toISOString(),
      source: "binance-solusdt-agg-trade",
      sourceType: "last-trade",
    };
  }

  const quote = await binancePublic("/api/v3/ticker/bookTicker", {
    symbol: "SOLUSDT",
  });
  const bid = Number(quote?.bidPrice ?? 0);
  const ask = Number(quote?.askPrice ?? 0);
  const mid = bid > 0 && ask > 0 && ask >= bid ? (bid + ask) / 2 : null;

  return {
    asset: normalizedSymbol,
    supportedAsset: true,
    price: Number.isFinite(mid) && mid > 0 ? round(mid, 2) : null,
    updatedAt: new Date().toISOString(),
    source: "binance-solusdt-book-quote",
    sourceType: Number.isFinite(mid) && mid > 0 ? "quote-mid" : null,
  };
}

async function buildActusLivePrice(asset) {
  const normalizedAsset = normalizeActusLivePriceAsset(asset);
  if (!normalizedAsset) {
    return {
      asset: typeof asset === "string" ? asset.toUpperCase() : "UNKNOWN",
      supportedAsset: false,
      price: null,
      updatedAt: null,
      source: null,
      sourceType: null,
    };
  }

  const stream = actusTickStreams.get(normalizedAsset);
  if (stream?.updatedAt && Date.now() - Date.parse(stream.updatedAt) <= STREAM_STALE_MS && Number.isFinite(stream.price)) {
    return {
      asset: normalizedAsset,
      supportedAsset: true,
      price: stream.price,
      updatedAt: stream.updatedAt,
      source: stream.source ?? null,
      sourceType: stream.sourceType ?? null,
      liveSymbol: stream.liveSymbol ?? null,
      liveSourceType: stream.liveSourceType ?? null,
    };
  }

  if (normalizedAsset === "ETH") {
    return buildDeribitLivePrice(normalizedAsset);
  }
  if (normalizedAsset === "SOL") {
    return buildBinanceLivePrice(normalizedAsset);
  }

  return buildDatabentoLivePrice(normalizedAsset);
}

function timeframeBucketStartMs(timeframe, timestampMs = Date.now()) {
  const minutes = timeframeToMinutes(normalizeTimeframe(timeframe));
  const bucketMs = minutes * 60 * 1000;
  return Math.floor(timestampMs / bucketMs) * bucketMs;
}

function actusSourceHistoryWindow(timeframe, limit = 160) {
  const normalizedTimeframe = normalizeTimeframe(timeframe);
  const durationMs = timeframeToMinutes(normalizedTimeframe) * 60 * 1000;
  const clampedLimit = Math.max(2, Number(limit) || 160);
  const currentBucketStartMs = timeframeBucketStartMs(normalizedTimeframe);
  return {
    timeframe: normalizedTimeframe,
    durationMs,
    currentBucketStartMs,
    endTimestampMs: Math.max(currentBucketStartMs - 1, 0),
    startTimestampMs: Math.max(currentBucketStartMs - durationMs * (clampedLimit + 4), 0),
    limit: clampedLimit,
  };
}

function normalizeActusSourceHistoryAsset(asset) {
  const normalizedAsset = typeof asset === "string" ? asset.toUpperCase() : "";
  if (normalizedAsset === "ETH" || normalizedAsset === "ETH/USD") return "ETH";
  if (normalizedAsset === "SOL" || normalizedAsset === "SOL/USD") return "SOL";
  return null;
}

function deribitResolutionForTimeframe(timeframe) {
  const normalized = normalizeTimeframe(timeframe);
  if (normalized === "1m") return "1";
  if (normalized === "5m") return "5";
  if (normalized === "15m") return "15";
  return "60";
}

function binanceIntervalForTimeframe(timeframe) {
  const normalized = normalizeTimeframe(timeframe);
  if (normalized === "1m") return "1m";
  if (normalized === "5m") return "5m";
  if (normalized === "15m") return "15m";
  return "1h";
}

function filterClosedActusHistoryCandles(candles, timeframe) {
  const currentBucketStartMs = timeframeBucketStartMs(timeframe);
  return (candles ?? []).filter((candle) => {
    const timestampMs = Date.parse(candle?.timestamp ?? "");
    return Number.isFinite(timestampMs) && timestampMs < currentBucketStartMs;
  });
}

async function fetchDeribitPerpetualHistory(currency, timeframe, options = {}) {
  const normalizedCurrency = typeof currency === "string" ? currency.toUpperCase() : "";
  if (normalizedCurrency !== "ETH") {
    throw new Error(`Unsupported Deribit source history asset: ${currency}`);
  }

  const window = actusSourceHistoryWindow(timeframe, options.limit);
  const result = await deribitPublic("public/get_tradingview_chart_data", {
    instrument_name: `${normalizedCurrency}-PERPETUAL`,
    resolution: deribitResolutionForTimeframe(window.timeframe),
    start_timestamp: window.startTimestampMs,
    end_timestamp: window.endTimestampMs,
  });
  const payload = result?.result ?? result ?? {};
  const ticks = Array.isArray(payload?.ticks) ? payload.ticks : [];
  const open = Array.isArray(payload?.open) ? payload.open : [];
  const high = Array.isArray(payload?.high) ? payload.high : [];
  const low = Array.isArray(payload?.low) ? payload.low : [];
  const close = Array.isArray(payload?.close) ? payload.close : [];
  const volume = Array.isArray(payload?.volume) ? payload.volume : [];

  const candles = ticks
    .map((tick, index) => {
      const timestampMs = Number(tick);
      const openValue = Number(open[index] ?? NaN);
      const highValue = Number(high[index] ?? NaN);
      const lowValue = Number(low[index] ?? NaN);
      const closeValue = Number(close[index] ?? NaN);
      const volumeValue = Number(volume[index] ?? 0);
      if (
        !Number.isFinite(timestampMs) ||
        !Number.isFinite(openValue) ||
        !Number.isFinite(highValue) ||
        !Number.isFinite(lowValue) ||
        !Number.isFinite(closeValue)
      ) {
        return null;
      }
      return {
        timestamp: new Date(timestampMs).toISOString(),
        open: round(openValue, 2),
        high: round(highValue, 2),
        low: round(lowValue, 2),
        close: round(closeValue, 2),
        volume: round(volumeValue, 6),
      };
    })
    .filter(Boolean);

  return {
    asset: normalizedCurrency,
    source: `deribit-${normalizedCurrency.toLowerCase()}-perpetual-history`,
    candles: filterClosedActusHistoryCandles(candles, window.timeframe).slice(-window.limit),
  };
}

async function fetchBinanceSourceHistory(symbol, timeframe, options = {}) {
  const normalizedSymbol = typeof symbol === "string" ? symbol.toUpperCase() : "";
  if (normalizedSymbol !== "SOL") {
    throw new Error(`Unsupported Binance source history asset: ${symbol}`);
  }

  const window = actusSourceHistoryWindow(timeframe, options.limit);
  const payload = await binancePublic("/api/v3/klines", {
    symbol: "SOLUSDT",
    interval: binanceIntervalForTimeframe(window.timeframe),
    endTime: window.endTimestampMs,
    limit: window.limit + 2,
  });
  const rows = Array.isArray(payload) ? payload : [];
  const candles = rows
    .map((row) => {
      const values = Array.isArray(row) ? row : row?.value;
      if (!Array.isArray(values) || values.length < 6) {
        return null;
      }
      const timestampMs = Number(values[0] ?? NaN);
      const openValue = Number(values[1] ?? NaN);
      const highValue = Number(values[2] ?? NaN);
      const lowValue = Number(values[3] ?? NaN);
      const closeValue = Number(values[4] ?? NaN);
      const volumeValue = Number(values[5] ?? 0);
      if (
        !Number.isFinite(timestampMs) ||
        !Number.isFinite(openValue) ||
        !Number.isFinite(highValue) ||
        !Number.isFinite(lowValue) ||
        !Number.isFinite(closeValue)
      ) {
        return null;
      }
      return {
        timestamp: new Date(timestampMs).toISOString(),
        open: round(openValue, 2),
        high: round(highValue, 2),
        low: round(lowValue, 2),
        close: round(closeValue, 2),
        volume: round(volumeValue, 6),
      };
    })
    .filter(Boolean);

  return {
    asset: normalizedSymbol,
    source: "binance-solusdt-klines",
    candles: filterClosedActusHistoryCandles(candles, window.timeframe).slice(-window.limit),
  };
}

async function fetchActusSourceHistory(asset, timeframe, options = {}) {
  const normalizedAsset = normalizeActusSourceHistoryAsset(asset);
  if (!normalizedAsset) {
    return {
      asset: typeof asset === "string" ? asset.toUpperCase() : "UNKNOWN",
      supportedAsset: false,
      source: null,
      candles: [],
    };
  }

  if (normalizedAsset === "ETH") {
    const result = await fetchDeribitPerpetualHistory(normalizedAsset, timeframe, options);
    return {
      asset: normalizedAsset,
      supportedAsset: true,
      source: result.source,
      candles: result.candles,
    };
  }

  const result = await fetchBinanceSourceHistory(normalizedAsset, timeframe, options);
  return {
    asset: normalizedAsset,
    supportedAsset: true,
    source: result.source,
    candles: result.candles,
  };
}

function liveChartPollMs(timeframe) {
  const normalized = normalizeTimeframe(timeframe);
  if (normalized === "1m") return 1200;
  if (normalized === "5m") return 1500;
  if (normalized === "15m") return 2200;
  return 3500;
}

function buildLiveCandleFromPoints(points, args) {
  const { asset, symbol, timeframe, precision, bucketStartMs } = args;
  if (!Array.isArray(points) || !points.length || !Number.isFinite(bucketStartMs)) {
    return null;
  }

  const inBucket = points
    .filter((point) => Number.isFinite(point.timestampMs) && point.timestampMs >= bucketStartMs)
    .sort((a, b) => a.timestampMs - b.timestampMs);

  if (!inBucket.length) {
    return null;
  }

  let high = inBucket[0].price;
  let low = inBucket[0].price;
  let volume = 0;
  for (const point of inBucket) {
    high = Math.max(high, point.price);
    low = Math.min(low, point.price);
    volume += Number.isFinite(point.size) ? point.size : 0;
  }

  return {
    asset,
    symbol,
    timeframe,
    timestamp: new Date(bucketStartMs).toISOString(),
    open: round(inBucket[0].price, precision),
    high: round(high, precision),
    low: round(low, precision),
    close: round(inBucket[inBucket.length - 1].price, precision),
    volume: round(volume, 4),
  };
}

function pruneStreamPoints(points) {
  if (!Array.isArray(points) || !points.length) {
    return [];
  }

  const cutoff = Date.now() - STREAM_POINT_RETENTION_MS;
  return points.filter((point) => Number.isFinite(point.timestampMs) && point.timestampMs >= cutoff);
}

function createActusTickStreamState(asset) {
  return {
    asset,
    points: [],
    liveCandles: new Map(),
    listeners: new Set(),
    lastTick: null,
    lastQuote: null,
    heartbeatTimer: null,
    restartTimer: null,
    close: null,
    emit: null,
  };
}

function notifyActusTickStream(stream, event) {
  stream.listeners.forEach((listener) => {
    try {
      listener(event);
    } catch {
      // Listener failures should not break the shared stream.
    }
  });
}

function updateActusTickStreamState(stream, nextTick) {
  if (!stream || !nextTick) {
    return;
  }

  const precision = getDatabentoFuture(stream.asset)?.priceScale ?? 2;
  const timestampMs = Date.parse(nextTick.updatedAt ?? "");
  if (!Number.isFinite(timestampMs)) {
    return;
  }

  const normalizedTick = {
    ...nextTick,
    price: Number.isFinite(nextTick.price) ? round(nextTick.price, precision) : null,
    timestampMs,
  };

  if (normalizedTick.price === null) {
    return;
  }

  if (normalizedTick.sourceType === "quote-mid") {
    stream.lastQuote = normalizedTick;
  } else {
    stream.lastTick = normalizedTick;
  }

  const preferred =
    stream.lastQuote && (!stream.lastTick || stream.lastQuote.timestampMs >= stream.lastTick.timestampMs)
      ? stream.lastQuote
      : stream.lastTick ?? stream.lastQuote;

  if (!preferred?.price) {
    return;
  }

  stream.price = preferred.price;
  stream.updatedAt = preferred.updatedAt;
  stream.sourceType = preferred.sourceType;
  stream.source = preferred.source;
  stream.liveSymbol = preferred.symbol ?? stream.liveSymbol ?? null;
  stream.liveSourceType = preferred.liveSourceType ?? "raw_symbol";
  stream.candleSourceSymbol = preferred.symbol ?? stream.candleSourceSymbol ?? stream.liveSymbol ?? null;
  stream.candleSourceType = preferred.candleSourceType ?? "raw_symbol";
  stream.points = pruneStreamPoints([
    ...stream.points,
    {
      price: preferred.price,
      timestampMs,
      size: Number.isFinite(preferred.size) ? preferred.size : 0,
    },
  ]);

  Object.keys(TIMEFRAME_CONFIGS).forEach((timeframe) => {
    const bucketStartMs = timeframeBucketStartMs(timeframe, timestampMs);
    const existing = stream.liveCandles.get(timeframe);
    const size = Number.isFinite(preferred.size) ? preferred.size : 0;
    if (!existing || existing.timestampMs !== bucketStartMs) {
      stream.liveCandles.set(timeframe, {
        timestampMs: bucketStartMs,
        open: preferred.price,
        high: preferred.price,
        low: preferred.price,
        close: preferred.price,
        volume: size,
      });
      return;
    }

    existing.high = Math.max(existing.high, preferred.price);
    existing.low = Math.min(existing.low, preferred.price);
    existing.close = preferred.price;
    existing.volume += size;
  });

  notifyActusTickStream(stream, {
    type: "tick",
    asset: stream.asset,
    price: stream.price,
    updatedAt: stream.updatedAt,
    source: stream.source,
    sourceType: stream.sourceType,
    liveSymbol: stream.liveSymbol,
    liveSourceType: stream.liveSourceType,
    candleSourceSymbol: stream.candleSourceSymbol,
    candleSourceType: stream.candleSourceType,
  });
}

function seedActusTickStreamCandle(stream, timeframe, seedCandle) {
  if (!stream || !seedCandle) {
    return;
  }

  const timestampMs = Date.parse(seedCandle.timestamp ?? "");
  if (!Number.isFinite(timestampMs)) {
    return;
  }

  stream.liveCandles.set(normalizeTimeframe(timeframe), {
    timestampMs,
    open: Number(seedCandle.open ?? 0),
    high: Number(seedCandle.high ?? 0),
    low: Number(seedCandle.low ?? 0),
    close: Number(seedCandle.close ?? 0),
    volume: Number(seedCandle.volume ?? 0),
  });
}

function buildActusStreamingSnapshot(asset, timeframe, stream) {
  const normalizedAsset = normalizeActusLivePriceAsset(asset);
  const future = normalizedAsset ? getDatabentoFuture(normalizedAsset) : null;
  const precision = future?.priceScale ?? 2;
  const livePrice = Number.isFinite(stream?.price) ? round(stream.price, precision) : null;
  const activeCandle = stream?.liveCandles?.get(normalizeTimeframe(timeframe)) ?? null;

  return {
    asset: normalizedAsset ?? asset,
    timeframe: normalizeTimeframe(timeframe),
    supportedAsset: true,
    livePrice,
    updatedAt: stream?.updatedAt ?? null,
    liveSymbol: stream?.liveSymbol ?? null,
    liveSourceType: stream?.liveSourceType ?? null,
    candleSourceSymbol: stream?.candleSourceSymbol ?? stream?.liveSymbol ?? null,
    candleSourceType: stream?.candleSourceType ?? stream?.liveSourceType ?? null,
    source: stream?.source ?? null,
    sourceType: stream?.sourceType ?? null,
    candle: activeCandle
      ? {
          asset: normalizedAsset ?? asset,
          symbol: future?.symbol ?? stream?.liveSymbol ?? String(asset),
          timeframe: normalizeTimeframe(timeframe),
          timestamp: new Date(activeCandle.timestampMs).toISOString(),
          open: round(activeCandle.open, precision),
          high: round(activeCandle.high, precision),
          low: round(activeCandle.low, precision),
          close: round(activeCandle.close, precision),
          volume: round(activeCandle.volume, 4),
        }
      : buildLiveCandleFromPoints(stream?.points ?? [], {
          asset: normalizedAsset ?? asset,
          symbol: future?.symbol ?? stream?.liveSymbol ?? String(asset),
          timeframe: normalizeTimeframe(timeframe),
          precision,
          bucketStartMs: timeframeBucketStartMs(timeframe),
        }),
  };
}

async function resolveDatabentoStreamingContract(asset) {
  const normalizedAsset = normalizeActusLivePriceAsset(asset);
  if (!normalizedAsset) {
    return null;
  }
  const end = new Date().toISOString();
  return resolveActiveDatabentoFutureContract(normalizedAsset, { end });
}

function attachActusTickStreamHeartbeat(stream) {
  if (stream.heartbeatTimer) {
    clearInterval(stream.heartbeatTimer);
  }

  stream.heartbeatTimer = setInterval(() => {
    if (!stream.listeners.size) {
      return;
    }
    notifyActusTickStream(stream, {
      type: "heartbeat",
      asset: stream.asset,
      updatedAt: stream.updatedAt ?? null,
    });
  }, STREAM_HEARTBEAT_MS);
}

function stopActusTickStream(stream) {
  if (!stream) {
    return;
  }

  if (stream.heartbeatTimer) {
    clearInterval(stream.heartbeatTimer);
    stream.heartbeatTimer = null;
  }
  if (stream.restartTimer) {
    clearTimeout(stream.restartTimer);
    stream.restartTimer = null;
  }
  stream.close?.();
  stream.close = null;
}

function startBinanceActusTickStream(stream, asset) {
  const ws = new WebSocket("wss://stream.binance.com:9443/ws/solusdt@aggTrade");
  stream.close = () => {
    try {
      ws.close();
    } catch {
      // Best effort cleanup.
    }
  };

  ws.onmessage = (message) => {
    try {
      const payload = JSON.parse(String(message.data));
      const price = Number(payload?.p ?? 0);
      const timestamp = Number(payload?.T ?? 0);
      if (!Number.isFinite(price) || price <= 0 || !Number.isFinite(timestamp) || timestamp <= 0) {
        return;
      }
      updateActusTickStreamState(stream, {
        price,
        size: Number(payload?.q ?? 0),
        updatedAt: new Date(timestamp).toISOString(),
        symbol: "SOLUSDT",
        source: "binance-solusdt-agg-trade",
        sourceType: "last-trade",
      });
    } catch {
      // Ignore malformed frames.
    }
  };

  ws.onclose = () => {
    if (!stream.listeners.size) {
      return;
    }
    stream.restartTimer = setTimeout(() => {
      stream.restartTimer = null;
      startBinanceActusTickStream(stream, asset);
    }, 1500);
  };
  ws.onerror = () => {
    try {
      ws.close();
    } catch {
      // Ignore close failures on reconnect.
    }
  };
}

function startDeribitActusTickStream(stream, asset) {
  const instrumentName = `${asset}-PERPETUAL`;
  const ws = new WebSocket("wss://www.deribit.com/ws/api/v2");
  stream.close = () => {
    try {
      ws.close();
    } catch {
      // Best effort cleanup.
    }
  };

  ws.onopen = () => {
    ws.send(
      JSON.stringify({
        jsonrpc: "2.0",
        id: 1,
        method: "public/subscribe",
        params: {
          channels: [`trades.${instrumentName}.100ms`, `ticker.${instrumentName}.100ms`],
        },
      }),
    );
  };

  ws.onmessage = (message) => {
    try {
      const payload = JSON.parse(String(message.data));
      const channel = payload?.params?.channel ?? "";
      const data = payload?.params?.data ?? null;

      if (typeof channel === "string" && channel.startsWith("trades.")) {
        const trades = Array.isArray(data) ? data : [];
        trades.forEach((trade) => {
          const price = Number(trade?.price ?? 0);
          const timestamp = Number(trade?.timestamp ?? 0);
          if (!Number.isFinite(price) || price <= 0 || !Number.isFinite(timestamp) || timestamp <= 0) {
            return;
          }
          updateActusTickStreamState(stream, {
            price,
            size: Number(trade?.amount ?? trade?.contracts ?? 0),
            updatedAt: new Date(timestamp).toISOString(),
            symbol: instrumentName,
            source: `deribit-${asset.toLowerCase()}-perpetual-trade`,
            sourceType: "last-trade",
          });
        });
        return;
      }

      if (typeof channel === "string" && channel.startsWith("ticker.")) {
        const bestBid = Number(data?.best_bid_price ?? 0);
        const bestAsk = Number(data?.best_ask_price ?? 0);
        const lastPrice = Number(data?.last_price ?? 0);
        const timestamp = Number(data?.timestamp ?? Date.now());
        const midPrice =
          Number.isFinite(bestBid) && Number.isFinite(bestAsk) && bestBid > 0 && bestAsk > 0 && bestAsk >= bestBid
            ? (bestBid + bestAsk) / 2
            : null;
        const price = Number.isFinite(lastPrice) && lastPrice > 0 ? lastPrice : midPrice;
        if (!Number.isFinite(price) || price <= 0) {
          return;
        }
        updateActusTickStreamState(stream, {
          price,
          size: 0,
          updatedAt: new Date(timestamp).toISOString(),
          symbol: instrumentName,
          source:
            Number.isFinite(lastPrice) && lastPrice > 0
              ? `deribit-${asset.toLowerCase()}-perpetual-trade`
              : `deribit-${asset.toLowerCase()}-perpetual-quote`,
          sourceType: Number.isFinite(lastPrice) && lastPrice > 0 ? "last-trade" : "quote-mid",
        });
      }
    } catch {
      // Ignore malformed frames.
    }
  };

  ws.onclose = () => {
    if (!stream.listeners.size) {
      return;
    }
    stream.restartTimer = setTimeout(() => {
      stream.restartTimer = null;
      startDeribitActusTickStream(stream, asset);
    }, 1500);
  };
  ws.onerror = () => {
    try {
      ws.close();
    } catch {
      // Ignore close failures on reconnect.
    }
  };
}

async function startDatabentoActusTickStream(stream, asset) {
  const contract = await resolveDatabentoStreamingContract(asset);
  if (!contract?.rawSymbol) {
    throw new Error(`No active Databento contract resolved for ${asset}`);
  }

  const child = spawn(
    PYTHON_BIN,
    [
      DATABENTO_LIVE_STREAM_SCRIPT,
      "--key",
      DATABENTO_API_KEY,
      "--asset",
      asset,
      "--symbol",
      contract.rawSymbol,
    ],
    {
      cwd: __dirname,
      stdio: ["ignore", "pipe", "pipe"],
    },
  );

  stream.liveSymbol = contract.rawSymbol;
  stream.liveSourceType = contract.sourceType ?? "raw_symbol";
  stream.candleSourceSymbol = contract.rawSymbol;
  stream.candleSourceType = contract.sourceType ?? "raw_symbol";

  let stdoutBuffer = "";
  child.stdout.on("data", (chunk) => {
    stdoutBuffer += chunk.toString("utf8");
    const lines = stdoutBuffer.split(/\r?\n/);
    stdoutBuffer = lines.pop() ?? "";
    lines.forEach((line) => {
      const trimmed = line.trim();
      if (!trimmed) return;
      try {
        const payload = JSON.parse(trimmed);
        if (payload?.type !== "trade" && payload?.type !== "quote") {
          return;
        }
        updateActusTickStreamState(stream, {
          price: Number(payload.price ?? 0),
          size: Number(payload.size ?? 0),
          updatedAt: typeof payload.timestamp === "string" ? payload.timestamp : null,
          symbol: payload.symbol ?? contract.rawSymbol,
          source:
            payload.type === "quote" ? "databento-cme-futures-quote" : "databento-cme-futures-trade",
          sourceType: payload.sourceType === "quote-mid" ? "quote-mid" : "last-trade",
          liveSourceType: contract.sourceType ?? "raw_symbol",
          candleSourceType: contract.sourceType ?? "raw_symbol",
        });
      } catch {
        // Ignore malformed child output.
      }
    });
  });

  child.stderr.on("data", () => {
    // Keep stderr quiet for now; the stream will reconnect if the child dies.
  });

  child.on("exit", () => {
    if (!stream.listeners.size) {
      return;
    }
    stream.restartTimer = setTimeout(() => {
      stream.restartTimer = null;
      void startDatabentoActusTickStream(stream, asset);
    }, 1500);
  });

  stream.close = () => {
    try {
      child.kill();
    } catch {
      // Best effort cleanup.
    }
  };
}

async function ensureActusTickStream(asset) {
  const normalizedAsset = normalizeActusLivePriceAsset(asset);
  if (!normalizedAsset) {
    return null;
  }

  let stream = actusTickStreams.get(normalizedAsset);
  if (stream) {
    return stream;
  }

  stream = createActusTickStreamState(normalizedAsset);
  actusTickStreams.set(normalizedAsset, stream);
  attachActusTickStreamHeartbeat(stream);

  if (normalizedAsset === "ETH") {
    startDeribitActusTickStream(stream, normalizedAsset);
  } else if (normalizedAsset === "SOL") {
    startBinanceActusTickStream(stream, normalizedAsset);
  } else {
    await startDatabentoActusTickStream(stream, normalizedAsset);
  }

  return stream;
}

async function subscribeActusTickStream(asset, listener) {
  const stream = await ensureActusTickStream(asset);
  if (!stream) {
    return () => {};
  }

  stream.listeners.add(listener);
  if (stream.price !== undefined && stream.updatedAt) {
    listener({
      type: "tick",
      asset: stream.asset,
      price: stream.price ?? null,
      updatedAt: stream.updatedAt ?? null,
      source: stream.source ?? null,
      sourceType: stream.sourceType ?? null,
      liveSymbol: stream.liveSymbol ?? null,
      liveSourceType: stream.liveSourceType ?? null,
      candleSourceSymbol: stream.candleSourceSymbol ?? null,
      candleSourceType: stream.candleSourceType ?? null,
    });
  }

  return () => {
    stream.listeners.delete(listener);
    if (!stream.listeners.size) {
      stopActusTickStream(stream);
      actusTickStreams.delete(stream.asset);
    }
  };
}

function buildDatabentoTradePoints(rows) {
  return (rows ?? [])
    .map((row) => {
      const price = normalizeDatabentoNumber(row?.price);
      const timestamp = Date.parse(normalizeDatabentoTimestamp(row?.ts_event));
      const size = normalizeDatabentoNumber(row?.size) ?? normalizeDatabentoNumber(row?.quantity) ?? 0;
      if (!Number.isFinite(price) || !Number.isFinite(timestamp)) {
        return null;
      }
      return { price, timestampMs: timestamp, size: Number(size) || 0 };
    })
    .filter(Boolean);
}

function buildDatabentoQuotePoints(rows) {
  return (rows ?? [])
    .map((row) => {
      const bid = normalizeDatabentoNumber(row?.bid_px_00);
      const ask = normalizeDatabentoNumber(row?.ask_px_00);
      const timestamp = Date.parse(normalizeDatabentoTimestamp(row?.ts_event));
      if (!Number.isFinite(timestamp) || bid === null || ask === null || bid <= 0 || ask <= 0 || ask < bid) {
        return null;
      }
      return { price: (bid + ask) / 2, timestampMs: timestamp, size: 0 };
    })
    .filter(Boolean);
}

function latestPoint(points) {
  if (!Array.isArray(points) || !points.length) return null;
  return points.reduce((latest, point) => (!latest || point.timestampMs > latest.timestampMs ? point : latest), null);
}

async function buildDatabentoLiveChartSnapshot(asset, timeframe) {
  const normalizedAsset = normalizeActusLivePriceAsset(asset);
  const future = normalizedAsset ? getDatabentoFuture(normalizedAsset) : null;
  if (!normalizedAsset || !future) {
    throw new Error(`Unsupported Databento live chart asset: ${asset}`);
  }

  const end = databentoLiveSafeEndIso();
  const activeContract = await resolveActiveDatabentoFutureContract(normalizedAsset, { end });
  if (!activeContract?.rawSymbol) {
    throw new Error(`No active Databento contract resolved for ${asset}`);
  }
  const bucketStartMs = timeframeBucketStartMs(timeframe);
  const bucketStartIso = new Date(bucketStartMs).toISOString();
  const quoteStart = bucketStartIso;
  const tradeStart = bucketStartIso;
  const [quoteRowsResult, tradeRowsResult] = await Promise.all([
    databentoHistoricalWithAvailableEndRetry({
      dataset: "GLBX.MDP3",
      schema: "mbp-1",
      symbols: activeContract.rawSymbol,
      stype_in: "raw_symbol",
      start: quoteStart,
      end,
      encoding: "csv",
      limit: 5000,
    })
      .then((rows) => ({ rows, symbol: activeContract.rawSymbol, sourceType: activeContract.sourceType }))
      .catch(() => null),
    databentoHistoricalWithAvailableEndRetry({
      dataset: "GLBX.MDP3",
      schema: "trades",
      symbols: activeContract.rawSymbol,
      stype_in: "raw_symbol",
      start: tradeStart,
      end,
      encoding: "csv",
      limit: 5000,
    })
      .then((rows) => ({ rows, symbol: activeContract.rawSymbol, sourceType: activeContract.sourceType }))
      .catch(() => null),
  ]);

  const quotePoints = buildDatabentoQuotePoints(quoteRowsResult?.rows ?? []);
  const tradePoints = buildDatabentoTradePoints(tradeRowsResult?.rows ?? []);
  const latestQuote = latestPoint(quotePoints);
  const latestTrade = latestPoint(tradePoints);
  const preferredPoints =
    latestQuote && (!latestTrade || latestQuote.timestampMs >= latestTrade.timestampMs) ? quotePoints : tradePoints.length ? tradePoints : quotePoints;
  const preferredLatest =
    latestQuote && (!latestTrade || latestQuote.timestampMs >= latestTrade.timestampMs) ? latestQuote : latestTrade ?? latestQuote;
  const sourceType =
    latestQuote && (!latestTrade || latestQuote.timestampMs >= latestTrade.timestampMs)
      ? "quote-mid"
      : latestTrade
        ? "last-trade"
        : latestQuote
          ? "quote-mid"
          : null;
  const fallbackLivePrice = preferredLatest ? null : await buildDatabentoLivePrice(normalizedAsset).catch(() => null);

  return {
    asset: normalizedAsset,
    timeframe: normalizeTimeframe(timeframe),
    supportedAsset: true,
    livePrice: preferredLatest ? round(preferredLatest.price, future.priceScale) : fallbackLivePrice?.price ?? null,
    updatedAt: preferredLatest ? new Date(preferredLatest.timestampMs).toISOString() : fallbackLivePrice?.updatedAt ?? null,
    candleSourceSymbol: activeContract.rawSymbol,
    liveSymbol: activeContract.rawSymbol,
    candleSourceType: activeContract.sourceType,
    liveSourceType: activeContract.sourceType,
    source:
      sourceType === "quote-mid"
        ? "databento-cme-futures-quote"
        : sourceType === "last-trade"
          ? "databento-cme-futures-trade"
          : fallbackLivePrice?.source ?? "databento-cme-futures",
    sourceType: sourceType ?? fallbackLivePrice?.sourceType ?? null,
    candle: buildLiveCandleFromPoints(preferredPoints, {
      asset: normalizedAsset,
      symbol: future.symbol,
      timeframe: normalizeTimeframe(timeframe),
      precision: future.priceScale,
      bucketStartMs,
    }),
  };
}

async function buildDeribitLiveChartSnapshot(currency, timeframe) {
  const normalizedCurrency = typeof currency === "string" ? currency.toUpperCase() : "";
  if (normalizedCurrency !== "BTC" && normalizedCurrency !== "ETH") {
    throw new Error(`Unsupported Deribit live chart asset: ${currency}`);
  }

  const bucketStartMs = timeframeBucketStartMs(timeframe);
  const endMs = Date.now();
  const result = await deribitPublic("public/get_last_trades_by_instrument_and_time", {
    instrument_name: `${normalizedCurrency}-PERPETUAL`,
    start_timestamp: bucketStartMs,
    end_timestamp: endMs,
    count: 1000,
    sorting: "asc",
  }).catch(() => null);
  const trades = Array.isArray(result?.trades) ? result.trades : Array.isArray(result) ? result : [];
  const points = trades
    .map((trade) => {
      const price = Number(trade?.price ?? 0);
      const timestampMs = Number(trade?.timestamp ?? 0);
      const size = Number(trade?.amount ?? trade?.contracts ?? 0);
      if (!Number.isFinite(price) || price <= 0 || !Number.isFinite(timestampMs) || timestampMs <= 0) {
        return null;
      }
      return { price, timestampMs, size };
    })
    .filter(Boolean);
  const latest = latestPoint(points);
  const fallbackPrice = latest ? null : await buildDeribitLivePrice(normalizedCurrency).catch(() => null);

  return {
    asset: normalizedCurrency,
    timeframe: normalizeTimeframe(timeframe),
    supportedAsset: true,
    livePrice: latest ? round(latest.price, 2) : fallbackPrice?.price ?? null,
    updatedAt: latest ? new Date(latest.timestampMs).toISOString() : fallbackPrice?.updatedAt ?? null,
    source: latest ? `deribit-${normalizedCurrency.toLowerCase()}-perpetual-trade` : fallbackPrice?.source ?? null,
    sourceType: latest ? "last-trade" : fallbackPrice?.sourceType ?? null,
    candle: buildLiveCandleFromPoints(points, {
      asset: normalizedCurrency,
      symbol: `${normalizedCurrency}-PERPETUAL`,
      timeframe: normalizeTimeframe(timeframe),
      precision: 2,
      bucketStartMs,
    }),
  };
}

async function buildBinanceLiveChartSnapshot(symbol, timeframe) {
  const normalizedSymbol = typeof symbol === "string" ? symbol.toUpperCase() : "";
  if (normalizedSymbol !== "SOL") {
    throw new Error(`Unsupported Binance live chart asset: ${symbol}`);
  }

  const bucketStartMs = timeframeBucketStartMs(timeframe);
  const endMs = Date.now();
  const payload = await binancePublic("/api/v3/aggTrades", {
    symbol: "SOLUSDT",
    startTime: bucketStartMs,
    endTime: endMs,
    limit: 1000,
  }).catch(() => []);
  const trades = Array.isArray(payload) ? payload : [];
  const points = trades
    .map((trade) => {
      const price = Number(trade?.p ?? 0);
      const timestampMs = Number(trade?.T ?? 0);
      const size = Number(trade?.q ?? 0);
      if (!Number.isFinite(price) || price <= 0 || !Number.isFinite(timestampMs) || timestampMs <= 0) {
        return null;
      }
      return { price, timestampMs, size };
    })
    .filter(Boolean);
  const latest = latestPoint(points);
  const fallbackPrice = latest ? null : await buildBinanceLivePrice(normalizedSymbol).catch(() => null);

  return {
    asset: normalizedSymbol,
    timeframe: normalizeTimeframe(timeframe),
    supportedAsset: true,
    livePrice: latest ? round(latest.price, 2) : fallbackPrice?.price ?? null,
    updatedAt: latest ? new Date(latest.timestampMs).toISOString() : fallbackPrice?.updatedAt ?? null,
    source: latest ? "binance-solusdt-agg-trade" : fallbackPrice?.source ?? null,
    sourceType: latest ? "last-trade" : fallbackPrice?.sourceType ?? null,
    candle: buildLiveCandleFromPoints(points, {
      asset: normalizedSymbol,
      symbol: "SOLUSDT",
      timeframe: normalizeTimeframe(timeframe),
      precision: 2,
      bucketStartMs,
    }),
  };
}

async function buildActusLiveChartSnapshot(asset, timeframe) {
  const normalizedAsset = normalizeActusLivePriceAsset(asset);
  if (!normalizedAsset) {
    return {
      asset: typeof asset === "string" ? asset.toUpperCase() : "UNKNOWN",
      timeframe: normalizeTimeframe(timeframe),
      supportedAsset: false,
      livePrice: null,
      updatedAt: null,
      source: null,
      sourceType: null,
      candle: null,
    };
  }

  if (normalizedAsset === "ETH") {
    return buildDeribitLiveChartSnapshot(normalizedAsset, timeframe);
  }
  if (normalizedAsset === "SOL") {
    return buildBinanceLiveChartSnapshot(normalizedAsset, timeframe);
  }

  return buildDatabentoLiveChartSnapshot(normalizedAsset, timeframe);
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

function persistOptionChainCache() {
  try {
    const payload = Object.fromEntries(optionChainCache.entries());
    fs.writeFileSync(OPTION_CHAIN_CACHE_FILE, JSON.stringify(payload));
  } catch {
    // Persistence is best-effort only.
  }
}

function persistNyOpenFlowHistory() {
  try {
    const payload = Object.fromEntries(nyOpenFlowHistory.entries());
    fs.writeFileSync(NY_OPEN_FLOW_HISTORY_FILE, JSON.stringify(payload));
  } catch {
    // Persistence is best-effort only.
  }
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
  return bars
    .slice(-32)
    .map((bar) => {
      const close = readBarValue(bar, "c", "close");
      const open = readBarValue(bar, "o", "open");
      const value = close || open;
      return Number.isFinite(value) && value > 0 ? round(value, precision) : 0;
    });
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
  const previousCards = Array.isArray(cardsCache[timeframe]) ? cardsCache[timeframe] : [];
  const previousCardsBySymbol = new Map(previousCards.map((card) => [card.symbol, card]));
  const settled = await Promise.allSettled(
    ASSET_CONFIGS.map(async (config) => {
      const databentoAsset = BOARD_DATABENTO_MAP[config.symbol];
      const sourceHistoryAsset = normalizeActusSourceHistoryAsset(config.symbol);
      const bars = databentoAsset
        ? await fetchDatabentoFuturesHistory(databentoAsset, timeframeConfig.timeframe, {
            limit: timeframeConfig.timeframe === "1h" ? 240 : 720,
          })
        : sourceHistoryAsset
          ? (
              await fetchActusSourceHistory(sourceHistoryAsset, timeframeConfig.timeframe, {
                limit: timeframeConfig.timeframe === "1h" ? 240 : 720,
              })
            ).candles
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
    const cachedCard =
      assetCardCache.get(cacheKey) ??
      previousCardsBySymbol.get(config.symbol) ??
      null;
    if (cachedCard) {
      assetCardCache.set(cacheKey, cachedCard);
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

app.get("/api/actus/delta/signal", async (req, res) => {
  try {
    const asset = typeof req.query.asset === "string" ? req.query.asset.toUpperCase() : "NQ";
    const signal = await buildActusDeltaSignal(asset);

    res.json({
      ok: true,
      asset,
      signal,
    });
  } catch (error) {
    res.status(500).json({
      ok: false,
      asset: typeof req.query.asset === "string" ? req.query.asset.toUpperCase() : "UNKNOWN",
      signal: null,
      error: error instanceof Error ? error.message : "Delta signal failed",
    });
  }
});

app.get("/api/actus/ny-open-flow", async (req, res) => {
  try {
    const asset = typeof req.query.asset === "string" ? req.query.asset.toUpperCase() : "NQ";
    const flow = await buildNyOpenFlowBalance(asset);

    res.json({
      ok: true,
      asset: flow.asset,
      flow,
    });
  } catch (error) {
    res.status(500).json({
      ok: false,
      asset: typeof req.query.asset === "string" ? req.query.asset.toUpperCase() : "UNKNOWN",
      flow: null,
      error: error instanceof Error ? error.message : "NY open flow failed",
    });
  }
});

app.get("/api/actus/ny-open-flow/history", async (req, res) => {
  try {
    const asset = typeof req.query.asset === "string" ? normalizeNyOpenFlowAsset(req.query.asset) : null;
    const date = typeof req.query.date === "string" ? req.query.date : null;

    const snapshots = [...nyOpenFlowHistory.values()]
      .filter((entry) => (asset ? entry.asset === asset : true))
      .filter((entry) => (date ? entry.date === date : true))
      .sort((a, b) => {
        if (a.date === b.date) {
          return a.asset.localeCompare(b.asset);
        }
        return a.date < b.date ? 1 : -1;
      });

    res.json({
      ok: true,
      asset: asset ?? null,
      date,
      snapshots,
    });
  } catch (error) {
    res.status(500).json({
      ok: false,
      asset: typeof req.query.asset === "string" ? req.query.asset.toUpperCase() : null,
      date: typeof req.query.date === "string" ? req.query.date : null,
      snapshots: [],
      error: error instanceof Error ? error.message : "NY open flow history failed",
    });
  }
});

app.get("/api/actus/live-price", async (req, res) => {
  try {
    const asset = typeof req.query.asset === "string" ? req.query.asset.toUpperCase() : "NQ";
    const livePrice = await buildActusLivePrice(asset);

    res.json({
      ok: true,
      asset: livePrice.asset,
      livePrice,
    });
  } catch (error) {
    res.status(500).json({
      ok: false,
      asset: typeof req.query.asset === "string" ? req.query.asset.toUpperCase() : "UNKNOWN",
      livePrice: null,
      error: error instanceof Error ? error.message : "Live price failed",
    });
  }
});

app.get("/api/actus/live-chart", async (req, res) => {
  const asset = typeof req.query.asset === "string" ? req.query.asset.toUpperCase() : "NQ";
  const timeframe = normalizeTimeframe(req.query.timeframe);

  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");
  res.flushHeaders?.();

  writeSse(res, "ready", { ok: true, asset, timeframe });

  let closed = false;
  let unsubscribe = () => {};
  let heartbeat = null;
  let previousSignature = null;
  req.on("close", () => {
    closed = true;
    unsubscribe();
    if (heartbeat) {
      clearInterval(heartbeat);
      heartbeat = null;
    }
  });

  const emitSnapshot = async (options = {}) => {
    try {
      const preferFreshPull = options?.preferFreshPull === true;
      const stream = await ensureActusTickStream(asset);
      if (stream && !stream.liveCandles.has(timeframe)) {
        const seededSnapshot = await buildActusLiveChartSnapshot(asset, timeframe);
        seedActusTickStreamCandle(stream, timeframe, seededSnapshot.candle);
        if (!stream.updatedAt && seededSnapshot.updatedAt && Number.isFinite(seededSnapshot.livePrice)) {
          stream.price = seededSnapshot.livePrice;
          stream.updatedAt = seededSnapshot.updatedAt;
          stream.source = seededSnapshot.source;
          stream.sourceType = seededSnapshot.sourceType;
          stream.liveSymbol = seededSnapshot.liveSymbol ?? stream.liveSymbol ?? null;
          stream.liveSourceType = seededSnapshot.liveSourceType ?? stream.liveSourceType ?? null;
          stream.candleSourceSymbol = seededSnapshot.candleSourceSymbol ?? stream.candleSourceSymbol ?? null;
          stream.candleSourceType = seededSnapshot.candleSourceType ?? stream.candleSourceType ?? null;
        }
      }
      let snapshot =
        !preferFreshPull && stream && stream.updatedAt && Date.now() - Date.parse(stream.updatedAt) <= STREAM_STALE_MS
          ? buildActusStreamingSnapshot(asset, timeframe, stream)
          : await buildActusLiveChartSnapshot(asset, timeframe);
      if (
        preferFreshPull &&
        stream &&
        !snapshot?.candle &&
        Number.isFinite(snapshot?.livePrice)
      ) {
        const streamedSnapshot = buildActusStreamingSnapshot(asset, timeframe, stream);
        if (streamedSnapshot?.candle) {
          const livePrice = Number(snapshot.livePrice);
          snapshot = {
            ...snapshot,
            candle: {
              ...streamedSnapshot.candle,
              high: round(Math.max(streamedSnapshot.candle.high, livePrice), getDatabentoFuture(normalizeActusLivePriceAsset(asset))?.priceScale ?? 2),
              low: round(Math.min(streamedSnapshot.candle.low, livePrice), getDatabentoFuture(normalizeActusLivePriceAsset(asset))?.priceScale ?? 2),
              close: round(livePrice, getDatabentoFuture(normalizeActusLivePriceAsset(asset))?.priceScale ?? 2),
            },
          };
        }
      }
      const signature = JSON.stringify({
        price: snapshot.livePrice,
        updatedAt: snapshot.updatedAt,
        sourceType: snapshot.sourceType,
        candle: snapshot.candle
          ? {
              timestamp: snapshot.candle.timestamp,
              open: snapshot.candle.open,
              high: snapshot.candle.high,
              low: snapshot.candle.low,
              close: snapshot.candle.close,
              volume: snapshot.candle.volume,
            }
          : null,
      });

      if (signature !== previousSignature) {
        previousSignature = signature;
        if (asset === "NQ") {
          console.info("[ACTUS][R14][NQ][live-contract]", {
            candleSourceSymbol: snapshot.candleSourceSymbol ?? null,
            liveSourceSymbol: snapshot.liveSymbol ?? null,
            candleSourceType: snapshot.candleSourceType ?? null,
            liveSourceType: snapshot.liveSourceType ?? null,
            liveTimestamp: snapshot.updatedAt ?? null,
            livePrice: snapshot.livePrice ?? null,
          });
        }
        writeSse(res, "snapshot", { ok: true, asset, timeframe, snapshot });
      } else {
        writeSse(res, "heartbeat", { ts: new Date().toISOString(), asset, timeframe });
      }
    } catch (error) {
      writeSse(res, "error", {
        ok: false,
        error: error instanceof Error ? error.message : "ACTUS live chart update failed",
      });
    }
  };

  unsubscribe = await subscribeActusTickStream(asset, () => {
    if (closed) {
      return;
    }
    void emitSnapshot();
  });

  heartbeat = setInterval(() => {
    if (closed) {
      return;
    }
    void emitSnapshot({ preferFreshPull: Boolean(normalizeActusLivePriceAsset(asset)) });
  }, STREAM_HEARTBEAT_MS);

  void emitSnapshot();
});

app.get("/api/actus/source-history", async (req, res) => {
  try {
    const asset = typeof req.query.asset === "string" ? req.query.asset.toUpperCase() : "ETH";
    const timeframe = normalizeTimeframe(req.query.timeframe);
    const limit = typeof req.query.limit === "string" ? Number(req.query.limit) : undefined;
    const result = await fetchActusSourceHistory(asset, timeframe, { limit });

    res.json({
      ok: true,
      asset: result.asset,
      supportedAsset: result.supportedAsset,
      timeframe,
      source: result.source,
      candles: result.candles,
    });
  } catch (error) {
    res.status(500).json({
      ok: false,
      asset: typeof req.query.asset === "string" ? req.query.asset.toUpperCase() : "UNKNOWN",
      supportedAsset: false,
      timeframe: normalizeTimeframe(req.query.timeframe),
      source: null,
      candles: [],
      error: error instanceof Error ? error.message : "ACTUS source history failed",
    });
  }
});

app.get("/api/databento/futures/history", async (req, res) => {
  try {
    const asset = typeof req.query.asset === "string" ? req.query.asset.toUpperCase() : "NQ";
    const timeframe = normalizeDatabentoTimeframe(req.query.timeframe);
    const result = await fetchDatabentoFuturesHistory(asset, timeframe, {
      start: typeof req.query.start === "string" ? req.query.start : undefined,
      end: typeof req.query.end === "string" ? req.query.end : undefined,
      limit: typeof req.query.limit === "string" ? Number(req.query.limit) : undefined,
      includeMeta: true,
    });

    res.json({
      ok: true,
      asset,
      timeframe,
      resolvedSymbol: result.resolvedSymbol,
      sourceType: result.sourceType,
      candles: result.candles,
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
  const previous = new Map();

  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");
  res.flushHeaders?.();

  writeSse(res, "ready", { ok: true, assets, timeframe });

  let closed = false;
  const unsubscribers = [];
  let heartbeat = null;
  req.on("close", () => {
    closed = true;
    unsubscribers.forEach((unsubscribe) => unsubscribe());
    if (heartbeat) {
      clearInterval(heartbeat);
      heartbeat = null;
    }
  });

  const emitAssetSnapshot = async (asset) => {
    try {
      const stream = await ensureActusTickStream(asset);
      if (stream && !stream.liveCandles.has(timeframe)) {
        const seededSnapshot = await buildDatabentoLiveChartSnapshot(asset, timeframe);
        seedActusTickStreamCandle(stream, timeframe, seededSnapshot.candle);
        if (!stream.updatedAt && seededSnapshot.updatedAt && Number.isFinite(seededSnapshot.livePrice)) {
          stream.price = seededSnapshot.livePrice;
          stream.updatedAt = seededSnapshot.updatedAt;
          stream.source = seededSnapshot.source;
          stream.sourceType = seededSnapshot.sourceType;
          stream.liveSymbol = seededSnapshot.liveSymbol ?? stream.liveSymbol ?? null;
          stream.liveSourceType = seededSnapshot.liveSourceType ?? stream.liveSourceType ?? null;
          stream.candleSourceSymbol = seededSnapshot.candleSourceSymbol ?? stream.candleSourceSymbol ?? null;
          stream.candleSourceType = seededSnapshot.candleSourceType ?? stream.candleSourceType ?? null;
        }
      }
      const snapshot =
        stream && stream.updatedAt && Date.now() - Date.parse(stream.updatedAt) <= STREAM_STALE_MS
          ? buildActusStreamingSnapshot(asset, timeframe, stream)
          : await buildDatabentoLiveChartSnapshot(asset, timeframe);
      const key = `${asset}:${timeframe}`;
      const nextValue = JSON.stringify({
        candle: snapshot.candle,
        livePrice: snapshot.livePrice ?? null,
        liveTimestamp: snapshot.updatedAt ?? null,
        liveSymbol: snapshot.liveSymbol ?? null,
        liveSourceType: snapshot.liveSourceType ?? null,
      });

      if (previous.get(key) === nextValue) {
        return;
      }

      previous.set(key, nextValue);
      writeSse(res, "snapshot", [
        {
          asset,
          candle: snapshot.candle,
          livePrice: snapshot.livePrice ?? null,
          liveTimestamp: snapshot.updatedAt ?? null,
          liveSymbol: snapshot.liveSymbol ?? null,
          liveSourceType: snapshot.liveSourceType ?? null,
          candleSourceSymbol: snapshot.candleSourceSymbol ?? null,
          candleSourceType: snapshot.candleSourceType ?? null,
        },
      ]);
      if (snapshot.candle) {
        writeSse(res, "candles", [snapshot.candle]);
      }
    } catch (error) {
      writeSse(res, "error", {
        ok: false,
        error: error instanceof Error ? error.message : "Databento futures live update failed",
      });
    }
  };

  const resolvedAssets = await Promise.all(
    assets.map(async (asset) => {
      const unsubscribe = await subscribeActusTickStream(asset, () => {
        if (closed) {
          return;
        }
        void emitAssetSnapshot(asset);
      });
      unsubscribers.push(unsubscribe);
      return asset;
    }),
  );

  heartbeat = setInterval(() => {
    if (closed) {
      return;
    }
    writeSse(res, "heartbeat", { ts: new Date().toISOString(), assets, timeframe });
  }, STREAM_HEARTBEAT_MS);

  resolvedAssets.forEach((asset) => {
    void emitAssetSnapshot(asset);
  });
});

app.get("/api/databento/options/chain", async (req, res) => {
  try {
    const asset = typeof req.query.asset === "string" ? req.query.asset.toUpperCase() : "NQ";
    const forceRefresh = req.query.force === "true" || req.query.force === "1";
    const snapshot = await getOptionChainSnapshot(asset, { forceRefresh });
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
