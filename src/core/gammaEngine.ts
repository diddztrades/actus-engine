import type { NormalizedOptionChainSnapshot, NormalizedOptionContract } from "../types/options";
import type { GammaContractQuality, GammaContractResult, GammaSnapshot, GammaStrikeExposure, GammaZone } from "../types/gamma";

const DEFAULT_RISK_FREE_RATE = 0.045;
const NQ_CONTRACT_MULTIPLIER = 20;
const DEFAULT_ESTIMATED_VOL = 0.22;

function round(value: number | null, digits = 6) {
  if (value === null || !Number.isFinite(value)) {
    return null;
  }

  return Number(value.toFixed(digits));
}

function erf(x: number) {
  const sign = x >= 0 ? 1 : -1;
  const ax = Math.abs(x);
  const a1 = 0.254829592;
  const a2 = -0.284496736;
  const a3 = 1.421413741;
  const a4 = -1.453152027;
  const a5 = 1.061405429;
  const p = 0.3275911;
  const t = 1 / (1 + p * ax);
  const y = 1 - (((((a5 * t + a4) * t + a3) * t + a2) * t + a1) * t * Math.exp(-ax * ax));
  return sign * y;
}

function normalCdf(x: number) {
  return 0.5 * (1 + erf(x / Math.sqrt(2)));
}

function normalPdf(x: number) {
  return Math.exp(-(x * x) / 2) / Math.sqrt(2 * Math.PI);
}

function black76Price(
  forward: number,
  strike: number,
  timeToExpiryYears: number,
  sigma: number,
  right: "C" | "P",
  riskFreeRate = DEFAULT_RISK_FREE_RATE,
) {
  if (forward <= 0 || strike <= 0 || timeToExpiryYears <= 0 || sigma <= 0) {
    return null;
  }

  const sigmaRootT = sigma * Math.sqrt(timeToExpiryYears);
  const d1 = (Math.log(forward / strike) + 0.5 * sigma * sigma * timeToExpiryYears) / sigmaRootT;
  const d2 = d1 - sigmaRootT;
  const discount = Math.exp(-riskFreeRate * timeToExpiryYears);

  if (right === "C") {
    return discount * (forward * normalCdf(d1) - strike * normalCdf(d2));
  }

  return discount * (strike * normalCdf(-d2) - forward * normalCdf(-d1));
}

function black76Gamma(
  forward: number,
  strike: number,
  timeToExpiryYears: number,
  sigma: number,
  riskFreeRate = DEFAULT_RISK_FREE_RATE,
) {
  if (forward <= 0 || strike <= 0 || timeToExpiryYears <= 0 || sigma <= 0) {
    return null;
  }

  const sigmaRootT = sigma * Math.sqrt(timeToExpiryYears);
  const d1 = (Math.log(forward / strike) + 0.5 * sigma * sigma * timeToExpiryYears) / sigmaRootT;
  return Math.exp(-riskFreeRate * timeToExpiryYears) * normalPdf(d1) / (forward * sigmaRootT);
}

function intrinsicValue(forward: number, strike: number, right: "C" | "P", riskFreeRate = DEFAULT_RISK_FREE_RATE, t = 0) {
  const payoff = right === "C" ? Math.max(forward - strike, 0) : Math.max(strike - forward, 0);
  return Math.exp(-riskFreeRate * t) * payoff;
}

function solveImpliedVolatility(args: {
  marketPrice: number;
  forward: number;
  strike: number;
  timeToExpiryYears: number;
  right: "C" | "P";
  riskFreeRate?: number;
}) {
  const { marketPrice, forward, strike, timeToExpiryYears, right, riskFreeRate = DEFAULT_RISK_FREE_RATE } = args;
  if (marketPrice <= 0 || forward <= 0 || strike <= 0 || timeToExpiryYears <= 0) {
    return null;
  }

  const intrinsic = intrinsicValue(forward, strike, right, riskFreeRate, timeToExpiryYears);
  if (marketPrice < intrinsic - 1e-6) {
    return null;
  }

  let low = 0.0001;
  let high = 5;
  let best: number | null = null;

  for (let i = 0; i < 100; i += 1) {
    const mid = (low + high) / 2;
    const price = black76Price(forward, strike, timeToExpiryYears, mid, right, riskFreeRate);
    if (price === null) {
      return null;
    }

    best = mid;
    const diff = price - marketPrice;
    if (Math.abs(diff) < 1e-6) {
      return mid;
    }

    if (diff > 0) {
      high = mid;
    } else {
      low = mid;
    }
  }

  return best;
}

function chooseMarketPrice(contract: NormalizedOptionContract) {
  return contract.mid ?? contract.last ?? null;
}

function chooseInterestWeight(contract: NormalizedOptionContract) {
  if (contract.openInterest && contract.openInterest > 0) {
    return contract.openInterest;
  }
  if (contract.volume && contract.volume > 0) {
    return contract.volume;
  }
  return null;
}

function estimateInterestWeight(contract: NormalizedOptionContract) {
  return chooseInterestWeight(contract) ?? 1;
}

function deriveContractResult(
  underlyingPrice: number,
  contract: NormalizedOptionContract,
): GammaContractResult {
  const marketPrice = chooseMarketPrice(contract);
  const timeToExpiryYears = contract.timeToExpiryYears ?? null;
  const strike = contract.strike;

  if (!timeToExpiryYears || timeToExpiryYears <= 0 || !Number.isFinite(strike) || strike <= 0) {
    return {
      optionSymbol: contract.optionSymbol,
      strike,
      right: contract.right,
      quality: "unusable",
      sigmaUsed: null,
      marketPriceUsed: marketPrice,
      interestWeightUsed: null,
      gamma: null,
      exposure: null,
    };
  }

  const solvedSigma =
    marketPrice !== null
      ? solveImpliedVolatility({
          marketPrice,
          forward: underlyingPrice,
          strike,
          timeToExpiryYears,
          right: contract.right,
        })
      : null;

  const sigmaUsed = solvedSigma ?? DEFAULT_ESTIMATED_VOL;
  const quality: GammaContractQuality = solvedSigma !== null ? "true" : "estimated";
  const gamma = black76Gamma(underlyingPrice, strike, timeToExpiryYears, sigmaUsed);
  const interestWeight = solvedSigma !== null ? chooseInterestWeight(contract) : estimateInterestWeight(contract);

  if (gamma === null || interestWeight === null) {
    return {
      optionSymbol: contract.optionSymbol,
      strike,
      right: contract.right,
      quality: "unusable",
      sigmaUsed: solvedSigma,
      marketPriceUsed: marketPrice,
      interestWeightUsed: null,
      gamma: null,
      exposure: null,
    };
  }

  const exposure = gamma * interestWeight * NQ_CONTRACT_MULTIPLIER;

  return {
    optionSymbol: contract.optionSymbol,
    strike,
    right: contract.right,
    quality,
    sigmaUsed: round(sigmaUsed, 6),
    marketPriceUsed: marketPrice,
    interestWeightUsed: round(interestWeight, 4),
    gamma: round(gamma, 10),
    exposure: round(exposure, 10),
  };
}

function summarizeStrikeExposures(contractResults: GammaContractResult[]) {
  const byStrike = new Map<number, GammaStrikeExposure & { qualitySet: Set<GammaContractQuality> }>();

  contractResults.forEach((contract) => {
    if (contract.gamma === null || contract.exposure === null) {
      return;
    }

    const existing = byStrike.get(contract.strike) ?? {
      strike: contract.strike,
      totalCallGamma: 0,
      totalPutGamma: 0,
      netGamma: 0,
      totalCallExposure: 0,
      totalPutExposure: 0,
      netExposure: 0,
      quality: "estimated" as const,
      qualitySet: new Set<GammaContractQuality>(),
    };

    if (contract.right === "C") {
      existing.totalCallGamma += contract.gamma;
      existing.totalCallExposure += contract.exposure;
    } else {
      existing.totalPutGamma += contract.gamma;
      existing.totalPutExposure += contract.exposure;
    }

    existing.netGamma = existing.totalCallGamma - existing.totalPutGamma;
    existing.netExposure = existing.totalCallExposure - existing.totalPutExposure;
    existing.qualitySet.add(contract.quality);
    byStrike.set(contract.strike, existing);
  });

  return [...byStrike.values()]
    .map((strike) => ({
      strike: strike.strike,
      totalCallGamma: round(strike.totalCallGamma, 10) ?? 0,
      totalPutGamma: round(strike.totalPutGamma, 10) ?? 0,
      netGamma: round(strike.netGamma, 10) ?? 0,
      totalCallExposure: round(strike.totalCallExposure, 10) ?? 0,
      totalPutExposure: round(strike.totalPutExposure, 10) ?? 0,
      netExposure: round(strike.netExposure, 10) ?? 0,
      quality:
        strike.qualitySet.has("true") && strike.qualitySet.has("estimated")
          ? ("mixed" as const)
          : strike.qualitySet.has("true")
            ? ("true" as const)
            : ("estimated" as const),
    }))
    .sort((a, b) => a.strike - b.strike);
}

function buildZones(underlyingPrice: number, strikes: GammaStrikeExposure[], side: "above" | "below"): GammaZone[] {
  return strikes
    .filter((strike) => (side === "above" ? strike.strike > underlyingPrice : strike.strike < underlyingPrice))
    .sort((a, b) => Math.abs(b.netExposure) - Math.abs(a.netExposure))
    .slice(0, 3)
    .map((strike) => ({
      strike: strike.strike,
      score: round(Math.abs(strike.netExposure), 6) ?? 0,
    }));
}

function findFlip(strikes: GammaStrikeExposure[]) {
  for (let index = 1; index < strikes.length; index += 1) {
    const previous = strikes[index - 1];
    const current = strikes[index];
    if (previous.netExposure === 0 || current.netExposure === 0) {
      continue;
    }
    if ((previous.netExposure < 0 && current.netExposure > 0) || (previous.netExposure > 0 && current.netExposure < 0)) {
      return current.strike;
    }
  }
  return null;
}

function deriveConfidence(contractResults: GammaContractResult[]) {
  const usable = contractResults.filter((contract) => contract.quality !== "unusable");
  const trueCount = usable.filter((contract) => contract.quality === "true").length;
  const estimatedCount = usable.filter((contract) => contract.quality === "estimated").length;

  if (!usable.length) return "low" as const;
  if (trueCount >= estimatedCount && trueCount >= 6) return "high" as const;
  if (trueCount > 0) return "medium" as const;
  return "low" as const;
}

export function buildNqGammaSnapshot(optionChain: NormalizedOptionChainSnapshot): GammaSnapshot {
  const contractResults = optionChain.contracts.map((contract) =>
    deriveContractResult(optionChain.underlyingPrice, contract),
  );
  const strikeExposures = summarizeStrikeExposures(contractResults);
  const positive = strikeExposures.slice().sort((a, b) => b.netExposure - a.netExposure)[0] ?? null;
  const negative = strikeExposures.slice().sort((a, b) => a.netExposure - b.netExposure)[0] ?? null;
  const callWall = strikeExposures
    .filter((strike) => strike.strike >= optionChain.underlyingPrice)
    .sort((a, b) => b.totalCallExposure - a.totalCallExposure)[0] ?? null;
  const putWall = strikeExposures
    .filter((strike) => strike.strike <= optionChain.underlyingPrice)
    .sort((a, b) => b.totalPutExposure - a.totalPutExposure)[0] ?? null;

  return {
    underlyingAsset: optionChain.underlyingAsset,
    underlyingPrice: optionChain.underlyingPrice,
    nearestCallWall: callWall?.strike ?? null,
    nearestPutWall: putWall?.strike ?? null,
    gammaFlip: findFlip(strikeExposures),
    strongestPositiveGammaStrike: positive?.strike ?? null,
    strongestNegativeGammaStrike: negative?.strike ?? null,
    zonesAbove: buildZones(optionChain.underlyingPrice, strikeExposures, "above"),
    zonesBelow: buildZones(optionChain.underlyingPrice, strikeExposures, "below"),
    confidence: deriveConfidence(contractResults),
    strikeExposures,
    contractResults,
  };
}
