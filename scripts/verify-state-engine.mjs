import stateEngine from "../backend/stateEngine.cjs";

const { applyStateEngine, finalizeStateBoard } = stateEngine;

const timeframe = "5m";
const now = Date.parse("2026-04-10T10:00:00.000Z");

function createCard(overrides = {}) {
  return {
    name: "Nasdaq",
    symbol: "NQ",
    timeframe,
    price: 25290,
    changePercent: 0.84,
    bias: "LONG",
    status: "WAITING",
    action: "WAIT",
    quality: "B",
    entry: 25276,
    support: 25235,
    rsi: 59,
    momentum: 0.36,
    priceLevel: 25290,
    greenLine: 25282,
    redLine: 25248,
    sparkline: [25220, 25234, 25248, 25266, 25290],
    latestBar: {
      open: 25242,
      high: 25296,
      low: 25230,
      close: 25290,
    },
    ...overrides,
  };
}

function snapshot(card) {
  return {
    symbol: card.symbol,
    action: card.action,
    currentState: card.currentState,
    stateConfidence: card.stateConfidence,
    stateAge: card.stateAge,
    freshnessScore: card.freshnessScore,
    decayWarning: card.decayWarning,
    invalidationWarning: card.invalidationWarning,
    tooLateFlag: card.tooLateFlag,
    reasons: card.reasons,
  };
}

const progressionTracker = new Map();
const watchingStart = applyStateEngine(
  [
    createCard({
      price: 25283,
      priceLevel: 25283,
      entry: 25034,
      support: 24982,
      greenLine: 25280,
      redLine: 25246,
      changePercent: 0.44,
      momentum: 0.21,
      rsi: 56,
      latestBar: { open: 25252, high: 25286, low: 25240, close: 25283 },
    }),
  ],
  timeframe,
  progressionTracker,
  now,
)[0];

const executeProgression = applyStateEngine(
  [
    createCard({
      price: 25292,
      priceLevel: 25292,
      greenLine: 25284,
      changePercent: 0.88,
      momentum: 0.44,
      rsi: 58,
      latestBar: { open: 25260, high: 25296, low: 25254, close: 25292 },
    }),
  ],
  timeframe,
  progressionTracker,
  now + 6 * 60 * 1000,
)[0];

const staleExecuteTracker = new Map([
  [`${timeframe}:NQ`, { currentState: "Execute", startedAt: now - 26 * 60 * 1000 }],
]);
const staleExecute = applyStateEngine([createCard()], timeframe, staleExecuteTracker, now)[0];

const staleBuildingTracker = new Map([
  [`${timeframe}:GC`, { currentState: "Building", startedAt: now - 32 * 60 * 1000 }],
]);
const staleBuilding = applyStateEngine(
  [
    createCard({
      name: "Gold",
      symbol: "GC",
      price: 2374.1,
      priceLevel: 2374.1,
      entry: 2350.5,
      support: 2341.8,
      greenLine: 2371.9,
      redLine: 2368.1,
      changePercent: 0.41,
      momentum: 0.19,
      rsi: 55,
      latestBar: { open: 2369.2, high: 2375.1, low: 2367.4, close: 2374.1 },
    }),
  ],
  timeframe,
  staleBuildingTracker,
  now,
)[0];

const tooLate = applyStateEngine(
  [
    createCard({
      symbol: "CL",
      name: "Crude Oil",
      price: 85.44,
      priceLevel: 85.44,
      entry: 84.48,
      support: 83.92,
      greenLine: 84.2,
      redLine: 83.74,
      changePercent: 1.62,
      momentum: 0.41,
      rsi: 74,
      latestBar: { open: 84.12, high: 85.52, low: 84.05, close: 85.44 },
    }),
  ],
  timeframe,
  new Map(),
  now,
)[0];

const invalidated = applyStateEngine(
  [
    createCard({
      symbol: "EUR/USD",
      name: "EUR/USD",
      bias: "SHORT",
      price: 1.0898,
      priceLevel: 1.0898,
      entry: 1.0841,
      support: 1.0822,
      greenLine: 1.0871,
      redLine: 1.0838,
      changePercent: 0.21,
      momentum: 0.18,
      rsi: 48,
      latestBar: { open: 1.0851, high: 1.0902, low: 1.0848, close: 1.0898 },
    }),
  ],
  timeframe,
  new Map(),
  now,
)[0];

const executeCapBoard = finalizeStateBoard(
  applyStateEngine(
    [
      createCard({ symbol: "NQ", changePercent: 0.92, momentum: 0.43, price: 25294, priceLevel: 25294, greenLine: 25283 }),
      createCard({ symbol: "GC", name: "Gold", price: 2375.2, priceLevel: 2375.2, entry: 2370.6, support: 2364.2, greenLine: 2372.4, redLine: 2367.6, changePercent: 0.88, momentum: 0.41, rsi: 58, latestBar: { open: 2368.1, high: 2376.4, low: 2366.3, close: 2375.2 } }),
      createCard({ symbol: "CL", name: "Crude Oil", price: 84.72, priceLevel: 84.72, entry: 84.16, support: 83.58, greenLine: 84.5, redLine: 83.92, changePercent: 1.08, momentum: 0.46, rsi: 57, latestBar: { open: 84.01, high: 84.78, low: 83.92, close: 84.72 } }),
    ],
    timeframe,
    new Map(),
    now,
  ),
  timeframe,
);

console.log(
  JSON.stringify(
    {
      progression: {
        watchingStart: snapshot(watchingStart),
        executeProgression: snapshot(executeProgression),
      },
      staleDecay: {
        staleExecute: snapshot(staleExecute),
        staleBuilding: snapshot(staleBuilding),
      },
      penalties: {
        tooLate: snapshot(tooLate),
        invalidated: snapshot(invalidated),
      },
      executeCapBoard: executeCapBoard.map(snapshot),
    },
    null,
    2,
  ),
);
