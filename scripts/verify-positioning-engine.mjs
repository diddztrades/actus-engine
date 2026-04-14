import { buildNqGammaSnapshot } from "../src/core/gammaEngine.ts";
import { buildNqPositioningSnapshot } from "../src/core/positioningEngine.ts";

const response = await fetch("http://localhost:3002/api/databento/options/chain?asset=NQ");

if (!response.ok) {
  throw new Error(`Positioning verification failed: ${response.status}`);
}

const payload = await response.json();
const gamma = buildNqGammaSnapshot(payload.snapshot);
const positioning = buildNqPositioningSnapshot(gamma);

console.log(
  JSON.stringify(
    {
      gammaConfidence: gamma.confidence,
      contractQualitySummary: {
        true: gamma.contractResults.filter((item) => item.quality === "true").length,
        estimated: gamma.contractResults.filter((item) => item.quality === "estimated").length,
        unusable: gamma.contractResults.filter((item) => item.quality === "unusable").length,
      },
      positioning,
    },
    null,
    2,
  ),
);
