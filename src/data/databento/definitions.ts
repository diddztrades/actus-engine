import { databentoJson } from "./client";
import type { NormalizedOptionChainSnapshot } from "../../types/options";
import type { DatabentoCoreAsset } from "./types";

export async function fetchDatabentoOptionDefinitions(asset: DatabentoCoreAsset = "NQ") {
  const payload = await databentoJson<{ ok: boolean; snapshot: NormalizedOptionChainSnapshot }>(
    "/api/databento/options/chain",
    { asset },
  );

  return payload.snapshot;
}
