import type { NormalizedOptionChainSnapshot } from "../../types/options";
import { fetchDatabentoOptionDefinitions } from "./definitions";
import type { DatabentoCoreAsset } from "./types";

export const CME_OPTIONS_CONFIG: Record<DatabentoCoreAsset, { source: string }> = {
  NQ: { source: "nq-option-chain" },
  GC: { source: "gc-option-chain" },
  CL: { source: "cl-option-chain" },
};

export async function fetchCmeOptionChain(asset: DatabentoCoreAsset): Promise<NormalizedOptionChainSnapshot> {
  return fetchDatabentoOptionDefinitions(asset);
}

export async function fetchNqOptionChain(): Promise<NormalizedOptionChainSnapshot> {
  return fetchCmeOptionChain("NQ");
}
