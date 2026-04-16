import { ENV } from "../../config/env";

const API_BASE = (ENV.API_URL || "http://localhost:3001").replace(/\/$/, "");

export type NyOpenFlowAsset = "NQ" | "CL" | "GC" | "6E" | "BTC";

export type NyOpenFlowSnapshot = {
  asset: NyOpenFlowAsset;
  supportedAsset: boolean;
  ready: boolean;
  sessionDate: string | null;
  sessionStart: string | null;
  sessionEnd: string | null;
  buyVolume: number | null;
  sellVolume: number | null;
  netVolume: number | null;
  balancePct: number | null;
  label: "Buyer-led" | "Seller-led" | "Balanced" | null;
  source: string | null;
  liveSymbol: string | null;
  liveSourceType: string | null;
  updatedAt: string | null;
};

export type NyOpenFlowHistorySnapshot = {
  date: string;
  asset: NyOpenFlowAsset;
  buyVolume: number;
  sellVolume: number;
  netVolume: number;
  balancePct: number;
  label: "Buyer-led" | "Seller-led" | "Balanced";
};

export async function fetchNyOpenFlowSnapshot(asset: NyOpenFlowAsset): Promise<NyOpenFlowSnapshot | null> {
  const url = new URL(`${API_BASE}/api/actus/ny-open-flow`);
  url.searchParams.set("asset", asset);

  const response = await fetch(url.toString(), {
    headers: { Accept: "application/json" },
  });
  const payload = await response.json().catch(() => null);

  if (!response.ok || !payload?.ok || !payload?.flow) {
    throw new Error(payload?.error ?? `NY open flow request failed with ${response.status}`);
  }

  return payload.flow as NyOpenFlowSnapshot;
}

export async function fetchNyOpenFlowHistory(asset: NyOpenFlowAsset): Promise<NyOpenFlowHistorySnapshot[]> {
  const url = new URL(`${API_BASE}/api/actus/ny-open-flow/history`);
  url.searchParams.set("asset", asset);

  const response = await fetch(url.toString(), {
    headers: { Accept: "application/json" },
  });
  const payload = await response.json().catch(() => null);

  if (!response.ok || !payload?.ok || !Array.isArray(payload?.snapshots)) {
    throw new Error(payload?.error ?? `NY open flow history request failed with ${response.status}`);
  }

  return payload.snapshots as NyOpenFlowHistorySnapshot[];
}
