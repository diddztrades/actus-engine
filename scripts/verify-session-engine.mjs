import { buildSessionSnapshot } from "../src/core/sessionEngine.ts";

const response = await fetch("http://localhost:3002/api/databento/futures/history?asset=NQ&timeframe=1m&limit=600");

if (!response.ok) {
  throw new Error(`Session verification failed: ${response.status}`);
}

const payload = await response.json();
const snapshot = buildSessionSnapshot(payload.candles);

console.log(JSON.stringify(snapshot, null, 2));
