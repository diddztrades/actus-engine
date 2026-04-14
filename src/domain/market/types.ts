export type ActusAssetClass = "fx" | "metal" | "equity-index" | "crypto" | "energy";
export type ActusTimeframe = "1m" | "5m" | "15m" | "1h";
export type ActusBias = "bullish" | "bearish" | "mixed" | "neutral";
export type ActusRegime =
  | "trend"
  | "expansion"
  | "compression"
  | "reversal"
  | "mean-reversion";
export type ActusLocation =
  | "discount"
  | "premium"
  | "near-ema"
  | "session-high"
  | "session-low"
  | "opening-range"
  | "first-hour"
  | "extended"
  | "mid-range";
export type ActusState =
  | "reclaim"
  | "rejection"
  | "breakout"
  | "failed-breakout"
  | "continuation"
  | "execute"
  | "exhaustion"
  | "sweep"
  | "balanced"
  | "waiting"
  | "watching"
  | "building"
  | "invalidated";
export type ActusConviction = "low" | "medium" | "high";
export type ActusTriggerQuality = "A+" | "A" | "B" | "none";
export type ActusFreshnessState = "fresh" | "aging" | "stale";
export type ActusSetupType =
  | "Continuation"
  | "Reclaim"
  | "Breakout"
  | "Reversal"
  | "Compression"
  | "Expansion"
  | "No Setup";
export type ActusRiskState = "clean" | "unstable" | "crowded" | "late";
export type ActusAction = "execute" | "wait" | "avoid";
export type ActusDirection = "long" | "short" | "neutral";
export type ActusDataMode = "mock" | "live";
export type ActusDataSource = "mock" | "remote";
export type ActusFeedHealth = "healthy" | "degraded" | "stale" | "empty" | "loading";

export type ActusMarketPrice = {
  open: number;
  high: number;
  low: number;
  close: number;
};

export type ActusSessionLevels = {
  asiaHigh: number;
  asiaLow: number;
  londonHigh?: number;
  londonLow?: number;
  nyOpenRangeHigh?: number;
  nyOpenRangeLow?: number;
  firstHourHigh?: number;
  firstHourLow?: number;
};

export type ActusVectorState = {
  green: boolean;
  red: boolean;
  firstGreenAboveEma: boolean;
  firstRedBelowEma: boolean;
};

export type ActusStructureState = {
  ema50: number;
  aboveEma50: boolean;
  belowEma50: boolean;
  distanceFromEmaPct: number;
  closedBackAboveAsiaLow: boolean;
  closedBackBelowAsiaHigh: boolean;
};

export type ActusNormalizedMarketInput = {
  symbol: string;
  displayName: string;
  assetClass: ActusAssetClass;
  timeframe: ActusTimeframe;
  stateAgeMinutes?: number;
  price: ActusMarketPrice;
  sessionLevels: ActusSessionLevels;
  vector: ActusVectorState;
  structure: ActusStructureState;
  sparkline: number[];
  liveState?: {
    currentState: "Waiting" | "Watching" | "Building" | "Execute" | "Exhaustion" | "Invalidated";
    action: ActusAction;
    stateConfidence: number;
    freshnessState: ActusFreshnessState;
    freshnessScore: number;
    tooLateFlag: boolean;
    reasons: string[];
    decayWarning?: string | null;
    invalidationWarning?: string | null;
    debug?: {
      rawStateInputs?: Record<string, string | number | boolean | null>;
      chosenState?: string;
      stateConfidence?: number;
      freshnessState?: ActusFreshnessState;
      freshnessScore?: number;
      tooLateFlag?: boolean;
      topReasons?: string[];
    };
  };
  sessionContext?: {
    currentSession: "asia" | "london" | "new-york" | "overnight";
    stretchFromBaseline: number | null;
    dayHigh: number | null;
    dayLow: number | null;
    baseline: number | null;
  };
  positioningContext?: {
    positioningCeiling: number | null;
    positioningFloor: number | null;
    pinZone: { lower: number; upper: number; anchor: number } | null;
    compressionZone: { lower: number; upper: number; anchor: number } | null;
    expansionRisk: string;
    dealerPressureShift: string;
    positioningSupport: string;
    positioningResistance: string;
    confidence: "high" | "medium" | "low";
    warnings: string[];
  };
};

export type ActusMacroInput = {
  session: "asia" | "london" | "new-york" | "overnight";
  riskTone: "risk-on" | "risk-off" | "mixed";
  usdTilt: "supportive" | "neutral" | "headwind";
  volatility: "contained" | "active" | "elevated";
  breadth: "broad" | "selective" | "thin";
  headlineRisk: "low" | "medium" | "high";
};

export type ActusModuleResult = {
  score: number;
  summary: string;
  flags: string[];
};

export type ActusOpportunityOutput = {
  symbol: string;
  displayName: string;
  assetClass: ActusAssetClass;
  timeframe: ActusTimeframe;
  action: ActusAction;
  direction: ActusDirection;
  bias: ActusBias;
  regime: ActusRegime;
  location: ActusLocation;
  state: ActusState;
  conviction: ActusConviction;
  triggerQuality: ActusTriggerQuality;
  setupType: ActusSetupType;
  riskState: ActusRiskState;
  opportunityScore: number;
  confidenceScore: number;
  stateAgeMinutes: number;
  stateAgeLabel: string;
  freshnessState?: ActusFreshnessState;
  freshnessScore?: number;
  tooLateFlag?: boolean;
  price: number;
  changePct: number;
  entry: number;
  invalidation: number;
  whyItMatters: string[];
  summary: string;
  actionLabel: string;
  actionLine: string;
  invalidationLine: string;
  contextLine?: string;
  macroNote: string;
  warnings?: string[];
  debugState?: {
    rawStateInputs?: Record<string, string | number | boolean | null>;
    chosenState?: string;
    stateConfidence?: number;
    freshnessState?: ActusFreshnessState;
    freshnessScore?: number;
    tooLateFlag?: boolean;
    topReasons?: string[];
  };
  sessionContext?: ActusNormalizedMarketInput["sessionContext"];
  positioningContext?: ActusNormalizedMarketInput["positioningContext"];
  telemetry: {
    trend: ActusModuleResult;
    vector: ActusModuleResult;
    liquidity: ActusModuleResult;
    session: ActusModuleResult;
    macro: ActusModuleResult;
  };
  sparkline: number[];
};

export type ActusRankedOpportunity = {
  rank: number;
  symbol: string;
  displayName: string;
  action: ActusAction;
  triggerQuality: ActusTriggerQuality;
  opportunityScore: number;
  summary: string;
};

export type ActusAlert = {
  id: string;
  severity: "high" | "medium" | "low";
  title: string;
  asset: string;
  body: string;
  ageLabel: string;
};

export type ActusSystemStatus = {
  mode: ActusDataMode;
  source: ActusDataSource;
  health: ActusFeedHealth;
  lastUpdatedLabel: string;
  lastUpdatedAt: number | null;
  message: string;
};

export type ActusPlatformSnapshot = {
  status: ActusSystemStatus;
  macro: ActusMacroInput & {
    command: string;
    summary: string;
  };
  hero: ActusOpportunityOutput | null;
  whatMattersNow: string[];
  opportunities: ActusOpportunityOutput[];
  ranked: ActusRankedOpportunity[];
  alerts: ActusAlert[];
  counts: {
    execute: number;
    wait: number;
    avoid: number;
  };
};
