import type { NormalizedOptionChainSnapshot } from "../../types/options";
import { fetchDatabentoOptionDefinitions } from "./definitions";
import type { DatabentoCoreAsset } from "./types";

type CmeOptionAsset = Extract<DatabentoCoreAsset, "NQ" | "GC" | "CL" | "6E">;

export const CME_OPTIONS_CONFIG: Record<CmeOptionAsset, { source: string }> = {
  NQ: { source: "nq-option-chain" },
  GC: { source: "gc-option-chain" },
  CL: { source: "cl-option-chain" },
  "6E": { source: "6e-option-chain" },
};

const optionChainCache = new Map<CmeOptionAsset, { cachedAt: number; snapshot: NormalizedOptionChainSnapshot }>();
const optionChainInFlight = new Map<CmeOptionAsset, Promise<NormalizedOptionChainSnapshot>>();
const OPTION_CHAIN_CACHE_TTL_MS = 30_000;

export async function fetchCmeOptionChain(asset: CmeOptionAsset): Promise<NormalizedOptionChainSnapshot> {
  const cached = optionChainCache.get(asset);
  if (cached && Date.now() - cached.cachedAt <= OPTION_CHAIN_CACHE_TTL_MS) {
    return cached.snapshot;
  }

  const existingRequest = optionChainInFlight.get(asset);
  if (existingRequest) {
    return existingRequest;
  }

  const request = fetchDatabentoOptionDefinitions(asset)
    .then((snapshot) => {
      optionChainCache.set(asset, { cachedAt: Date.now(), snapshot });
      return snapshot;
    })
    .finally(() => {
      optionChainInFlight.delete(asset);
    });

  optionChainInFlight.set(asset, request);
  return request;
}

export async function fetchNqOptionChain(): Promise<NormalizedOptionChainSnapshot> {
  return fetchCmeOptionChain("NQ");
}
