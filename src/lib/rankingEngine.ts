import type { AssetState } from "../types/engine";
import type { MacroSnapshot } from "../types/macro";
import type { RankingItem } from "../types/ranking";

export function rankAssets(assets: AssetState[], macro: MacroSnapshot): RankingItem[] {
  const macroBoost = macro.cryptoTone === "risk-on" ? 4 : 0;

  return assets
    .map((asset) => {
      let score = asset.confidence + asset.momentumScore - asset.riskScore;

      if (asset.symbol.includes("BTC") || asset.symbol.includes("ETH") || asset.symbol.includes("SOL")) {
        score += macroBoost;
      }

      if (asset.state === "execute") score += 10;
      if (asset.state === "avoid") score -= 10;

      return {
        symbol: asset.symbol,
        name: asset.name,
        score,
        state: asset.state,
        note: asset.note
      };
    })
    .sort((a, b) => b.score - a.score)
    .slice(0, 6);
}