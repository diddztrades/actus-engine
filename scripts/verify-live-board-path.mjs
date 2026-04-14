import { buildLiveBoardInputs } from "../src/application/actus/buildLiveBoardInputs.ts";
import { buildActusPlatformSnapshot } from "../src/application/actus/buildActusPlatform.ts";

const timeframe = "5m";
const response = await fetch(`http://localhost:3002/api/actus/cards?timeframe=${timeframe}`);

if (!response.ok) {
  throw new Error(`Live board verification failed: ${response.status}`);
}

const payload = await response.json();
const fusedInputs = await buildLiveBoardInputs(payload.cards, timeframe);
const snapshot = buildActusPlatformSnapshot({
  inputs: fusedInputs,
  status: {
    mode: "live",
    source: "remote",
    health: payload.cards.length ? "healthy" : "empty",
    lastUpdatedLabel: "ready",
    lastUpdatedAt: Date.now(),
    message: "Verification snapshot",
  },
});

console.log(
  JSON.stringify(
    {
      backendCards: payload.cards.map((card) => ({
        symbol: card.symbol,
        backendAction: card.action,
        backendCurrentState: card.currentState,
        stateConfidence: card.stateConfidence,
        freshnessScore: card.freshnessScore,
        tooLateFlag: card.tooLateFlag,
        topReasons: card.reasons?.slice(0, 3) ?? [],
        debug: card.stateDebug ?? null,
      })),
      fusedBoard: snapshot.opportunities.map((item) => ({
        symbol: item.symbol,
        action: item.action,
        state: item.state,
        confidenceScore: item.confidenceScore,
        freshnessScore: item.freshnessScore ?? null,
        tooLateFlag: item.tooLateFlag ?? false,
        whyItMatters: item.whyItMatters.slice(0, 4),
        warnings: item.warnings ?? [],
        sessionContext: item.sessionContext ?? null,
        positioningContext: item.positioningContext ?? null,
        debugState: item.debugState ?? null,
      })),
    },
    null,
    2,
  ),
);
