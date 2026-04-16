const TIMEFRAME_STATE_LIMITS = {
  "1m": {
    agingThresholdMinutes: 2,
    staleThresholdMinutes: 4,
    stagnationWindowCandles: 2,
    watchTimeoutMinutes: 4,
    buildTimeoutMinutes: 4,
    executeFreshMinutes: 5,
    executeMaxMinutes: 12,
    exhaustionCooldownMinutes: 5,
    invalidationCooldownMinutes: 8,
    cacheTtlMs: 15000,
  },
  "5m": {
    agingThresholdMinutes: 8,
    staleThresholdMinutes: 12,
    stagnationWindowCandles: 2,
    watchTimeoutMinutes: 12,
    buildTimeoutMinutes: 12,
    executeFreshMinutes: 18,
    executeMaxMinutes: 45,
    exhaustionCooldownMinutes: 20,
    invalidationCooldownMinutes: 30,
    cacheTtlMs: 30000,
  },
  "15m": {
    agingThresholdMinutes: 22,
    staleThresholdMinutes: 38,
    stagnationWindowCandles: 2,
    watchTimeoutMinutes: 38,
    buildTimeoutMinutes: 38,
    executeFreshMinutes: 45,
    executeMaxMinutes: 110,
    exhaustionCooldownMinutes: 45,
    invalidationCooldownMinutes: 90,
    cacheTtlMs: 45000,
  },
  "1h": {
    agingThresholdMinutes: 60,
    staleThresholdMinutes: 105,
    stagnationWindowCandles: 1,
    watchTimeoutMinutes: 105,
    buildTimeoutMinutes: 105,
    executeFreshMinutes: 120,
    executeMaxMinutes: 300,
    exhaustionCooldownMinutes: 120,
    invalidationCooldownMinutes: 180,
    cacheTtlMs: 120000,
  },
};

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function quality(score) {
  if (score >= 90) return "A+";
  if (score >= 80) return "A";
  if (score >= 64) return "B";
  return "C";
}

function territory(priceLevel, greenLine, redLine) {
  if (priceLevel > greenLine) return "FAVORABLE";
  if (priceLevel < redLine) return "UNFAVORABLE";
  return "NEUTRAL";
}

function getStateLimits(timeframe) {
  return TIMEFRAME_STATE_LIMITS[timeframe] ?? TIMEFRAME_STATE_LIMITS["5m"];
}

function getStateCacheTtlMs(timeframe) {
  return getStateLimits(timeframe).cacheTtlMs;
}

function getExecuteCap(timeframe) {
  if (timeframe === "1m") return 1;
  if (timeframe === "5m") return 2;
  if (timeframe === "15m") return 2;
  return 1;
}

function getCandleMinutes(timeframe) {
  if (timeframe === "1m") return 1;
  if (timeframe === "5m") return 5;
  if (timeframe === "15m") return 15;
  return 60;
}

function getStateTimeout(state, limits) {
  if (state === "Watching") return limits.watchTimeoutMinutes;
  if (state === "Building") return limits.buildTimeoutMinutes;
  if (state === "Execute") return limits.executeFreshMinutes;
  if (state === "Exhaustion") return limits.exhaustionCooldownMinutes;
  if (state === "Invalidated") return limits.invalidationCooldownMinutes;
  return limits.watchTimeoutMinutes;
}

function buildFreshnessScore(state, stateAgeMinutes, limits) {
  const timeout = getStateTimeout(state, limits);
  const agingThreshold =
    state === "Building" || state === "Watching" || state === "Waiting"
      ? limits.agingThresholdMinutes
      : Math.max(1, Math.round(timeout * 0.5));

  if (stateAgeMinutes <= agingThreshold) {
    return clamp(Math.round(100 - (stateAgeMinutes / agingThreshold) * 35), 0, 100);
  }

  const staleWindow = Math.max(timeout - agingThreshold, 1);
  return clamp(Math.round(65 - ((stateAgeMinutes - agingThreshold) / staleWindow) * 65), 0, 100);
}

function buildFreshnessState(state, stateAgeMinutes, limits) {
  const timeout = getStateTimeout(state, limits);
  const agingThreshold =
    state === "Building" || state === "Watching" || state === "Waiting"
      ? limits.agingThresholdMinutes
      : Math.max(1, Math.round(timeout * 0.5));

  if (stateAgeMinutes >= timeout) return "stale";
  if (stateAgeMinutes >= agingThreshold) return "aging";
  return "fresh";
}

function buildDisplayedFreshnessScore(baseFreshness, stateConfidence, score, currentState, progressionContext = null) {
  const stateWeight =
    currentState === "Execute"
      ? 1
      : currentState === "Building"
        ? 0.86
        : currentState === "Watching"
          ? 0.72
          : currentState === "Waiting"
            ? 0.56
            : currentState === "Exhaustion"
              ? 0.34
              : 0.2;
  const anchoredToState = Math.round(baseFreshness * 0.6 + stateConfidence * 0.25 + score * 0.15);
  let displayed = Math.min(baseFreshness, Math.round(anchoredToState * stateWeight + anchoredToState * (1 - stateWeight)));

  if (progressionContext?.stagnating) {
    displayed -= progressionContext.hoveringNearTrigger ? 16 : 10;
  }
  if (progressionContext?.decisionWindowExpired) {
    displayed -= 8;
  }
  if (progressionContext?.resolvingNearTrigger) {
    displayed += progressionContext.meaningfulProgress ? 6 : 3;
  }

  if (currentState === "Invalidated") {
    displayed = Math.min(displayed, 28);
  } else if (currentState === "Exhaustion") {
    displayed = Math.min(displayed, 36);
  } else if (currentState === "Waiting") {
    displayed = Math.min(displayed, 62);
  } else if (currentState === "Watching") {
    displayed = Math.min(displayed, 78);
  } else if (currentState === "Building") {
    displayed = Math.min(displayed, 90);
  }

  return clamp(displayed, 0, 100);
}

function worsenFreshnessState(freshnessState, steps = 0) {
  if (steps <= 0) return freshnessState;
  if (steps === 1) {
    if (freshnessState === "fresh") return "aging";
    if (freshnessState === "aging") return "stale";
    return "stale";
  }
  return "stale";
}

function buildProgressionContext(existing, card, timeframe, provisionalState) {
  if (!existing || existing.currentState !== provisionalState) {
    return {
      stagnationCount: 0,
      nearTriggerStallCount: 0,
      virtualAgePenaltyMinutes: 0,
      freshnessStagePenaltySteps: 0,
      decisionWindowExpired: false,
      resolvingNearTrigger: false,
      resolutionBonus: 0,
      stagnating: false,
      hoveringNearTrigger: false,
      meaningfulProgress: false,
      entryGapImprovement: 0,
      momentumImprovement: 0,
      structureImproved: false,
      priceAdvancePct: 0,
    };
  }

  const limits = getStateLimits(timeframe);
  const metrics = deriveMetrics(card);
  const candleMinutes = getCandleMinutes(timeframe);
  const intendedLong = card.bias === "LONG";
  const lastPriceLevel = existing.lastPriceLevel ?? card.priceLevel;
  const lastMomentum = existing.lastMomentum ?? card.momentum;
  const lastEntryGap = existing.lastEntryGap ?? metrics.entryGap;
  const priceAdvancePct = intendedLong
    ? (card.priceLevel - lastPriceLevel) / Math.max(Math.abs(lastPriceLevel), 0.0001)
    : (lastPriceLevel - card.priceLevel) / Math.max(Math.abs(lastPriceLevel), 0.0001);
  const momentumImprovement = intendedLong ? card.momentum - lastMomentum : lastMomentum - card.momentum;
  const entryGapImprovement = lastEntryGap - metrics.entryGap;
  const structureImproved =
    (!existing.lastDirectionalAlignment && metrics.directionalAlignment) ||
    (existing.lastZone === "NEUTRAL" && metrics.zone !== "NEUTRAL");
  const meaningfulProgress =
    priceAdvancePct > 0.0009 ||
    momentumImprovement > 0.035 ||
    entryGapImprovement > 0.001 ||
    structureImproved;
  const hoveringNearTrigger = metrics.entryGap <= 0.0045 || lastEntryGap <= 0.0045;
  const candidateForStagnation =
    (provisionalState === "Building" || provisionalState === "Watching" || provisionalState === "Waiting") &&
    !metrics.invalidated &&
    !metrics.tooLate;
  const slightImprovement =
    priceAdvancePct > 0.00025 ||
    momentumImprovement > 0.015 ||
    entryGapImprovement > 0.00035 ||
    structureImproved;
  const nearTriggerStall =
    candidateForStagnation &&
    hoveringNearTrigger &&
    !meaningfulProgress &&
    momentumImprovement <= 0.015;
  const stagnating =
    candidateForStagnation &&
    !meaningfulProgress &&
    (hoveringNearTrigger || metrics.momentumWeak || metrics.quiet || !metrics.directionalAlignment);
  const stagnationCount = stagnating ? (existing.stagnationCount ?? 0) + 1 : 0;
  const nearTriggerStallCount = nearTriggerStall ? (existing.nearTriggerStallCount ?? 0) + 1 : 0;
  const thresholdCandles = limits.stagnationWindowCandles ?? 2;
  const decisionWindowCandles = Math.max(1, thresholdCandles + 1);
  const immediatePenaltyMinutes = stagnating
    ? hoveringNearTrigger
      ? Math.max(candleMinutes, Math.round(limits.agingThresholdMinutes * 0.9))
      : Math.max(candleMinutes, Math.round(limits.agingThresholdMinutes * 0.6))
    : 0;
  const sustainedPenaltyMinutes =
    stagnating && stagnationCount >= thresholdCandles
      ? candleMinutes * (stagnationCount - thresholdCandles + 1) * 2
      : 0;
  const virtualAgePenaltyMinutes =
    stagnating
      ? Math.min(
          getStateTimeout(provisionalState, limits) * 0.75,
          immediatePenaltyMinutes + sustainedPenaltyMinutes,
        )
      : 0;
  const freshnessStagePenaltySteps = stagnating
    ? stagnationCount >= thresholdCandles && hoveringNearTrigger
      ? 2
      : 1
    : 0;
  const resolvingNearTrigger =
    candidateForStagnation &&
    hoveringNearTrigger &&
    (existing.nearTriggerStallCount ?? 0) > 0 &&
    !metrics.invalidated &&
    !metrics.tooLate &&
    (meaningfulProgress || slightImprovement);
  const decisionWindowExpired =
    nearTriggerStall && nearTriggerStallCount >= decisionWindowCandles;
  const resolutionBonus = resolvingNearTrigger
    ? meaningfulProgress
      ? 7
      : 4
    : 0;

  return {
    stagnationCount,
    nearTriggerStallCount,
    virtualAgePenaltyMinutes,
    freshnessStagePenaltySteps,
    decisionWindowExpired,
    resolvingNearTrigger,
    resolutionBonus,
    stagnating,
    hoveringNearTrigger,
    meaningfulProgress,
    entryGapImprovement,
    momentumImprovement,
    structureImproved,
    priceAdvancePct,
  };
}

function deriveMetrics(card) {
  const zone = territory(card.priceLevel, card.greenLine, card.redLine);
  const strongTrend = Math.abs(card.changePercent) >= 0.95;
  const weakTrend = Math.abs(card.changePercent) <= 0.32;
  const momentumStrong = Math.abs(card.momentum) >= 0.42;
  const momentumWeak = Math.abs(card.momentum) <= 0.12;
  const stretched = card.rsi >= 76 || card.rsi <= 31;
  const crowded = card.rsi >= 69 || card.rsi <= 36;
  const unstable = Math.abs(card.changePercent) >= 2.4 || Math.abs(card.momentum) >= 0.95;
  const quiet = Math.abs(card.changePercent) < 0.12 && Math.abs(card.momentum) < 0.08;
  const directionalAlignment =
    (card.bias === "LONG" && zone === "FAVORABLE" && card.changePercent > 0 && card.momentum > 0) ||
    (card.bias === "SHORT" && zone === "UNFAVORABLE" && card.changePercent < 0 && card.momentum < 0);
  const invalidated =
    (card.bias === "LONG" && (card.priceLevel < card.support || card.priceLevel < card.redLine)) ||
    (card.bias === "SHORT" && (card.priceLevel > card.entry || card.priceLevel > card.greenLine));

  const entryGap = Math.abs(card.priceLevel - card.entry) / Math.max(card.priceLevel, 0.0001);
  const supportGap = Math.abs(card.priceLevel - card.support) / Math.max(card.priceLevel, 0.0001);
  const gDist = Math.abs(card.priceLevel - card.greenLine) / Math.max(card.priceLevel, 0.0001);
  const rDist = Math.abs(card.priceLevel - card.redLine) / Math.max(card.priceLevel, 0.0001);
  const nqTightContinuation =
    card.symbol === "NQ" &&
    directionalAlignment &&
    !unstable &&
    !quiet &&
    !stretched &&
    supportGap <= 0.0025 &&
    entryGap <= 0.0065 &&
    (
      (card.bias === "LONG" && zone === "FAVORABLE" && card.changePercent >= 0.14 && card.momentum >= 0.006) ||
      (card.bias === "SHORT" && zone === "UNFAVORABLE" && card.changePercent <= -0.14 && card.momentum <= -0.006)
    );
  const continuationCandidate =
    (
      directionalAlignment &&
      !unstable &&
      !quiet &&
      ((card.bias === "LONG" && card.changePercent > 0.45 && card.momentum > 0.18) ||
        (card.bias === "SHORT" && card.changePercent < -0.45 && card.momentum < -0.18))
    ) ||
    nqTightContinuation;
  const trendContinuation =
    (
      continuationCandidate &&
      strongTrend &&
      momentumStrong &&
      ((card.bias === "LONG" && zone !== "UNFAVORABLE") || (card.bias === "SHORT" && zone !== "FAVORABLE"))
    ) ||
    (
      nqTightContinuation &&
      ((card.bias === "LONG" && zone === "FAVORABLE") || (card.bias === "SHORT" && zone === "UNFAVORABLE"))
    );

  const lateExtension =
    (card.bias === "LONG" && card.changePercent > 1.35 && (crowded || stretched)) ||
    (card.bias === "SHORT" && card.changePercent < -1.35 && (crowded || stretched));
  const tooLate = !trendContinuation && (lateExtension || entryGap > 0.011);

  return {
    zone,
    strongTrend,
    weakTrend,
    momentumStrong,
    momentumWeak,
    stretched,
    crowded,
    unstable,
    quiet,
    directionalAlignment,
    continuationCandidate,
    trendContinuation,
    invalidated,
    entryGap,
    supportGap,
    gDist,
    rDist,
    tooLate,
  };
}

function buildBaseScore(card, metrics) {
  let score = 44;

  if (card.bias === "LONG") {
    if (metrics.zone === "FAVORABLE") score += 20;
    if (metrics.zone === "NEUTRAL") score -= 6;
    if (metrics.zone === "UNFAVORABLE") score -= 34;
    if (card.momentum > 0.45) score += 12;
    else if (card.momentum > 0.18) score += 7;
    if (card.momentum < -0.12) score -= 22;
    if (card.changePercent > 0.95) score += 8;
    else if (card.changePercent > 0.28) score += 4;
    if (card.changePercent < -0.15) score -= 20;
  }

  if (card.bias === "SHORT") {
    if (metrics.zone === "UNFAVORABLE") score += 20;
    if (metrics.zone === "NEUTRAL") score -= 6;
    if (metrics.zone === "FAVORABLE") score -= 34;
    if (card.momentum < -0.45) score += 12;
    else if (card.momentum < -0.18) score += 7;
    if (card.momentum > 0.12) score -= 22;
    if (card.changePercent < -0.95) score += 8;
    else if (card.changePercent < -0.28) score += 4;
    if (card.changePercent > 0.15) score -= 20;
  }

  if (card.rsi >= 50 && card.rsi <= 63) score += 11;
  else if (card.rsi >= 46 && card.rsi <= 67) score += 4;
  if (metrics.crowded) score -= metrics.trendContinuation ? 4 : 10;
  if (metrics.stretched) score -= metrics.trendContinuation ? 8 : 18;
  if (metrics.strongTrend) score += 7;
  if (metrics.weakTrend) score -= 14;
  if (metrics.momentumStrong) score += 6;
  if (metrics.momentumWeak) score -= 10;
  if (metrics.unstable) score -= 12;
  if (metrics.directionalAlignment) score += 12;
  if (metrics.continuationCandidate) score += 8;
  if (metrics.trendContinuation) score += 12;
  if (card.bias === "LONG" && metrics.gDist < 0.0025) score += 6;
  if (card.bias === "SHORT" && metrics.rDist < 0.0025) score += 6;
  if (metrics.continuationCandidate && metrics.entryGap <= 0.0075) score += 6;
  if (metrics.entryGap > 0.009) score -= 8;
  if (metrics.supportGap > 0.015) score -= 6;
  if (metrics.zone === "NEUTRAL" && metrics.weakTrend && metrics.momentumWeak) score -= 20;
  if (metrics.zone === "NEUTRAL" && !metrics.directionalAlignment) score -= 8;
  if (metrics.quiet) score -= 14;
  if (metrics.tooLate) score -= metrics.trendContinuation ? 4 : 12;
  if (metrics.invalidated) score -= 24;

  return clamp(score, 0, 100);
}

function buildReasons(card, metrics, score) {
  const reasons = [];

  if (metrics.directionalAlignment) {
    reasons.push("Directional control and momentum are aligned.");
  } else if (metrics.zone === "NEUTRAL") {
    reasons.push("Price is still sitting in a neutral decision zone.");
  } else {
    reasons.push("Directional control is still mixed.");
  }

  if (metrics.trendContinuation) {
    reasons.push("Trend continuation is intact and still behaving cleanly.");
  } else if (metrics.continuationCandidate) {
    reasons.push("Trend structure is rebuilding toward a continuation entry.");
  }

  if (metrics.tooLate) {
    reasons.push("The move is stretched and no longer early enough to trust.");
  } else if (metrics.entryGap <= 0.0065) {
    reasons.push("Price is still close enough to the decision zone to act cleanly.");
  } else {
    reasons.push("Entry quality is fading as price moves away from the decision zone.");
  }

  if (metrics.invalidated) {
    reasons.push("The structure has already broken the invalidation level.");
  } else if (score >= 80) {
    reasons.push("Structure remains clean enough for an actionable read.");
  } else if (score >= 60) {
    reasons.push("The setup is interesting, but it still needs confirmation.");
  } else {
    reasons.push("The current structure does not justify pressing yet.");
  }

  return reasons;
}

function mapStatus(currentState) {
  if (currentState === "Execute") return "CONFIRMED";
  if (currentState === "Building") return "BUILDING";
  if (currentState === "Watching") return "WATCHING";
  if (currentState === "Exhaustion") return "EXHAUSTION";
  if (currentState === "Invalidated") return "INVALIDATED";
  return "WAITING";
}

function buildDecisionState(card, timeframe, stateAgeMinutes, progressionContext = null) {
  const limits = getStateLimits(timeframe);
  const metrics = deriveMetrics(card);
  let score = buildBaseScore(card, metrics);
  const baseScore = score;
  let currentState = "Waiting";
  let action = "WAIT";
  let invalidationWarning = null;
  let decayWarning = null;

  if (metrics.invalidated || score <= 34) {
    currentState = "Invalidated";
    action = "AVOID";
    invalidationWarning = "Structure failed the invalidation test.";
  } else if (metrics.tooLate && score >= 62 && !metrics.continuationCandidate) {
    currentState = "Exhaustion";
    action = "WAIT";
  } else if (
    (
      score >= 72 &&
      metrics.directionalAlignment &&
      !metrics.crowded &&
      !metrics.stretched &&
      !metrics.unstable &&
      !metrics.tooLate &&
      metrics.entryGap <= 0.0105
    ) ||
    (
      metrics.trendContinuation &&
      score >= 70 &&
      !metrics.invalidated &&
      !metrics.stretched &&
      !metrics.tooLate &&
      metrics.entryGap <= 0.013
    )
  ) {
    currentState = "Execute";
    action = "EXECUTE";
  } else if (
    (
      score >= 66 &&
      metrics.directionalAlignment &&
      !metrics.invalidated &&
      !metrics.unstable
    ) ||
    (
      metrics.continuationCandidate &&
      score >= 60 &&
      !metrics.invalidated &&
      !metrics.tooLate
    )
  ) {
    currentState = "Building";
    action = "WAIT";
  } else if (
    score >= 52 ||
    (metrics.directionalAlignment && score >= 48) ||
    (!metrics.invalidated &&
      !metrics.tooLate &&
      !metrics.unstable &&
      metrics.zone !== "NEUTRAL" &&
      metrics.entryGap <= 0.0045 &&
      score >= 40)
  ) {
    currentState = "Watching";
    action = "WAIT";
  }

  const nearTriggerStall =
    (currentState === "Building" || currentState === "Watching") &&
    metrics.directionalAlignment &&
    !metrics.invalidated &&
    !metrics.tooLate &&
    metrics.entryGap <= 0.0045;
  const effectiveStateAgeMinutes = stateAgeMinutes + (progressionContext?.virtualAgePenaltyMinutes ?? 0);
  const stagnatingWithoutProgress = Boolean(progressionContext?.stagnating);
  const freshnessState = buildFreshnessState(currentState, effectiveStateAgeMinutes, limits);

  if (stagnatingWithoutProgress && (currentState === "Building" || currentState === "Watching" || currentState === "Waiting")) {
    const stagnationPenalty =
      currentState === "Building"
        ? progressionContext.hoveringNearTrigger
          ? 12
          : 8
        : progressionContext.hoveringNearTrigger
          ? 9
          : 6;
    score = clamp(score - stagnationPenalty, 0, 100);
    decayWarning = progressionContext.hoveringNearTrigger
      ? "The setup is stalling near trigger without confirmation."
      : "The setup is not progressing and is losing freshness.";
  }

  if (
    progressionContext?.resolvingNearTrigger &&
    (currentState === "Building" || currentState === "Watching") &&
    !metrics.invalidated &&
    !metrics.tooLate
  ) {
    score = clamp(score + (progressionContext.resolutionBonus ?? 0), 0, 100);

    if (
      (
        score >= 72 &&
        metrics.directionalAlignment &&
        !metrics.crowded &&
        !metrics.stretched &&
        !metrics.unstable &&
        metrics.entryGap <= 0.0105
      ) ||
      (
        metrics.trendContinuation &&
        score >= 70 &&
        !metrics.invalidated &&
        !metrics.stretched &&
        !metrics.tooLate &&
        metrics.entryGap <= 0.013
      )
    ) {
      currentState = "Execute";
      action = "EXECUTE";
      decayWarning = "The setup is resolving off the trigger.";
    } else if (
      currentState === "Watching" &&
      (
        (
          score >= 66 &&
          metrics.directionalAlignment &&
          !metrics.invalidated &&
          !metrics.unstable
        ) ||
        (
          metrics.continuationCandidate &&
          score >= 60 &&
          !metrics.invalidated &&
          !metrics.tooLate
        )
      )
    ) {
      currentState = "Building";
      action = "WAIT";
      decayWarning = "The setup is resolving and moving back toward confirmation.";
    }
  }

  if (freshnessState === "aging" && (currentState === "Building" || currentState === "Watching")) {
    const agePenalty = currentState === "Building" ? 6 : 4;
    const stallPenalty = nearTriggerStall ? 6 : 0;
    score = clamp(score - agePenalty - stallPenalty, 0, 100);
    decayWarning = decayWarning ?? (nearTriggerStall
      ? "The setup is hovering near trigger without confirming."
      : "The setup is aging and needs fresh progress soon.");
  }

  if (progressionContext?.decisionWindowExpired && (currentState === "Building" || currentState === "Watching")) {
    if (currentState === "Building") {
      currentState = "Watching";
      action = "WAIT";
      score = clamp(score - 18, 0, 100);
      decayWarning = "Decision window expired near trigger without confirmation. Downgraded.";
    } else {
      currentState = "Waiting";
      action = "WAIT";
      score = clamp(score - 16, 0, 100);
      decayWarning = "Decision window expired near trigger. The setup loses priority.";
    }
  }

  if (currentState === "Execute" && effectiveStateAgeMinutes > limits.executeFreshMinutes) {
    currentState = "Exhaustion";
    action = "WAIT";
    score = clamp(score - 12, 0, 100);
    decayWarning = "Execute window is aging. Chasing here is less attractive.";
  } else if (currentState === "Building" && effectiveStateAgeMinutes > limits.buildTimeoutMinutes) {
    currentState = "Watching";
    action = "WAIT";
    score = clamp(score - ((nearTriggerStall || progressionContext?.hoveringNearTrigger) ? 18 : 14), 0, 100);
    decayWarning = (nearTriggerStall || progressionContext?.hoveringNearTrigger)
      ? "The setup stayed near trigger too long without confirming and has been downgraded."
      : "The setup stalled before confirmation and has been downgraded.";
  } else if (currentState === "Watching" && effectiveStateAgeMinutes > limits.watchTimeoutMinutes) {
    currentState = "Waiting";
    action = "WAIT";
    score = clamp(score - ((nearTriggerStall || progressionContext?.hoveringNearTrigger) ? 16 : 12), 0, 100);
    decayWarning = (nearTriggerStall || progressionContext?.hoveringNearTrigger)
      ? "Price stayed close to trigger without confirming. Interest has faded."
      : "Interest is fading because the setup has not progressed.";
  } else if (currentState === "Exhaustion" && effectiveStateAgeMinutes > limits.exhaustionCooldownMinutes) {
    currentState = "Waiting";
    action = "WAIT";
    score = clamp(score - 6, 0, 100);
    decayWarning = "The late-stage move has cooled and needs a fresh rebuild.";
  } else if (currentState === "Invalidated" && effectiveStateAgeMinutes > limits.invalidationCooldownMinutes) {
    currentState = "Waiting";
    action = "WAIT";
    score = clamp(score + 4, 0, 100);
    invalidationWarning = null;
    decayWarning = "Invalidation has cooled off. Wait for a fresh rebuild.";
  }

  const baseFreshness = buildFreshnessScore(currentState, effectiveStateAgeMinutes, limits);
  const baseFreshnessState = buildFreshnessState(currentState, effectiveStateAgeMinutes, limits);
  const adjustedFreshnessState = worsenFreshnessState(
    baseFreshnessState,
    progressionContext?.freshnessStagePenaltySteps ?? 0,
  );
  const adjustedFreshnessBase =
    adjustedFreshnessState === "stale"
      ? Math.min(baseFreshness, 24)
      : adjustedFreshnessState === "aging"
        ? Math.min(baseFreshness, 56)
        : baseFreshness;
  const freshnessPenalty =
    adjustedFreshnessState === "stale"
      ? 14
      : adjustedFreshnessState === "aging"
        ? 6
        : 0;
  const stagnationConfidencePenalty = stagnatingWithoutProgress
    ? progressionContext?.hoveringNearTrigger
      ? 14
      : 9
    : 0;
  const stateConfidence = clamp(
    Math.round(score * 0.72 + adjustedFreshnessBase * 0.28) - freshnessPenalty - stagnationConfidencePenalty,
    0,
    100,
  );
  const adjustedFreshness = buildDisplayedFreshnessScore(
    adjustedFreshnessBase,
    stateConfidence,
    score,
    currentState,
    progressionContext,
  );
  const reasons = buildReasons(card, metrics, score);

  if (adjustedFreshnessState === "stale") {
    reasons.unshift("The setup has gone stale for this timeframe.");
  } else if (adjustedFreshnessState === "aging") {
    reasons.unshift("The setup is aging and needs progress soon.");
  }

  if (nearTriggerStall && adjustedFreshnessState !== "fresh") {
    reasons.unshift("Price is lingering near trigger without confirmation.");
  }
  if (stagnatingWithoutProgress) {
    reasons.unshift("The setup is not progressing toward confirmation.");
  }

  return {
    ...card,
    timeframe,
    score,
    quality: quality(score),
    action,
    status: mapStatus(currentState),
    currentState,
    stateConfidence,
    freshnessState: adjustedFreshnessState,
    freshnessScore: adjustedFreshness,
    decayWarning,
    invalidationWarning,
    tooLateFlag: metrics.tooLate,
    reasons: reasons.slice(0, 4),
    stateDebug: {
      rawStateInputs: {
        zone: metrics.zone,
        changePercent: card.changePercent,
        momentum: card.momentum,
        rsi: card.rsi,
        entryGap: Number(metrics.entryGap.toFixed(6)),
        supportGap: Number(metrics.supportGap.toFixed(6)),
        greenLineDistance: Number(metrics.gDist.toFixed(6)),
        redLineDistance: Number(metrics.rDist.toFixed(6)),
        directionalAlignment: metrics.directionalAlignment,
        continuationCandidate: metrics.continuationCandidate,
        trendContinuation: metrics.trendContinuation,
        invalidated: metrics.invalidated,
        tooLate: metrics.tooLate,
        stretched: metrics.stretched,
        crowded: metrics.crowded,
        unstable: metrics.unstable,
        quiet: metrics.quiet,
        strongTrend: metrics.strongTrend,
        weakTrend: metrics.weakTrend,
        momentumStrong: metrics.momentumStrong,
        momentumWeak: metrics.momentumWeak,
        nearTriggerStall,
        stagnatingWithoutProgress,
        stagnationCount: progressionContext?.stagnationCount ?? 0,
        nearTriggerStallCount: progressionContext?.nearTriggerStallCount ?? 0,
        virtualAgePenaltyMinutes: progressionContext?.virtualAgePenaltyMinutes ?? 0,
        freshnessStagePenaltySteps: progressionContext?.freshnessStagePenaltySteps ?? 0,
        decisionWindowExpired: progressionContext?.decisionWindowExpired ?? false,
        resolvingNearTrigger: progressionContext?.resolvingNearTrigger ?? false,
        resolutionBonus: progressionContext?.resolutionBonus ?? 0,
        priceAdvancePct: progressionContext?.priceAdvancePct
          ? Number(progressionContext.priceAdvancePct.toFixed(6))
          : 0,
        momentumImprovement: progressionContext?.momentumImprovement
          ? Number(progressionContext.momentumImprovement.toFixed(6))
          : 0,
        entryGapImprovement: progressionContext?.entryGapImprovement
          ? Number(progressionContext.entryGapImprovement.toFixed(6))
          : 0,
        structureImproved: progressionContext?.structureImproved ?? false,
        freshnessState: adjustedFreshnessState,
      },
      baseScore,
      chosenState: currentState,
      stateConfidence,
      freshnessScore: adjustedFreshness,
      tooLateFlag: metrics.tooLate,
      topReasons: reasons.slice(0, 3),
    },
  };
}

function applyStateEngine(cards, timeframe, stateTracker, now = Date.now()) {
  return cards.map((card) => {
    const trackerKey = `${timeframe}:${card.symbol}`;
    const existing = stateTracker.get(trackerKey);
    const firstPass = buildDecisionState(card, timeframe, 0);
    const continuingSameState = existing && existing.currentState === firstPass.currentState;
    const stateAgeMinutes = continuingSameState ? Math.max(0, Math.round((now - existing.startedAt) / 60000)) : 0;
    const progressionContext = continuingSameState
      ? buildProgressionContext(existing, card, timeframe, firstPass.currentState)
      : buildProgressionContext(null, card, timeframe, firstPass.currentState);
    const evaluated = buildDecisionState(card, timeframe, stateAgeMinutes, progressionContext);
    const finalExisting = stateTracker.get(trackerKey);
    const finalContinuing = finalExisting && finalExisting.currentState === evaluated.currentState;

    if (finalContinuing) {
      stateTracker.set(trackerKey, {
        ...finalExisting,
        lastPriceLevel: card.priceLevel,
        lastMomentum: card.momentum,
        lastEntryGap: Math.abs(card.priceLevel - card.entry) / Math.max(card.priceLevel, 0.0001),
        lastDirectionalAlignment: Boolean(evaluated.stateDebug?.rawStateInputs?.directionalAlignment),
        lastZone: evaluated.stateDebug?.rawStateInputs?.zone ?? null,
        stagnationCount: progressionContext.stagnationCount ?? 0,
        nearTriggerStallCount: progressionContext.nearTriggerStallCount ?? 0,
      });
      return {
        ...evaluated,
        stateAge: Math.max(0, Math.round((now - finalExisting.startedAt) / 60000)),
      };
    }

    stateTracker.set(trackerKey, {
      currentState: evaluated.currentState,
      startedAt: now,
      lastPriceLevel: card.priceLevel,
      lastMomentum: card.momentum,
      lastEntryGap: Math.abs(card.priceLevel - card.entry) / Math.max(card.priceLevel, 0.0001),
      lastDirectionalAlignment: Boolean(evaluated.stateDebug?.rawStateInputs?.directionalAlignment),
      lastZone: evaluated.stateDebug?.rawStateInputs?.zone ?? null,
      stagnationCount: 0,
      nearTriggerStallCount: 0,
    });

    return {
      ...evaluated,
      stateAge: 0,
    };
  });
}

function finalizeStateBoard(cards, timeframe) {
  const executeCap = getExecuteCap(timeframe);
  const rankedExecute = cards
    .filter((card) => card.action === "EXECUTE")
    .sort((a, b) => b.stateConfidence - a.stateConfidence || b.score - a.score || b.momentum - a.momentum);

  const permitted = new Set(rankedExecute.slice(0, executeCap).map((card) => card.symbol));

  return cards.map((card) => {
    if (card.action !== "EXECUTE" || permitted.has(card.symbol)) {
      return card;
    }

    const stackedReason = "Another execution-qualified setup currently has higher board priority.";
    return {
      ...card,
      status: "STACKED",
      decayWarning: "Another execution-qualified setup currently has higher board priority.",
      reasons: [...card.reasons, stackedReason].slice(0, 4),
      stateDebug: {
        ...card.stateDebug,
        chosenState: "Execute",
        stateConfidence: card.stateConfidence,
        topReasons: [...card.reasons, stackedReason].slice(0, 3),
      },
    };
  });
}

module.exports = {
  applyStateEngine,
  finalizeStateBoard,
  getStateCacheTtlMs,
};
