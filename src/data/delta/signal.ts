import { databentoJson } from "../databento/client";
import type { DeltaSignal } from "../../types/delta";

type DeltaSignalApiResponse = {
  ok: boolean;
  asset: string;
  signal: DeltaSignal | null;
  error?: string;
};

export async function fetchActusDeltaSignal(asset: string): Promise<DeltaSignal | null> {
  const payload = await databentoJson<DeltaSignalApiResponse>("/api/actus/delta/signal", {
    asset,
  });

  return payload.signal ?? null;
}
