import { useEffect, useMemo, useState } from "react";
import type { Asset } from "../types/asset";
import type { AlertItem } from "../types/alert";
import {
  buildWhatMattersNow,
  generateAlerts,
  getTopOpportunities,
} from "../lib/assets";

type DriftMap = Record<string, number>;

type LiveAlert = AlertItem & {
  id: string;
  age: number;
};

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

function randomBetween(min: number, max: number) {
  return min + Math.random() * (max - min);
}

function startingDrift(asset: Asset) {
  let base = 0;

  if (asset.bias === "Bullish") base += 0.65;
  if (asset.bias === "Bearish") base -= 0.45;

  if (asset.regime === "Trend Continuation") base += 0.45;
  if (asset.regime === "Expansion") base += 0.3;
  if (asset.regime === "Compression") base -= 0.2;
  if (asset.regime === "Mean Reversion") base -= 0.15;

  return clamp(base, -1.2, 1.2);
}

function nextDrift(asset: Asset, current: number) {
  let drift = current * 0.82;

  if (asset.bias === "Bullish") drift += 0.12;
  if (asset.bias === "Bearish") drift -= 0.1;

  if (asset.regime === "Trend Continuation") drift += 0.1;
  if (asset.regime === "Expansion") drift += 0.06;
  if (asset.regime === "Compression") drift -= 0.08;
  if (asset.regime === "Mean Reversion") drift -= 0.04;

  drift += randomBetween(-0.18, 0.18);

  return clamp(drift, -1.4, 1.4);
}

function nextSetup(asset: Asset, drift: number) {
  let value = asset.setup;

  value += drift * 3.4;

  if (asset.regime === "Trend Continuation") value += 0.8;
  if (asset.regime === "Expansion") value += 0.4;
  if (asset.regime === "Compression") value -= 0.8;
  if (asset.regime === "Mean Reversion") value -= 0.4;

  value += randomBetween(-1.5, 1.5);

  return clamp(Math.round(value), 45, 96);
}

function nextSpeed(asset: Asset, drift: number) {
  let value = asset.speed;

  value += Math.abs(drift) * 4.2;

  if (asset.regime === "Expansion") value += 1.6;
  if (asset.regime === "Trend Continuation") value += 0.8;
  if (asset.regime === "Compression") value -= 2.2;
  if (asset.regime === "Mean Reversion") value -= 0.8;

  value += randomBetween(-2.2, 2.2);

  return clamp(Math.round(value), 35, 97);
}

function nextRegime(asset: Asset, speed: number, setup: number): Asset["regime"] {
  if (speed >= 84 && setup >= 84) return "Expansion";
  if (setup >= 80 && asset.bias === "Bullish") return "Trend Continuation";
  if (speed <= 52 && setup <= 68) return "Compression";
  if (asset.location.toLowerCase().includes("extended")) return "Mean Reversion";
  return asset.regime;
}

function nextBias(asset: Asset, speed: number, setup: number): Asset["bias"] {
  if (setup >= 82 && speed >= 72) return "Bullish";
  if (setup <= 62 && asset.regime === "Mean Reversion") return "Bearish";
  return asset.bias;
}

function nextLocation(asset: Asset, speed: number): string {
  const current = asset.location.toLowerCase();

  if (speed >= 86 && !current.includes("breaking")) {
    return "Breaking weekly resistance";
  }

  if (speed <= 50 && current.includes("breaking")) {
    return "Holding London reclaim";
  }

  return asset.location;
}

function nextPosture(asset: Asset, speed: number, setup: number): string {
  if (speed >= 84 && setup >= 84) return "Buy pullbacks only";
  if (setup <= 68) return "Wait for hold or sweep reclaim";
  if (asset.regime === "Mean Reversion") return "Avoid chasing highs";
  return asset.posture;
}

function getDirection(prev: Asset, nextSpeed: number, nextSetup: number): "up" | "down" | "flat" {
  const scoreBefore = prev.speed + prev.setup;
  const scoreAfter = nextSpeed + nextSetup;
  const delta = scoreAfter - scoreBefore;

  if (delta >= 4) return "up";
  if (delta <= -4) return "down";
  return "flat";
}

function simulateAsset(asset: Asset, drift: number): Asset {
  const speed = nextSpeed(asset, drift);
  const setup = nextSetup(asset, drift);
  const bias = nextBias(asset, speed, setup);
  const regime = nextRegime({ ...asset, bias }, speed, setup);
  const location = nextLocation(asset, speed);
  const posture = nextPosture(asset, speed, setup);
  const direction = getDirection(asset, speed, setup);

  return {
    ...asset,
    speed,
    setup,
    bias,
    regime,
    location,
    posture,
    direction,
  };
}

function toLiveId(alert: AlertItem) {
  return `${alert.asset}-${alert.title}`;
}

function mergeAlerts(existing: LiveAlert[], incoming: AlertItem[]) {
  const aged = existing
    .map((alert) => ({ ...alert, age: alert.age + 1 }))
    .filter((alert) => alert.age <= 4);

  const byId = new Map<string, LiveAlert>(aged.map((alert) => [alert.id, alert]));

  for (const alert of incoming) {
    const id = toLiveId(alert);
    byId.set(id, {
      ...alert,
      id,
      age: 0,
    });
  }

  return [...byId.values()].sort((a, b) => {
    const severityScore = (value: string) =>
      value === "high" ? 3 : value === "medium" ? 2 : 1;

    if (severityScore(b.severity) !== severityScore(a.severity)) {
      return severityScore(b.severity) - severityScore(a.severity);
    }

    return a.age - b.age;
  });
}

export function useLiveSimulation(initialAssets: Asset[]) {
  const [liveAssets, setLiveAssets] = useState<Asset[]>(
    initialAssets.map((asset) => ({ ...asset, direction: "flat" }))
  );

  const [liveAlerts, setLiveAlerts] = useState<LiveAlert[]>(() =>
    generateAlerts(initialAssets).map((alert) => ({
      ...alert,
      id: toLiveId(alert),
      age: 0,
    }))
  );

  useEffect(() => {
    let driftMap: DriftMap = Object.fromEntries(
      initialAssets.map((asset) => [asset.symbol, startingDrift(asset)])
    );

    const interval = window.setInterval(() => {
      setLiveAssets((prevAssets) => {
        const nextAssets = prevAssets.map((asset) => {
          const currentDrift = driftMap[asset.symbol] ?? 0;
          const updatedDrift = nextDrift(asset, currentDrift);
          driftMap[asset.symbol] = updatedDrift;
          return simulateAsset(asset, updatedDrift);
        });

        setLiveAlerts((prevAlerts) =>
          mergeAlerts(prevAlerts, generateAlerts(nextAssets))
        );

        return nextAssets;
      });
    }, 3200);

    return () => window.clearInterval(interval);
  }, [initialAssets]);

  const whatMattersNow = useMemo(
    () => buildWhatMattersNow(liveAssets),
    [liveAssets]
  );

  const topOpportunities = useMemo(
    () => getTopOpportunities(liveAssets),
    [liveAssets]
  );

  const generatedAlerts = useMemo<AlertItem[]>(
    () => liveAlerts.map(({ id: _id, age: _age, ...alert }) => alert),
    [liveAlerts]
  );

  return {
    liveAssets,
    generatedAlerts,
    whatMattersNow,
    topOpportunities,
    isLive: true,
  };
}