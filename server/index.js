import cors from "cors";
import dotenv from "dotenv";
import express from "express";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: resolve(__dirname, "..", ".env") });

const app = express();
app.use(cors());
app.use(express.json());

const PORT = Number(process.env.PORT || 3001);
const MASSIVE_API_KEY = process.env.MASSIVE_API_KEY || "";
const MASSIVE_API_URL = process.env.MASSIVE_API_URL || "https://api.massive.com";

async function safeJson(url) {
  try {
    const res = await fetch(url, { headers: { Accept: "application/json" } });
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  }
}

async function getMassivePrevious(symbol) {
  if (!MASSIVE_API_KEY) return null;

  const url =
    `${MASSIVE_API_URL}/v2/aggs/ticker/${encodeURIComponent(symbol)}/prev` +
    `?adjusted=true&apiKey=${encodeURIComponent(MASSIVE_API_KEY)}`;

  const json = await safeJson(url);
  const result = Array.isArray(json?.results) ? json.results[0] : null;
  if (!result?.c) return null;

  return {
    price: Number(result.c),
    source: "massive",
  };
}

app.get("/api/health", (_req, res) => {
  res.json({
    ok: true,
    source: "actus-massive-api",
    massiveConfigured: Boolean(MASSIVE_API_KEY),
    updatedAt: new Date().toISOString(),
  });
});

app.get("/api/market", async (_req, res) => {
  const [btc, eth, sol, eurusd, gld, qqq, uso] = await Promise.all([
    getMassivePrevious("X:BTCUSD"),
    getMassivePrevious("X:ETHUSD"),
    getMassivePrevious("X:SOLUSD"),
    getMassivePrevious("C:EURUSD"),
    getMassivePrevious("GLD"),
    getMassivePrevious("QQQ"),
    getMassivePrevious("USO"),
  ]);

  res.json({
    updatedAt: new Date().toISOString(),
    quotes: {
      BTCUSD: btc,
      ETHUSD: eth,
      SOLUSD: sol,
      EURUSD: eurusd,
      XAUUSD: gld,
      NQ: qqq,
      CL: uso,
    },
  });
});

app.listen(PORT, () => {
  console.log(`ACTUS Massive API running on http://localhost:${PORT}`);
});
