import type { AssetState } from "../types/engine";
import type { DecisionBoardState, DecisionCard } from "../types/decision";

function formatDuration(timestamp: number) {
  const diffMs = Date.now() - timestamp;
  const totalSeconds = Math.max(0, Math.floor(diffMs / 1000));
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;

  if (hours > 0) return hours + "h " + minutes + "m";
  if (minutes > 0) return minutes + "m " + seconds + "s";
  return seconds + "s";
}

function mapCard(asset: AssetState): DecisionCard {
  return {
    symbol: asset.symbol,
    name: asset.name,
    note: asset.note,
    durationLabel: formatDuration(asset.stateEnteredAt)
  };
}

export function buildDecisionBoard(assets: AssetState[]): DecisionBoardState {
  return {
    execute: {
      title: "EXECUTE",
      items: assets.filter((asset) => asset.state === "execute").map(mapCard)
    },
    wait: {
      title: "WAIT",
      items: assets.filter((asset) => asset.state === "wait").map(mapCard)
    },
    avoid: {
      title: "AVOID",
      items: assets.filter((asset) => asset.state === "avoid").map(mapCard)
    }
  };
}