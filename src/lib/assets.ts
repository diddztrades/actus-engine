import type { Asset } from "../types/asset";
import type { AlertItem } from "../types/alert";

function getGradeScore(grade?: "A+" | "A" | "B" | "none") {
  if (grade === "A+") return 30;
  if (grade === "A") return 20;
  if (grade === "B") return 10;
  return 0;
}

export function sortAssetsByImportance(list: Asset[]) {
  return [...list].sort((a, b) => {
    const gradeDiff = getGradeScore(b.grade) - getGradeScore(a.grade);
    if (gradeDiff !== 0) return gradeDiff;

    const compositeDiff = getCompositeScore(b) - getCompositeScore(a);
    if (compositeDiff !== 0) return compositeDiff;

    const setupDiff = b.setup - a.setup;
    if (setupDiff !== 0) return setupDiff;

    return b.speed - a.speed;
  });
}

export function filterAssets(query: string, list: Asset[]) {
  const q = query.trim().toLowerCase();

  if (!q) return sortAssetsByImportance(list);

  return sortAssetsByImportance(
    list.filter(
      (asset) =>
        asset.symbol.toLowerCase().includes(q) ||
        asset.name.toLowerCase().includes(q) ||
        asset.bias.toLowerCase().includes(q) ||
        asset.regime.toLowerCase().includes(q) ||
        asset.location.toLowerCase().includes(q) ||
        asset.posture.toLowerCase().includes(q)
    )
  );
}

export function getTopOpportunities(list: Asset[]) {
  return sortAssetsByImportance(list).slice(0, 3);
}

export function getFastestAsset(list: Asset[]) {
  return [...list].sort((a, b) => b.speed - a.speed)[0];
}

export function getBestBehaviorAsset(list: Asset[]) {
  return [...list].sort((a, b) => getBehaviorScore(b) - getBehaviorScore(a))[0];
}

export function getDisciplineAsset(list: Asset[]) {
  return [...list].sort((a, b) => getDisciplineScore(b) - getDisciplineScore(a))[0];
}

export function getCurrentSession(date = new Date()) {
  const hour = date.getHours();

  if (hour >= 0 && hour < 7) return "Asia";
  if (hour >= 7 && hour < 13) return "London";
  if (hour >= 13 && hour < 21) return "New York";

  return "Off Hours";
}

export function buildWhatMattersNow(list: Asset[]) {
  const ranked = sortAssetsByImportance(list);
  const fastest = getFastestAsset(list);
  const bestBehavior = getBestBehaviorAsset(list);
  const discipline = getDisciplineAsset(list);
  const session = getCurrentSession();

  const strongBullish = ranked.filter(
    (asset) =>
      asset.bias === "Bullish" &&
      (asset.grade === "A+" || asset.grade === "A" || asset.setup >= 80) &&
      (asset.regime === "Trend Continuation" || asset.regime === "Expansion")
  );

  const strongBearish = ranked.filter(
    (asset) =>
      asset.bias === "Bearish" &&
      (asset.grade === "A+" || asset.grade === "A" || asset.setup >= 75) &&
      asset.regime === "Mean Reversion"
  );

  const leaders = ranked.slice(0, 3);

  let primaryRead = "Conditions are mixed and require selective execution.";
  let summary =
    "Focus only on the cleanest structures and avoid forcing trades in noisy markets.";

  if (strongBullish.length >= 2) {
    primaryRead = "Momentum continuation is dominating the cleaner side of the board.";
    summary = `${strongBullish
      .slice(0, 3)
      .map((a) => a.name)
      .join(", ")} are showing the strongest alignment between bias, regime, and setup quality. Best odds remain in disciplined pullbacks, not emotional chasing.`;
  } else if (strongBearish.length >= 2) {
    primaryRead = "Defensive posture is favored as weaker structures stand out.";
    summary = `${strongBearish
      .slice(0, 3)
      .map((a) => a.name)
      .join(", ")} are showing the clearest warning profile. Prioritise caution and avoid low-quality continuation attempts.`;
  } else if (leaders.length >= 2) {
    primaryRead = "Selective leadership is present, but quality is uneven across the board.";
    summary = `${leaders
      .slice(0, 3)
      .map((a) => a.name)
      .join(", ")} currently lead on composite quality. Focus on structure, not noise.`;
  }

  const sessionSummary = buildSessionSummary(session, leaders, discipline);

  return {
    session,
    primaryRead,
    summary,
    sessionSummary,
    fastestAsset: fastest?.symbol ?? "N/A",
    fastestNote: fastest
      ? `${fastest.regime} conditions with ${fastest.risk.toLowerCase()} risk context and ${fastest.speed}/100 speed.`
      : "No clear fast mover.",
    bestBehavior: bestBehavior?.symbol ?? "N/A",
    bestBehaviorNote: bestBehavior
      ? `${bestBehavior.regime} structure with ${bestBehavior.posture.toLowerCase()}.`
      : "No clear best-behavior asset.",
    disciplineAsset: discipline?.name ?? "N/A",
    disciplineTitle: "Discipline layer",
    disciplineText: discipline
      ? `${discipline.name} is the highest caution asset right now. ${discipline.note}`
      : "No standout discipline warning.",
  };
}

export function generateAlerts(list: Asset[]): AlertItem[] {
  const generated = list
    .map((asset) => buildAlertFromAsset(asset))
    .filter((item): item is AlertItem => Boolean(item));

  return [...generated].sort(
    (a, b) => getGeneratedAlertPriorityScore(b, list) - getGeneratedAlertPriorityScore(a, list)
  );
}

function buildAlertFromAsset(asset: Asset): AlertItem | null {
  if (asset.regime === "Expansion" && asset.speed >= 80 && asset.setup >= 85) {
    return {
      time: buildAlertTime(asset),
      asset: asset.symbol,
      title: "Expansion confirmed",
      body: `${asset.name} is showing strong expansion behavior with ${asset.speed}/100 speed and ${asset.setup}/100 setup quality. Best posture remains ${asset.posture.toLowerCase()}.`,
      severity: "high",
    };
  }

  if (asset.regime === "Compression" && asset.setup >= 68) {
    return {
      time: buildAlertTime(asset),
      asset: asset.symbol,
      title: "Compression under key level",
      body: `${asset.name} is compressing near ${asset.location.toLowerCase()}. Wait for acceptance or a cleaner reclaim before pressing the trade.`,
      severity: "medium",
    };
  }

  if (asset.regime === "Mean Reversion" && asset.location.toLowerCase().includes("extended")) {
    return {
      time: buildAlertTime(asset),
      asset: asset.symbol,
      title: "Exhaustion risk rising",
      body: `${asset.name} is stretched relative to location and move quality is fading. ${asset.posture}.`,
      severity: "medium",
    };
  }

  if (asset.regime === "Trend Continuation" && asset.bias === "Bullish" && asset.setup >= 80) {
    return {
      time: buildAlertTime(asset),
      asset: asset.symbol,
      title: "Continuation structure holding",
      body: `${asset.name} is maintaining cleaner continuation conditions with ${asset.location.toLowerCase()}. Best behavior remains ${asset.posture.toLowerCase()}.`,
      severity: "high",
    };
  }

  if (asset.speed >= 85 && asset.risk === "High") {
    return {
      time: buildAlertTime(asset),
      asset: asset.symbol,
      title: "Fast tape, elevated chase risk",
      body: `${asset.name} is moving quickly, but risk remains elevated. Follow only on acceptance and avoid emotional chasing.`,
      severity: "medium",
    };
  }

  return null;
}

function getGeneratedAlertPriorityScore(alert: AlertItem, assets: Asset[]) {
  const asset = assets.find((item) => item.symbol === alert.asset);

  let score = 0;

  if (alert.severity === "high") score += 40;
  if (alert.severity === "medium") score += 24;
  if (alert.severity === "low") score += 10;

  if (asset) {
    score += Math.round(asset.setup * 0.3);
    score += Math.round(asset.speed * 0.15);
    score += getGradeScore(asset.grade);

    if (asset.regime === "Expansion") score += 12;
    if (asset.regime === "Trend Continuation") score += 14;
    if (asset.regime === "Compression") score += 6;
    if (asset.regime === "Mean Reversion") score += 4;
  }

  if (alert.title.toLowerCase().includes("confirmed")) score += 10;
  if (alert.title.toLowerCase().includes("continuation")) score += 8;
  if (alert.title.toLowerCase().includes("compression")) score += 6;
  if (alert.title.toLowerCase().includes("exhaustion")) score += 6;

  return score;
}

function buildAlertTime(asset: Asset) {
  const base = 9 * 60 + 10;
  const offset = (asset.speed + asset.setup + asset.symbol.length * 3) % 45;
  const totalMinutes = base + offset;
  const hh = String(Math.floor(totalMinutes / 60)).padStart(2, "0");
  const mm = String(totalMinutes % 60).padStart(2, "0");
  return `${hh}:${mm}`;
}

export function getCompositeScore(asset: Asset) {
  let score = 0;

  score += asset.setup * 0.5;
  score += asset.speed * 0.25;
  score += getBehaviorScore(asset) * 0.25;
  score += getGradeScore(asset.grade);

  return Math.round(score);
}

function getBehaviorScore(asset: Asset) {
  let score = 0;

  if (asset.bias === "Bullish") score += 16;
  if (asset.bias === "Bearish") score += 8;
  if (asset.regime === "Trend Continuation") score += 30;
  if (asset.regime === "Expansion") score += 18;
  if (asset.regime === "Compression") score += 6;
  if (asset.regime === "Mean Reversion") score += 4;
  if (asset.regime === "Disorder") score -= 28;

  if (asset.risk === "Low") score += 16;
  if (asset.risk === "Moderate") score += 8;
  if (asset.risk === "Elevated") score -= 4;
  if (asset.risk === "High") score -= 10;
  if (asset.risk === "Very High") score -= 20;

  if (asset.posture.toLowerCase().includes("buy dips")) score += 10;
  if (asset.posture.toLowerCase().includes("buy pullbacks")) score += 10;
  if (asset.posture.toLowerCase().includes("wait")) score -= 4;
  if (asset.posture.toLowerCase().includes("avoid")) score -= 10;
  if (asset.posture.toLowerCase().includes("no trade")) score -= 18;

  if (asset.location.toLowerCase().includes("holding")) score += 8;
  if (asset.location.toLowerCase().includes("above")) score += 6;
  if (asset.location.toLowerCase().includes("breaking")) score += 4;
  if (asset.location.toLowerCase().includes("extended")) score -= 8;
  if (asset.location.toLowerCase().includes("headline-driven")) score -= 16;

  return score;
}

function getDisciplineScore(asset: Asset) {
  let score = 0;

  if (asset.regime === "Disorder") score += 40;
  if (asset.regime === "Mean Reversion") score += 14;
  if (asset.risk === "Very High") score += 30;
  if (asset.risk === "High") score += 18;
  if (asset.risk === "Elevated") score += 10;
  if (asset.bias === "Bearish") score += 8;
  if (asset.setup < 65) score += 18;
  if (asset.speed > 80 && asset.risk !== "Low") score += 10;
  if (asset.posture.toLowerCase().includes("avoid")) score += 12;
  if (asset.posture.toLowerCase().includes("no trade")) score += 22;

  return score;
}

function buildSessionSummary(
  session: string,
  leaders: Asset[],
  discipline: Asset | undefined
) {
  const leaderNames = leaders.slice(0, 2).map((a) => a.name).join(" and ");

  if (session === "Asia") {
    return `Asia session favors patience. Watch how ${leaderNames || "the leaders"} behave around range edges before committing to continuation.`;
  }

  if (session === "London") {
    return `London session is where structure starts to clarify. Prioritise clean participation in ${leaderNames || "the stronger names"} and avoid forcing trades in messy tape.`;
  }

  if (session === "New York") {
    return `New York session usually rewards decisive execution. Focus on the clearest opportunities first and keep risk tight around ${discipline?.name ?? "headline-sensitive assets"}.`;
  }

  return `Outside primary sessions, expect thinner conditions. Reduce aggression and wait for cleaner confirmation before committing.`;
}