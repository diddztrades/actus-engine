import type { ActusOpportunityOutput, ActusRankedOpportunity } from "./types";

function actionWeight(action: ActusOpportunityOutput["action"]) {
  if (action === "execute") return 18;
  if (action === "wait") return 1;
  return -14;
}

function qualityWeight(quality: ActusOpportunityOutput["triggerQuality"]) {
  if (quality === "A+") return 14;
  if (quality === "A") return 8;
  if (quality === "B") return 3;
  return -6;
}

function riskWeight(riskState: ActusOpportunityOutput["riskState"]) {
  if (riskState === "clean") return 12;
  if (riskState === "crowded") return -9;
  if (riskState === "late") return -18;
  return -15;
}

function convictionWeight(conviction: ActusOpportunityOutput["conviction"]) {
  if (conviction === "high") return 10;
  if (conviction === "medium") return 0;
  return -10;
}

export function rankActusOpportunities(list: ActusOpportunityOutput[]): ActusRankedOpportunity[] {
  return [...list]
    .sort((a, b) => {
      const left =
        a.opportunityScore +
        actionWeight(a.action) +
        qualityWeight(a.triggerQuality) +
        riskWeight(a.riskState) +
        convictionWeight(a.conviction);
      const right =
        b.opportunityScore +
        actionWeight(b.action) +
        qualityWeight(b.triggerQuality) +
        riskWeight(b.riskState) +
        convictionWeight(b.conviction);
      return right - left;
    })
    .map((item, index) => ({
      rank: index + 1,
      symbol: item.symbol,
      displayName: item.displayName,
      action: item.action,
      triggerQuality: item.triggerQuality,
      opportunityScore: item.opportunityScore,
      summary: item.summary,
    }));
}
