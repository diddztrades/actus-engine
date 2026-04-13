import { buildNqGammaSnapshot } from "../src/core/gammaEngine.ts";

const response = await fetch("http://localhost:3002/api/databento/options/chain?asset=NQ");

if (!response.ok) {
  throw new Error(`Gamma verification failed: ${response.status}`);
}

const payload = await response.json();
const gamma = buildNqGammaSnapshot(payload.snapshot);

console.log(
  JSON.stringify(
    {
      underlyingAsset: gamma.underlyingAsset,
      underlyingPrice: gamma.underlyingPrice,
      nearestCallWall: gamma.nearestCallWall,
      nearestPutWall: gamma.nearestPutWall,
      gammaFlip: gamma.gammaFlip,
      strongestPositiveGammaStrike: gamma.strongestPositiveGammaStrike,
      strongestNegativeGammaStrike: gamma.strongestNegativeGammaStrike,
      zonesAbove: gamma.zonesAbove,
      zonesBelow: gamma.zonesBelow,
      confidence: gamma.confidence,
      contractQualitySummary: {
        true: gamma.contractResults.filter((item) => item.quality === "true").length,
        estimated: gamma.contractResults.filter((item) => item.quality === "estimated").length,
        unusable: gamma.contractResults.filter((item) => item.quality === "unusable").length,
      },
      sampleStrikes: gamma.strikeExposures.slice(0, 5),
    },
    null,
    2,
  ),
);
