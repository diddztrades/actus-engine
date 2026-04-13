function buildHybridDecision(card) {
  const territory =
    card.priceLevel > card.greenLine
      ? "FAVORABLE"
      : card.priceLevel < card.redLine
      ? "UNFAVORABLE"
      : "NEUTRAL";

  let score = 50;

  // momentum impact
  if (card.momentum > 0.2) score += 15;
  if (card.momentum < -0.2) score -= 15;

  // RSI positioning
  if (card.rsi > 55 && card.rsi < 75) score += 10;
  if (card.rsi < 40 || card.rsi > 80) score -= 10;

  // territory weighting
  if (territory === "FAVORABLE") score += 20;
  if (territory === "UNFAVORABLE") score -= 25;

  // simple reclaim simulation
  if (card.momentum > 0 && card.priceLevel > card.greenLine * 0.995) {
    score += 10;
  }

  if (card.momentum < 0 && card.priceLevel < card.redLine * 1.005) {
    score -= 10;
  }

  score = Math.max(0, Math.min(100, score));

  let status = "BUILDING";
  let action = "WAIT";

  if (score >= 70) {
    status = "CONFIRMED";
    action = "EXECUTE";
  }

  if (score <= 35) {
    status = "FAILING";
    action = "AVOID";
  }

  return {
    ...card,
    status,
    action,
    quality:
      score >= 85 ? "A+" :
      score >= 70 ? "A" :
      score >= 55 ? "B" : "C"
  };
}
