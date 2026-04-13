import { ENV } from "../../config/env";

const API_BASE = (ENV.API_URL || "http://localhost:3001").replace(/\/$/, "");

export function databentoUrl(path: string, params?: Record<string, string | number | undefined>) {
  const url = new URL(`${API_BASE}${path}`);

  Object.entries(params ?? {}).forEach(([key, value]) => {
    if (value !== undefined && value !== null && value !== "") {
      url.searchParams.set(key, String(value));
    }
  });

  return url.toString();
}

export async function databentoJson<T>(path: string, params?: Record<string, string | number | undefined>): Promise<T> {
  const response = await fetch(databentoUrl(path, params));
  if (!response.ok) {
    throw new Error(`Databento request failed: ${response.status}`);
  }
  return (await response.json()) as T;
}
