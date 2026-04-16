import { useEffect, useMemo, useRef, useState } from "react";
import { useActusPlatform } from "./application/actus/useActusPlatform";
import { ACTUS_PRODUCT_LANGUAGE } from "./domain/actus/language";
import type { ActusAction, ActusOpportunityOutput } from "./domain/market/types";
import { ENV } from "./config/env";
import { AlertToast } from "./components/AlertToast";
import { ActusChart } from "./components/ActusChart";
import { clearDatabentoFuturesHistoryCache, fetchDatabentoFuturesHistory } from "./data/databento/history";
import type { DatabentoCoreAsset } from "./data/databento/types";
import { clearActusDeltaSignalCache } from "./data/delta/signal";
import { clearActusGammaOverlayCache } from "./data/gamma/overlay";
import {
  fetchNyOpenFlowHistory,
  fetchNyOpenFlowSnapshot,
  type NyOpenFlowAsset,
  type NyOpenFlowHistorySnapshot,
  type NyOpenFlowSnapshot,
} from "./data/session/nyOpenFlow";
import {
  ACTUS_HISTORY_BUFFER,
  actusHistoryLimit,
  actusTimeframeDurationMs,
  closedCandleBoundaryMs,
  minimumActusHistoryCandles,
} from "./lib/actusChartConfig";
import { resolveActusDeltaSignal } from "./lib/actusDelta";
import { resolveActusGammaOverlay, withActusGammaSpot } from "./lib/actusGammaOverlay";
import { deriveActusPositioning, type ActusPositioning } from "./lib/actusDecisionEngine";
import {
  deriveActusExecutionState,
  isExitExecutionState,
  isTrackableExecutionState,
  stabilizeExecutionTransition,
  shouldAlertExecutionTransition,
  type ActusExecutionState,
} from "./lib/actusExecutionState";
import type { TimeframeFilter } from "./types/chart";
import type { DeltaSignal } from "./types/delta";
import type { GammaOverlay } from "./types/chart";
import type { NormalizedFuturesCandle } from "./types/market";
import { Sentry } from "./sentry";

const TIMEFRAME_OPTIONS = ["1m", "5m", "15m", "1h"] as const;
const VIEW_MODES = ["focus", "deep"] as const;
const ACTUS_MODE_ASSET_UNIVERSE = ["BTC/USD", "ETH/USD", "SOL/USD", "XAU/USD", "NQ", "CL", "EUR/USD"] as const;
type ViewMode = (typeof VIEW_MODES)[number];
type CommandHistoryEntry = {
  id: string;
  symbol: string;
  action: string;
  timeframe: string;
  score: number;
  timestamp: number;
};

type ActusModeSelection = {
  symbol: string;
  timeframe: TimeframeFilter;
  snapshot: ActusOpportunityOutput;
  solView?: SolActusView;
};

type SolActusView = "binance-execution" | "cme-structure";

type LiveDatabentoCandle = {
  timestamp?: string;
  open?: number;
  high?: number;
  low?: number;
  close?: number;
  volume?: number;
  o?: number;
  h?: number;
  l?: number;
  c?: number;
};

type ActusLiveAsset = DatabentoCoreAsset | "BTC" | "ETH" | "SOL";

type ActusModeRenderableAsset = ActusOpportunityOutput & {
  timeframe: TimeframeFilter;
  actusSourceKey?: string;
  actusSourceLabel?: string | null;
  actusChartSymbol?: string;
};

type ActusLiveChartSnapshot = {
  asset: string;
  timeframe: TimeframeFilter;
  supportedAsset: boolean;
  livePrice: number | null;
  updatedAt: string | null;
  liveSymbol?: string | null;
  liveSourceType?: string | null;
  candleSourceSymbol?: string | null;
  candleSourceType?: string | null;
  source: string | null;
  sourceType: "last-trade" | "quote-mid" | null;
  candle: LiveDatabentoCandle | null;
};

type ActusSourceHistoryResponse = {
  ok: boolean;
  asset: string;
  supportedAsset: boolean;
  timeframe: TimeframeFilter;
  source: string | null;
  candles: NormalizedFuturesCandle[];
  error?: string;
};

type ActusModeLiveChartState = {
  supported: boolean;
  connected: boolean;
  historyResolved: boolean;
  sparkline: number[] | null;
  candles: NormalizedFuturesCandle[] | null;
  price: number | null;
  updatedAt: number | null;
};

type ActusReplayState = {
  isReplayMode: boolean;
  isPlaying: boolean;
  replayIndex: number;
  replaySpeed: number;
};

type ActusReplayHistoryState = {
  loading: boolean;
  candles: NormalizedFuturesCandle[] | null;
  resolved: boolean;
};

type ProductPrefs = {
  favorites: string[];
  alertsEnabled: boolean;
  executeAlertsEnabled: boolean;
  alertEnabledByAsset: Record<string, boolean>;
  browserAlertsEnabled: boolean;
  executeSoundEnabled: boolean;
  preferredTimeframe: TimeframeFilter;
  notesByAsset: Record<string, string>;
  onboardingDismissed: boolean;
};

type InAppAlertTone = "ready" | "active" | "exit" | "invalidated" | "info";

type InAppAlert = {
  id: string;
  symbol: string;
  title: string;
  body: string;
  tone: InAppAlertTone;
  createdAt: number;
  sound?: "execute";
};

type ActusInternalAlertEventType =
  | "execute-appearance"
  | "bias-change"
  | "confidence-threshold"
  | "condition-change"
  | "positioning-change"
  | "delta-directional";

type ActusInternalAlertSnapshot = {
  symbol: string;
  timeframe: TimeframeFilter;
  bias: "LONG" | "SHORT" | "NEUTRAL";
  confidenceScore: number;
  confidenceBand: "LOW" | "MEDIUM" | "HIGH";
  condition: "BREAKOUT" | "MEAN_REVERSION" | "TRAP";
  positioningType: ActusPositioning["positioningType"] | null;
  deltaAvailability: DeltaSignal["deltaAvailability"] | null;
  deltaDirectionalAvailable: boolean;
  deltaBias: DeltaSignal["bias"] | null;
};

type ActusInternalAlertEvent = {
  id: string;
  asset: string;
  timestamp: number;
  eventType: ActusInternalAlertEventType;
  snapshot: ActusInternalAlertSnapshot;
  previousSnapshot: ActusInternalAlertSnapshot | null;
};

type SetupOutcome = "completed" | "invalidated" | "not-triggered" | "exited-early";

type SetupHistoryEntry = {
  id: string;
  symbol: string;
  timeframe: TimeframeFilter;
  direction: ActusOpportunityOutput["direction"];
  entry: number;
  invalidation: number;
  command: string;
  outcome: SetupOutcome;
  startedAt: number;
  endedAt: number;
  snapshot: ActusOpportunityOutput;
  filledPrice?: number;
  exitPrice?: number;
  exitLabel?: string;
};

type OpenPositionRecord = {
  key: string;
  symbol: string;
  timeframe: TimeframeFilter;
  side: "long" | "short";
  filledPrice: number;
  stop: number;
  timestamp: number;
  active: boolean;
  snapshot: ActusOpportunityOutput;
};

type ClosedPositionRecord = {
  key: string;
  symbol: string;
  outcome: "completed" | "invalidated" | "exited-early";
  exitLabel: "COMPLETED" | "STOP HIT" | "EXITED";
  exitPrice: number;
  timestamp: number;
};

type OpenSetupRecord = {
  key: string;
  symbol: string;
  timeframe: TimeframeFilter;
  startedAt: number;
  snapshot: ActusOpportunityOutput;
  lastStatus: ActusExecutionState;
  everActive: boolean;
};

type NyOpenFlowMap = Partial<Record<NyOpenFlowAsset, NyOpenFlowSnapshot | null>>;
type NyOpenFlowHistoryMap = Partial<Record<NyOpenFlowAsset, NyOpenFlowHistorySnapshot[]>>;
type NyOpenFlowDisplayRow = {
  item: ActusOpportunityOutput;
  asset: NyOpenFlowAsset;
  mode: "current" | "history";
  label: "Buyer-led" | "Seller-led" | "Balanced" | null;
  buyVolume: number | null;
  sellVolume: number | null;
  balancePct: number | null;
  subtitle: string;
};

const PRODUCT_PREFS_KEY = "actus-product-prefs-v1";
const PRODUCT_HISTORY_KEY = "actus-setup-history-v1";
const OPEN_POSITIONS_KEY = "actus-open-positions-v1";
const CLOSED_POSITIONS_KEY = "actus-closed-positions-v1";
const MAX_SETUP_HISTORY = 10;
const ALERT_THROTTLE_MS = 90_000;
const DEFAULT_REPLAY_SPEED = 1000;
const REPLAY_SPEEDS = [1400, 900, 500] as const;
const DEFAULT_PRODUCT_PREFS: ProductPrefs = {
  favorites: [],
  alertsEnabled: true,
  executeAlertsEnabled: true,
  alertEnabledByAsset: {},
  browserAlertsEnabled: false,
  executeSoundEnabled: false,
  preferredTimeframe: "5m",
  notesByAsset: {},
  onboardingDismissed: false,
};

const API_BASE = (ENV.API_URL || "http://localhost:3001").replace(/\/$/, "");

function readLocalStorage<T>(key: string, fallback: T) {
  if (typeof window === "undefined") {
    return fallback;
  }

  try {
    const raw = window.localStorage.getItem(key);
    if (!raw) {
      return fallback;
    }

    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

function writeLocalStorage<T>(key: string, value: T) {
  if (typeof window === "undefined") {
    return;
  }

  try {
    window.localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // Ignore persistence failures so the live product keeps running.
  }
}

function readProductPrefs() {
  const stored = readLocalStorage(PRODUCT_PREFS_KEY, DEFAULT_PRODUCT_PREFS);
  return {
    ...DEFAULT_PRODUCT_PREFS,
    ...stored,
    alertEnabledByAsset: {
      ...DEFAULT_PRODUCT_PREFS.alertEnabledByAsset,
      ...stored.alertEnabledByAsset,
    },
    notesByAsset: {
      ...DEFAULT_PRODUCT_PREFS.notesByAsset,
      ...stored.notesByAsset,
    },
  };
}

function tone(action: ActusAction) {
  if (action === "execute") {
    return { text: "#45ffb5", bg: "rgba(69,255,181,0.12)", border: "rgba(69,255,181,0.34)" };
  }
  if (action === "avoid") {
    return { text: "#ff6f91", bg: "rgba(255,111,145,0.12)", border: "rgba(255,111,145,0.34)" };
  }
  return { text: "#ffd84d", bg: "rgba(255,216,77,0.12)", border: "rgba(255,216,77,0.3)" };
}

function topBarStatus(mode: string, health: string) {
  if (health === "healthy" && mode === "live") {
    return {
      label: "Live",
      color: "#45ffb5",
      background: "rgba(69,255,181,0.12)",
      border: "rgba(69,255,181,0.34)",
    };
  }
  if (health === "stale" || health === "degraded" || health === "empty") {
    return {
      label: "Stale",
      color: health === "empty" ? "#ff6f91" : "#ffd84d",
      background: health === "empty" ? "rgba(255,111,145,0.12)" : "rgba(255,216,77,0.12)",
      border: health === "empty" ? "rgba(255,111,145,0.34)" : "rgba(255,216,77,0.3)",
    };
  }
  return {
    label: mode === "live" ? "Updating" : mode.charAt(0).toUpperCase() + mode.slice(1),
    color: "#8ea0bf",
    background: "rgba(255,255,255,0.03)",
    border: "rgba(142,160,191,0.14)",
  };
}

function updateLabel(mode: string, health: string, lastUpdatedLabel: string) {
  if (mode === "live" && health === "healthy") {
    return "Live • updating";
  }
  return `Updated ${lastUpdatedLabel}`;
}

function displayViewMode(mode: ViewMode) {
  return mode === "focus" ? "Focus" : "Deep";
}

function actusSourceQualifier(symbol: string, solView?: SolActusView) {
  const normalized = symbol.toUpperCase();
  if ((normalized === "SOL" || normalized === "SOL/USD") && solView === "cme-structure") {
    return "SOL | CME Structure";
  }
  if (normalized === "SOL" || normalized === "SOL/USD") {
    return "SOL | Binance Execution";
  }
  if (normalized === "BTC" || normalized === "BTC/USD") {
    return "MBT Futures + Deribit Options";
  }
  if (normalized === "ETH" || normalized === "ETH/USD") {
    return "Deribit Perp";
  }
  if (normalized === "XAU" || normalized === "XAU/USD" || normalized === "GC") {
    return "GC Futures";
  }
  if (normalized === "OIL" || normalized === "CL") {
    return "CL Futures";
  }
  if (normalized === "NQ") {
    return "NQ Futures";
  }
  if (normalized === "EUR" || normalized === "EUR/USD" || normalized === "EURUSD" || normalized === "6E") {
    return "6E Futures";
  }
  return null;
}

function setupKey(item: Pick<ActusOpportunityOutput, "symbol" | "timeframe">) {
  return `${item.symbol}-${item.timeframe}`;
}

function executionPrompt(status: ActusExecutionState) {
  if (status === "ready") {
    return {
      label: "Actionable",
      body: "Prepare at trigger. Do not anticipate.",
    };
  }

  if (status === "active") {
    return {
      label: "Live idea",
      body: "In play now. Respect invalidation.",
    };
  }

  if (status === "weakening") {
    return {
      label: "Quality fading",
      body: "Momentum is slipping. Tighten risk.",
    };
  }

  if (status === "exit_soon") {
    return {
      label: "Do not overstay",
      body: "Manage out if progress stalls.",
    };
  }

  if (status === "invalidated") {
    return {
      label: "Idea broken",
      body: "Stand down. The setup failed.",
    };
  }

  if (status === "too_late") {
    return {
      label: "Avoid chasing",
      body: "The move is extended for clean risk.",
    };
  }

  return {
    label: "Not ready yet",
    body: "Wait for cleaner confirmation.",
  };
}

function executionActionTag(status: ActusExecutionState) {
  if (status === "ready") return "prepare";
  if (status === "active") return "engage";
  if (status === "weakening") return "reduce";
  if (status === "exit_soon") return "exit";
  if (status === "invalidated" || status === "too_late") return "avoid";
  return "wait";
}

function alertPayload(
  item: ActusOpportunityOutput,
  nextStatus: ActusExecutionState,
  previousStatus?: ActusExecutionState,
) {
  if (previousStatus === "building" && nextStatus === "ready") {
    return {
      title: item.direction === "short" ? `READY TO SHORT - ${item.symbol}` : `READY TO BUY - ${item.symbol}`,
      body: "Actionable now. Prepare at trigger.",
      tone: "ready" as const,
    };
  }

  if (previousStatus === "ready" && nextStatus === "active") {
    return {
      title: item.direction === "short" ? `SHORT ACTIVE - ${item.symbol}` : `LONG ACTIVE - ${item.symbol}`,
      body: "Setup is live. Respect invalidation.",
      tone: "active" as const,
    };
  }

  if (previousStatus === "active" && nextStatus === "weakening") {
    return {
      title: `WEAKENING - ${item.symbol}`,
      body: "Quality is fading. Tighten risk.",
      tone: "info" as const,
    };
  }

  if (previousStatus === "active" && nextStatus === "exit_soon") {
    return {
      title: `EXIT SOON - ${item.symbol}`,
      body: "Do not overstay. Manage out if progress stalls.",
      tone: "exit" as const,
    };
  }

  if (nextStatus === "too_late") {
    return {
      title: `TOO LATE - ${item.symbol}`,
      body: "Avoid chasing. Wait for a cleaner reset.",
      tone: "exit" as const,
    };
  }

  return {
    title: `INVALIDATED - ${item.symbol}`,
    body: "Idea broke. Stand down.",
    tone: "invalidated" as const,
  };
}

function isAlertEnabledForAsset(prefs: ProductPrefs, symbol: string) {
  return prefs.alertsEnabled && (prefs.alertEnabledByAsset[symbol] ?? true);
}

function deriveActusAlertBias(item: ActusOpportunityOutput): "LONG" | "SHORT" | "NEUTRAL" {
  if (item.direction === "long") return "LONG";
  if (item.direction === "short") return "SHORT";
  return "NEUTRAL";
}

function deriveActusAlertCondition(item: ActusOpportunityOutput): "BREAKOUT" | "MEAN_REVERSION" | "TRAP" {
  if (item.tooLateFlag || item.riskState === "late" || item.state === "failed-breakout" || item.state === "invalidated") {
    return "TRAP";
  }
  if (item.state === "breakout" || item.state === "continuation" || item.state === "execute") {
    return "BREAKOUT";
  }
  return "MEAN_REVERSION";
}

function deriveAlertConfidenceBand(score: number): "LOW" | "MEDIUM" | "HIGH" {
  if (score >= 70) return "HIGH";
  if (score >= 40) return "MEDIUM";
  return "LOW";
}

function buildInternalAlertSnapshot(
  item: ActusOpportunityOutput,
  options?: {
    positioningType?: ActusPositioning["positioningType"] | null;
    deltaSignal?: DeltaSignal | null;
  },
): ActusInternalAlertSnapshot {
  return {
    symbol: item.symbol,
    timeframe: item.timeframe,
    bias: deriveActusAlertBias(item),
    confidenceScore: item.confidenceScore,
    confidenceBand: deriveAlertConfidenceBand(item.confidenceScore),
    condition: deriveActusAlertCondition(item),
    positioningType: options?.positioningType ?? null,
    deltaAvailability: options?.deltaSignal?.deltaAvailability ?? null,
    deltaDirectionalAvailable: options?.deltaSignal?.deltaDirectionalAvailable ?? false,
    deltaBias: options?.deltaSignal?.bias ?? null,
  };
}

function buildInternalAlertEvents(
  previousSnapshot: ActusInternalAlertSnapshot | null,
  nextSnapshot: ActusInternalAlertSnapshot,
) {
  if (!previousSnapshot) {
    return [] as Array<{ eventType: ActusInternalAlertEventType; signature: string }>;
  }

  const events: Array<{ eventType: ActusInternalAlertEventType; signature: string }> = [];

  if (previousSnapshot.bias !== nextSnapshot.bias) {
    events.push({
      eventType: "bias-change",
      signature: `${nextSnapshot.symbol}:bias:${previousSnapshot.bias}->${nextSnapshot.bias}`,
    });
  }

  if (previousSnapshot.confidenceBand !== nextSnapshot.confidenceBand) {
    events.push({
      eventType: "confidence-threshold",
      signature: `${nextSnapshot.symbol}:confidence:${previousSnapshot.confidenceBand}->${nextSnapshot.confidenceBand}`,
    });
  }

  if (previousSnapshot.condition !== nextSnapshot.condition) {
    events.push({
      eventType: "condition-change",
      signature: `${nextSnapshot.symbol}:condition:${previousSnapshot.condition}->${nextSnapshot.condition}`,
    });
  }

  if (previousSnapshot.positioningType !== nextSnapshot.positioningType && nextSnapshot.positioningType !== null) {
    events.push({
      eventType: "positioning-change",
      signature: `${nextSnapshot.symbol}:positioning:${previousSnapshot.positioningType ?? "NONE"}->${nextSnapshot.positioningType}`,
    });
  }

  if (!previousSnapshot.deltaDirectionalAvailable && nextSnapshot.deltaDirectionalAvailable) {
    events.push({
      eventType: "delta-directional",
      signature: `${nextSnapshot.symbol}:delta:${previousSnapshot.deltaAvailability ?? "NONE"}->${nextSnapshot.deltaAvailability ?? "NONE"}:${nextSnapshot.deltaBias ?? "NEUTRAL"}`,
    });
  }

  return events;
}

function internalAlertEventLabel(eventType: ActusInternalAlertEventType) {
  if (eventType === "execute-appearance") return "Execute Live";
  if (eventType === "bias-change") return "Bias Shift";
  if (eventType === "confidence-threshold") return "Confidence Shift";
  if (eventType === "condition-change") return "Condition Shift";
  if (eventType === "positioning-change") return "Positioning Shift";
  return "Delta Directional";
}

function internalAlertEventTone(eventType: ActusInternalAlertEventType) {
  if (eventType === "execute-appearance") return tone("execute");
  if (eventType === "delta-directional") return tone("execute");
  if (eventType === "positioning-change") return { text: "#67b7ff", bg: "rgba(103,183,255,0.12)", border: "rgba(103,183,255,0.28)" };
  if (eventType === "confidence-threshold") return tone("wait");
  return tone("avoid");
}

function internalAlertRecencyLabel(timestamp: number, now: number) {
  const elapsedMinutes = Math.max(0, Math.floor((now - timestamp) / 60000));
  if (elapsedMinutes < 1) return "now";
  if (elapsedMinutes < 60) return `${elapsedMinutes}m ago`;
  const hours = Math.floor(elapsedMinutes / 60);
  const minutes = elapsedMinutes % 60;
  return `${hours}h ${String(minutes).padStart(2, "0")}m`;
}

function internalAlertSummary(event: ActusInternalAlertEvent) {
  const previous = event.previousSnapshot;
  const next = event.snapshot;

  if (event.eventType === "bias-change" && previous) {
    return `${previous.bias} to ${next.bias}`;
  }
  if (event.eventType === "confidence-threshold" && previous) {
    return `${previous.confidenceBand} to ${next.confidenceBand}`;
  }
  if (event.eventType === "condition-change" && previous) {
    return `${previous.condition.replace("_", " ")} to ${next.condition.replace("_", " ")}`;
  }
  if (event.eventType === "positioning-change" && previous) {
    return `${previous.positioningType ?? "NONE"} to ${next.positioningType ?? "NONE"}`;
  }
  if (event.eventType === "execute-appearance") {
    return next.condition === "BREAKOUT" ? "Execute lane opened on confirmed breakout" : "Execute lane opened";
  }
  if (event.eventType === "delta-directional") {
    return next.deltaBias ? `${next.deltaBias} flow confirmed` : "Directional flow confirmed";
  }
  return next.symbol;
}

function browserNotificationsSupported() {
  return typeof window !== "undefined" && "Notification" in window;
}

function currentBrowserNotificationPermission(): NotificationPermission | "unsupported" {
  if (!browserNotificationsSupported()) {
    return "unsupported";
  }
  return window.Notification.permission;
}

function shouldDeliverBrowserAlert() {
  if (typeof document === "undefined") {
    return false;
  }
  return document.visibilityState !== "visible" || !document.hasFocus();
}

function buildBrowserNotificationFromInternalEvent(event: ActusInternalAlertEvent) {
  const eventLabel = internalAlertEventLabel(event.eventType);
  const summary = internalAlertSummary(event);
  return {
    fingerprint: `internal:${event.asset}:${event.eventType}:${summary}`,
    title: `${event.asset} • ${eventLabel}`,
    body: summary,
    tag: `actus-internal-${event.asset}-${event.eventType}`,
  };
}

function buildBrowserNotificationFromInAppAlert(alert: InAppAlert) {
  return {
    fingerprint: `execution:${alert.symbol}:${alert.title}:${alert.body}`,
    title: `${alert.symbol} • Execution Alert`,
    body: `${alert.title}: ${alert.body}`,
    tag: `actus-execution-${alert.symbol}`,
  };
}

let executeAlertAudioContext: AudioContext | null = null;

function getExecuteAlertAudioContext() {
  if (typeof window === "undefined") {
    return null;
  }

  const AudioContextCtor = window.AudioContext ?? (window as typeof window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!AudioContextCtor) {
    return null;
  }

  if (!executeAlertAudioContext || executeAlertAudioContext.state === "closed") {
    executeAlertAudioContext = new AudioContextCtor();
  }

  return executeAlertAudioContext;
}

async function playExecuteAlertSound() {
  const context = getExecuteAlertAudioContext();
  if (!context) {
    return false;
  }

  if (context.state === "suspended") {
    try {
      await context.resume();
    } catch {
      return false;
    }
  }

  if (context.state !== "running") {
    return false;
  }

  const now = context.currentTime;
  const oscillator = context.createOscillator();
  const gain = context.createGain();

  oscillator.type = "sine";
  oscillator.frequency.setValueAtTime(920, now);
  oscillator.frequency.exponentialRampToValueAtTime(1180, now + 0.18);
  gain.gain.setValueAtTime(0.0001, now);
  gain.gain.exponentialRampToValueAtTime(0.2, now + 0.018);
  gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.22);

  oscillator.connect(gain);
  gain.connect(context.destination);
  oscillator.start(now);
  oscillator.stop(now + 0.24);
  return true;
}

function replayOutcomeTone(outcome: SetupOutcome) {
  if (outcome === "completed") {
    return tone("execute");
  }
  if (outcome === "invalidated") {
    return tone("avoid");
  }
  return tone("wait");
}

function replayOutcomeLabel(outcome: SetupOutcome) {
  if (outcome === "completed") {
    return "Completed";
  }
  if (outcome === "invalidated") {
    return "Invalidated";
  }
  if (outcome === "exited-early") {
    return "Exited Early";
  }
  return "Not Triggered";
}

function hasStopBeenHit(item: ActusOpportunityOutput, position: OpenPositionRecord) {
  if (position.side === "short") {
    return item.price >= position.stop || item.state === "invalidated";
  }
  return item.price <= position.stop || item.state === "invalidated";
}

function managementSignal(item: ActusOpportunityOutput, position: OpenPositionRecord) {
  const delta = position.side === "short" ? position.filledPrice - item.price : item.price - position.filledPrice;
  const profitable = delta > 0;
  const momentum = actusMomentumState(item);
  const reachedPressure =
    position.side === "long"
      ? item.positioningContext?.positioningCeiling !== null &&
        item.positioningContext?.positioningCeiling !== undefined &&
        item.price >= item.positioningContext.positioningCeiling
      : item.positioningContext?.positioningFloor !== null &&
        item.positioningContext?.positioningFloor !== undefined &&
        item.price <= item.positioningContext.positioningFloor;

  if (hasStopBeenHit(item, position)) {
    return {
      mode: "stop-hit" as const,
      banner: "POSITION OPEN",
      primary: "EXIT NOW",
      secondary: "Stop hit",
      tone: "invalidated" as const,
      alertTitle: `STOP HIT - ${item.symbol}`,
      alertBody: position.side === "short" ? `Above ${position.stop.toLocaleString()}` : `Below ${position.stop.toLocaleString()}`,
    };
  }

  if (item.state === "exhaustion" || item.tooLateFlag || item.freshnessState === "stale") {
    return {
      mode: "take-profit" as const,
      banner: "MANAGING TRADE",
      primary: "TAKE PROFIT",
      secondary: profitable ? "Move is extended" : "Risk is rising",
      tone: "exit" as const,
      alertTitle: `TAKE PROFIT - ${item.symbol}`,
      alertBody: profitable ? "Late-state pressure is building" : "Trade no longer has clean support",
    };
  }

  if (profitable && (item.freshnessState === "aging" || momentum === "Weakening" || item.riskState === "unstable" || reachedPressure)) {
    return {
      mode: "protect-profit" as const,
      banner: "MANAGING TRADE",
      primary: "PROTECT PROFIT",
      secondary: momentum === "Weakening" ? "Momentum is weakening" : "Lock in room above stop",
      tone: "exit" as const,
      alertTitle: `PROTECT PROFIT - ${item.symbol}`,
      alertBody: momentum === "Weakening" ? "Momentum is weakening" : "Freshness is deteriorating",
    };
  }

  if (momentum === "Weakening" || item.freshnessState === "aging") {
    return {
      mode: "weakening" as const,
      banner: "POSITION OPEN",
      primary: "MANAGING TRADE",
      secondary: momentum === "Weakening" ? "Momentum weakening" : "Freshness fading",
      tone: "info" as const,
      alertTitle: `MOMENTUM WEAKENING - ${item.symbol}`,
      alertBody: momentum === "Weakening" ? "Progress is slowing" : "Setup is aging",
    };
  }

  return {
    mode: "open" as const,
    banner: "POSITION OPEN",
    primary: position.side === "short" ? "SHORT ACTIVE" : "LONG ACTIVE",
    secondary: position.side === "short" ? `Below ${position.filledPrice.toLocaleString()}` : `Above ${position.filledPrice.toLocaleString()}`,
    tone: "active" as const,
    alertTitle: "",
    alertBody: "",
  };
}

function badge(text: string, color: string, background: string, border: string) {
  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        padding: "4px 10px",
        borderRadius: 999,
        fontSize: 12,
        letterSpacing: "0.08em",
        textTransform: "uppercase",
        color,
        background,
        border: `1px solid ${border}`,
        boxShadow: `inset 0 1px 0 rgba(255,255,255,0.04), 0 0 18px ${background}`,
        fontWeight: 700,
      }}
    >
      {text}
    </span>
  );
}

function metricCard(label: string, value: string, detail?: string, accent?: string) {
  return (
    <div
      style={{
        background: "linear-gradient(180deg, rgba(10,15,27,0.9), rgba(4,7,14,0.98))",
        border: "1px solid rgba(118,138,176,0.18)",
        boxShadow: `inset 0 1px 0 rgba(255,255,255,0.04), 0 10px 26px rgba(0,0,0,0.22)${accent ? `, 0 0 24px ${accent}16` : ""}`,
        borderRadius: 18,
        padding: "14px 16px",
        position: "relative",
        overflow: "hidden",
      }}
    >
      {accent ? (
        <div
          style={{
            position: "absolute",
            inset: "0 auto 0 0",
            width: 3,
            background: accent,
            opacity: 0.9,
          }}
        />
      ) : null}
      <div style={{ fontSize: 12, color: "#7f8da8", letterSpacing: "0.08em", textTransform: "uppercase" }}>{label}</div>
      <div style={{ marginTop: 8, fontSize: 24, fontWeight: 600, color: accent ?? "#f4f7fb" }}>{value}</div>
      {detail ? <div style={{ marginTop: 6, fontSize: 13, color: "#9aabc8", lineHeight: 1.5 }}>{detail}</div> : null}
    </div>
  );
}

function compactMetricCard(label: string, value: string, detail?: string, accent?: string) {
  return (
    <div
      style={{
        padding: "10px 12px",
        borderRadius: 12,
        background: "linear-gradient(180deg, rgba(9,13,24,0.82), rgba(5,8,15,0.92))",
        border: "1px solid rgba(118,138,176,0.12)",
        boxShadow: accent ? `0 0 22px ${accent}10` : "none",
      }}
    >
      <div style={{ fontSize: 11, color: "#7f8da8", letterSpacing: "0.08em", textTransform: "uppercase" }}>{label}</div>
      <div style={{ marginTop: 6, fontSize: 21, fontWeight: 650, color: accent ?? "#f4f7fb" }}>{value}</div>
      {detail ? <div style={{ marginTop: 4, fontSize: 12, color: "#8ea0bf", lineHeight: 1.35 }}>{detail}</div> : null}
    </div>
  );
}

function mapSymbolToNyOpenFlowAsset(symbol: string): NyOpenFlowAsset | null {
  const normalized = typeof symbol === "string" ? symbol.toUpperCase() : "";
  if (normalized === "NQ") return "NQ";
  if (normalized === "CL" || normalized === "OIL") return "CL";
  if (normalized === "XAU" || normalized === "XAU/USD" || normalized === "GC") return "GC";
  if (normalized === "EUR/USD" || normalized === "EURUSD" || normalized === "6E") return "6E";
  if (normalized === "BTC" || normalized === "BTC/USD" || normalized === "MBT") return "BTC";
  return null;
}

function formatNyOpenFlowVolume(value: number | null) {
  if (!Number.isFinite(value ?? null)) return "n/a";
  return new Intl.NumberFormat("en-US", { maximumFractionDigits: 0 }).format(value ?? 0);
}

function formatNyOpenFlowPercent(balancePct: number | null) {
  if (!Number.isFinite(balancePct ?? null)) return "n/a";
  const pct = Math.round((balancePct ?? 0) * 100);
  return `${pct > 0 ? "+" : ""}${pct}%`;
}

function nyOpenFlowAccent(flow: { label: "Buyer-led" | "Seller-led" | "Balanced" | null; balancePct?: number | null } | null) {
  if (flow?.label === "Buyer-led") return "#45ffb5";
  if (flow?.label === "Seller-led") return "#ff8ea8";
  return "#d7e1f4";
}

function compactNyOpenFlowLabel(flow: NyOpenFlowSnapshot | null) {
  if (!flow?.ready || !flow.label) {
    return null;
  }
  if (flow.label === "Balanced") {
    return "NY Open 30m Flow: Balanced";
  }
  return `NY Open 30m Flow: ${formatNyOpenFlowPercent(flow.balancePct)} ${flow.label === "Buyer-led" ? "Buy" : "Sell"}`;
}

function deepNyOpenFlowSection(
  items: ActusOpportunityOutput[],
  nyOpenFlowByAsset: NyOpenFlowMap,
  nyOpenFlowHistoryByAsset: NyOpenFlowHistoryMap,
) {
  const historyRows = items
    .map((item) => {
      const asset = mapSymbolToNyOpenFlowAsset(item.symbol);
      if (!asset) return null;
      const history = (nyOpenFlowHistoryByAsset[asset] ?? []).slice(0, 5);
      return history.length ? { item, asset, history } : null;
    })
    .filter(
      (row): row is { item: ActusOpportunityOutput; asset: NyOpenFlowAsset; history: NyOpenFlowHistorySnapshot[] } =>
        Boolean(row),
    );

  const displayRows = items.reduce<NyOpenFlowDisplayRow[]>((rows, item) => {
      const asset = mapSymbolToNyOpenFlowAsset(item.symbol);
      if (!asset) return rows;
      const flow = nyOpenFlowByAsset[asset] ?? null;
      if (flow?.ready) {
        rows.push({
          item,
          asset,
          mode: "current" as const,
          label: flow.label,
          buyVolume: flow.buyVolume,
          sellVolume: flow.sellVolume,
          balancePct: flow.balancePct,
          subtitle: "13:30-14:00 UTC",
        });
        return rows;
      }
      const latestHistory = (nyOpenFlowHistoryByAsset[asset] ?? [])[0] ?? null;
      if (!latestHistory) {
        return rows;
      }
      rows.push({
        item,
        asset,
        mode: "history" as const,
        label: latestHistory.label,
        buyVolume: latestHistory.buyVolume,
        sellVolume: latestHistory.sellVolume,
        balancePct: latestHistory.balancePct,
        subtitle: `Last completed ${latestHistory.date}`,
      });
      return rows;
    }, []);

  if (!displayRows.length && !historyRows.length) {
    return null;
  }

  return (
    <section style={{ background: "linear-gradient(145deg, rgba(10,17,31,0.98), rgba(7,12,22,0.96))", border: "1px solid rgba(132,151,186,0.16)", borderRadius: 26, padding: 18, boxShadow: "inset 0 1px 0 rgba(255,255,255,0.03)", display: "grid", gap: 12 }}>
      <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "center", flexWrap: "wrap" }}>
        <div>
          <div style={{ fontSize: 11, color: "#7f8da8", letterSpacing: "0.12em", textTransform: "uppercase" }}>NY Open 30m Flow Balance</div>
          <div style={{ marginTop: 6, fontSize: 14, color: "#9aabc8", lineHeight: 1.5 }}>
            Display-only session context from aggressive buy/sell volume between 13:30 and 14:00 UTC.
          </div>
        </div>
        {badge(`${Math.max(displayRows.length, historyRows.length)} assets`, "#d7e1f4", "rgba(255,255,255,0.03)", "rgba(142,160,191,0.14)")}
      </div>
      {displayRows.length ? (
        <div style={{ display: "grid", gap: 10 }}>
          {displayRows.map(({ item, mode, label, buyVolume, sellVolume, balancePct, subtitle }) => (
            <div key={`ny-open-flow-${item.symbol}`} style={{ padding: "13px 14px", background: "linear-gradient(180deg, rgba(12,17,30,0.74), rgba(6,9,17,0.88))", borderRadius: 16, border: "1px solid rgba(118,138,176,0.12)", display: "grid", gap: 10 }}>
              <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "center", flexWrap: "wrap" }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                  <div style={{ fontSize: 15, fontWeight: 700, color: "#f4f7fb" }}>{item.symbol}</div>
                  {badge(label ?? "Balanced", nyOpenFlowAccent({ label, balancePct }), "rgba(255,255,255,0.03)", "rgba(142,160,191,0.18)")}
                  {mode === "history"
                    ? badge("Last Completed", "#9fb0cb", "rgba(255,255,255,0.03)", "rgba(142,160,191,0.14)")
                    : null}
                </div>
                <div style={{ fontSize: 11, color: "#8ea0bf", letterSpacing: "0.08em", textTransform: "uppercase" }}>
                  {subtitle}
                </div>
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(4, minmax(0, 1fr))", gap: 8 }}>
                {metricCard("Buy Volume", formatNyOpenFlowVolume(buyVolume), "Aggressive buys", "#45ffb5")}
                {metricCard("Sell Volume", formatNyOpenFlowVolume(sellVolume), "Aggressive sells", "#ff8ea8")}
                {metricCard("Net %", formatNyOpenFlowPercent(balancePct), "Buy - sell / total", nyOpenFlowAccent({ label, balancePct }))}
                {metricCard("Flow", label ?? "Balanced", item.displayName, nyOpenFlowAccent({ label, balancePct }))}
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div style={{ padding: "13px 14px", background: "linear-gradient(180deg, rgba(12,17,30,0.74), rgba(6,9,17,0.88))", borderRadius: 16, border: "1px solid rgba(118,138,176,0.12)", fontSize: 14, color: "#9aabc8", lineHeight: 1.5 }}>
          Current-session NY Open Flow will appear after the 13:30-14:00 UTC window completes. Historical records remain visible below.
        </div>
      )}
      {historyRows.length ? (
        <div style={{ display: "grid", gap: 10 }}>
          <div style={{ fontSize: 11, color: "#7f8da8", letterSpacing: "0.12em", textTransform: "uppercase", paddingTop: 4 }}>Recent NY Open Flow History</div>
          <div style={{ display: "grid", gap: 10 }}>
            {historyRows.map(({ item, asset, history }) => (
              <div
                key={`ny-open-flow-history-${item.symbol}`}
                style={{
                  padding: "13px 14px",
                  background: "linear-gradient(180deg, rgba(12,17,30,0.74), rgba(6,9,17,0.88))",
                  borderRadius: 16,
                  border: "1px solid rgba(118,138,176,0.12)",
                  display: "grid",
                  gap: 8,
                }}
              >
                <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "center", flexWrap: "wrap" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                    <div style={{ fontSize: 15, fontWeight: 700, color: "#f4f7fb" }}>{item.symbol}</div>
                    {badge("History", "#d7e1f4", "rgba(255,255,255,0.03)", "rgba(142,160,191,0.14)")}
                  </div>
                  <div style={{ fontSize: 11, color: "#8ea0bf", letterSpacing: "0.08em", textTransform: "uppercase" }}>
                    Last {history.length} sessions
                  </div>
                </div>
                <div style={{ display: "grid", gap: 6 }}>
                  {history.map((entry) => (
                    <div
                      key={`${asset}-${entry.date}`}
                      style={{
                        display: "grid",
                        gridTemplateColumns: "minmax(0, 110px) minmax(0, 1fr) auto",
                        gap: 10,
                        alignItems: "center",
                        padding: "9px 10px",
                        borderRadius: 12,
                        background: "rgba(255,255,255,0.018)",
                        border: "1px solid rgba(142,160,191,0.08)",
                      }}
                    >
                      <div style={{ fontSize: 12, color: "#d7e1f4", fontWeight: 600 }}>{entry.date}</div>
                      <div style={{ fontSize: 12, color: "#9aabc8" }}>{entry.label}</div>
                      <div style={{ fontSize: 12, color: nyOpenFlowAccent(entry), fontWeight: 700 }}>{formatNyOpenFlowPercent(entry.balancePct)}</div>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      ) : null}
    </section>
  );
}

function ghostButton(text: string, onClick: () => void, toneColor = "#8ea0bf") {
  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        border: `1px solid ${toneColor}33`,
        background: "linear-gradient(180deg, rgba(15,21,36,0.88), rgba(8,11,20,0.96))",
        color: toneColor,
        borderRadius: 999,
        padding: "8px 12px",
        cursor: "pointer",
        fontSize: 11,
        letterSpacing: "0.08em",
        textTransform: "uppercase",
        boxShadow: `inset 0 1px 0 rgba(255,255,255,0.03), 0 0 18px ${toneColor}14`,
        fontWeight: 700,
      }}
    >
      {text}
    </button>
  );
}

function laneSummaryCard(label: string, value: string, detail: string, action: ActusAction) {
  const colors = tone(action);
  return (
    <div
      style={{
        background: `radial-gradient(circle at top right, ${colors.bg}, transparent 34%), linear-gradient(180deg, rgba(10,15,27,0.92), rgba(4,7,14,0.98))`,
        border: `1px solid ${colors.border}`,
        boxShadow: `inset 0 1px 0 rgba(255,255,255,0.04), inset 0 0 0 1px ${colors.bg}, 0 14px 34px rgba(0,0,0,0.22), 0 0 28px ${colors.bg}`,
        borderRadius: 18,
        padding: "14px 16px",
        position: "relative",
        overflow: "hidden",
      }}
    >
      <div
        style={{
          position: "absolute",
          inset: "0 0 auto 0",
          height: 3,
          background: colors.text,
          opacity: 0.72,
        }}
      />
      <div style={{ fontSize: 14, color: colors.text, letterSpacing: "0.12em", textTransform: "uppercase", fontWeight: 800 }}>{label}</div>
      <div style={{ marginTop: 8, fontSize: 24, fontWeight: 600, color: "#f4f7fb" }}>{value}</div>
      <div style={{ marginTop: 6, fontSize: 12, color: "#9aabc8", lineHeight: 1.5 }}>{detail}</div>
    </div>
  );
}

function formatStateTimer(minutes: number, nowTick: number) {
  const totalSeconds = Math.max(0, Math.floor(minutes * 60) + nowTick);
  const hours = Math.floor(totalSeconds / 3600);
  const mins = Math.floor((totalSeconds % 3600) / 60);
  const secs = totalSeconds % 60;

  if (hours > 0) {
    return `${hours}h ${String(mins).padStart(2, "0")}m ${String(secs).padStart(2, "0")}s`;
  }

  return `${mins}:${String(secs).padStart(2, "0")}`;
}

function isSolActusSymbol(symbol: string | null | undefined) {
  const normalized = symbol?.toUpperCase() ?? "";
  return normalized === "SOL" || normalized === "SOL/USD";
}

function resolveActusLiveAsset(item: Pick<ActusOpportunityOutput, "symbol" | "displayName"> | null, solView?: SolActusView) {
  if (!item) return null;
  const normalizedSymbol = item.symbol.toUpperCase();
  const normalizedName = item.displayName.toUpperCase();

  if (normalizedSymbol === "NQ") return "NQ";
  if (normalizedSymbol === "CL" || normalizedSymbol === "OIL" || normalizedName.includes("CRUDE")) return "CL";
  if (normalizedSymbol === "GC" || normalizedSymbol === "XAU" || normalizedSymbol === "XAUUSD" || normalizedName.includes("GOLD")) return "GC";
  if (normalizedSymbol === "EUR/USD" || normalizedSymbol === "EURUSD" || normalizedName.includes("EURO")) return "6E";
  if (normalizedSymbol === "BTC" || normalizedSymbol === "BTC/USD") return "BTC";
  if (normalizedSymbol === "ETH" || normalizedSymbol === "ETH/USD") return "ETH";
  if (normalizedSymbol === "SOL" || normalizedSymbol === "SOL/USD") return solView === "cme-structure" ? "SOL_CME" : "SOL";

  return null;
}

function normalizeSolActusView(selection: ActusModeSelection | null | undefined): SolActusView {
  return selection?.solView === "cme-structure" ? "cme-structure" : "binance-execution";
}

function resolveActusModeSourceKey(item: Pick<ActusOpportunityOutput, "symbol" | "displayName"> | null, solView?: SolActusView) {
  if (!item) return null;
  return resolveActusLiveAsset(item, solView);
}

function resolveActusModeChartSymbol(item: Pick<ActusOpportunityOutput, "symbol"> | null, solView?: SolActusView) {
  if (!item) return "";
  return isSolActusSymbol(item.symbol) && solView === "cme-structure" ? "SOL_CME" : item.symbol;
}

function actusModeSelectionSymbolCandidates(symbol: string) {
  const normalized = typeof symbol === "string" ? symbol.toUpperCase() : "";
  if (normalized === "BTC" || normalized === "BTC/USD" || normalized === "MBT") return ["BTC/USD", "BTC"];
  if (normalized === "ETH" || normalized === "ETH/USD") return ["ETH/USD", "ETH"];
  if (normalized === "SOL" || normalized === "SOL/USD") return ["SOL/USD", "SOL"];
  if (normalized === "XAU" || normalized === "XAU/USD" || normalized === "GC") return ["XAU/USD", "XAU", "GC"];
  if (normalized === "CL" || normalized === "OIL") return ["CL", "OIL"];
  if (normalized === "EUR" || normalized === "EUR/USD" || normalized === "EURUSD" || normalized === "6E") return ["EUR/USD", "EUR", "6E"];
  if (normalized === "NQ") return ["NQ"];
  return [symbol];
}

function isDatabentoLiveAsset(asset: ActusLiveAsset | null): asset is DatabentoCoreAsset {
  return asset === "NQ" || asset === "GC" || asset === "CL" || asset === "6E" || asset === "BTC" || asset === "SOL_CME";
}

function buildReplaySafeDeltaSignal(symbol: string): DeltaSignal {
  const normalized = symbol.toUpperCase();
  const supported =
    normalized === "NQ" ||
    normalized === "GC" ||
    normalized === "XAU" ||
    normalized === "XAU/USD" ||
    normalized === "XAUUSD" ||
    normalized === "CL" ||
    normalized === "OIL" ||
    normalized === "EUR" ||
    normalized === "EUR/USD" ||
    normalized === "EURUSD" ||
    normalized === "6E" ||
    normalized === "BTC" ||
    normalized === "BTC/USD" ||
    normalized === "ETH" ||
    normalized === "ETH/USD" ||
    normalized === "SOL_CME" ||
    normalized === "SOL-CME" ||
    normalized === "SOL" ||
    normalized === "SOL/USD";

  return {
    deltaAvailability: supported ? "UNAVAILABLE" : "UNSUPPORTED",
    deltaSupportedAsset: supported,
    deltaSourceAvailable: false,
    deltaDirectionalAvailable: false,
    bias: "NEUTRAL",
    strength: 0,
    condition: "NEUTRAL",
    source: null,
    updatedAt: null,
  };
}

function replaySpeedLabel(speed: number) {
  if (speed <= 500) return "4x";
  if (speed <= 900) return "2x";
  return "1x";
}

function normalizeLiveCandle(candle: LiveDatabentoCandle, asset: ActusLiveAsset, timeframe: TimeframeFilter): NormalizedFuturesCandle | null {
  const open = candle.open ?? candle.o ?? null;
  const high = candle.high ?? candle.h ?? null;
  const low = candle.low ?? candle.l ?? null;
  const close = candle.close ?? candle.c ?? candle.open ?? candle.o ?? null;
  const timestamp = candle.timestamp ?? null;

  if (
    typeof open !== "number" ||
    typeof high !== "number" ||
    typeof low !== "number" ||
    typeof close !== "number" ||
    !Number.isFinite(open) ||
    !Number.isFinite(high) ||
    !Number.isFinite(low) ||
    !Number.isFinite(close) ||
    !timestamp
  ) {
    return null;
  }

  return {
    asset,
    symbol: asset,
    timeframe,
    timestamp,
    open,
    high,
    low,
    close,
    volume: typeof candle.volume === "number" && Number.isFinite(candle.volume) ? candle.volume : 0,
  };
}

function actusSafeHistoryEndIso(timeframe: TimeframeFilter) {
  const boundary = closedCandleBoundaryMs(timeframe, Date.now());
  return new Date(Math.max(boundary - 1, 0)).toISOString();
}

function actusTargetBars(timeframe: TimeframeFilter) {
  const minimumHistory = minimumActusHistoryCandles();
  if (timeframe === "1m") return Math.max(minimumHistory + 40, 240);
  if (timeframe === "5m") return Math.max(minimumHistory + 20, 220);
  if (timeframe === "15m") return Math.max(minimumHistory, 200);
  return Math.max(minimumHistory - 20, 180);
}

function actusReplayHistoryLimit(timeframe: TimeframeFilter) {
  if (timeframe === "1m") return 720;
  if (timeframe === "5m") return 480;
  if (timeframe === "15m") return 320;
  return 180;
}

function actusLookbackWindowHours(asset: DatabentoCoreAsset, timeframe: TimeframeFilter) {
  if (asset === "GC" && timeframe === "1m") return [48, 96, 168, 336];
  if (asset === "GC" && timeframe === "5m") return [96, 168, 336, 504];
  if (asset === "GC" && timeframe === "15m") return [240, 480, 720, 1440];
  if (asset === "GC" && timeframe === "1h") return [1440, 2160, 4320, 6480];
  if (asset === "6E" && timeframe === "1m") return [12, 24, 48, 96];
  if (asset === "6E" && timeframe === "5m") return [72, 144, 240, 480];
  if (asset === "6E" && timeframe === "15m") return [168, 336, 504, 1008];
  if (asset === "6E" && timeframe === "1h") return [720, 1440, 2160, 4320];
  if (timeframe === "1m") return [6, 12, 24, 48];
  if (timeframe === "5m") return [48, 96, 168, 336];
  if (timeframe === "15m") return [120, 240, 480, 720];
  return [720, 1440, 2160, 4320];
}

function actusSparseFeedWindowMultiplier(asset: DatabentoCoreAsset) {
  if (asset === "GC") return 1.5;
  if (asset === "6E") return 1.2;
  return 1;
}

function actusAdaptiveHistoryStartIso(endIso: string, windowHours: number) {
  const endMs = Date.parse(endIso);
  return new Date(endMs - windowHours * 60 * 60 * 1000).toISOString();
}

function sortActusCandles(candles: NormalizedFuturesCandle[]) {
  return candles
    .slice()
    .sort((a, b) => Date.parse(a.timestamp) - Date.parse(b.timestamp));
}

function supportsActusIntradayDensification(asset: ActusLiveAsset, timeframe: TimeframeFilter) {
  return (asset === "NQ" || asset === "GC" || asset === "CL" || asset === "6E") && (timeframe === "1m" || timeframe === "5m" || timeframe === "15m");
}

function actusMaxFlatFillGapBuckets(timeframe: TimeframeFilter) {
  if (timeframe === "1m") return 3;
  if (timeframe === "5m") return 2;
  if (timeframe === "15m") return 1;
  return 0;
}

function trimActusIntradayWindow(
  candles: NormalizedFuturesCandle[],
  timeframe: TimeframeFilter,
  targetBars: number,
) {
  if (!candles.length) {
    return candles;
  }

  const sorted = sortActusCandles(candles);
  const durationMs = actusTimeframeDurationMs(timeframe);
  const maxGapBuckets = actusMaxFlatFillGapBuckets(timeframe);
  let activeStartIndex = Math.max(0, sorted.length - targetBars);

  for (let index = sorted.length - 1; index > 0; index -= 1) {
    const currentMs = Date.parse(sorted[index].timestamp);
    const previousMs = Date.parse(sorted[index - 1].timestamp);
    if (!Number.isFinite(currentMs) || !Number.isFinite(previousMs)) {
      continue;
    }

    const missingBuckets = Math.round((currentMs - previousMs) / durationMs) - 1;
    if (missingBuckets > maxGapBuckets) {
      activeStartIndex = index;
      break;
    }
  }

  return sorted.slice(activeStartIndex);
}

function densifySparseActusCandles(
  candles: NormalizedFuturesCandle[],
  asset: DatabentoCoreAsset,
  timeframe: TimeframeFilter,
  targetBars: number,
) {
  if (!supportsActusIntradayDensification(asset, timeframe) || !candles.length) {
    return candles;
  }

  const sorted = trimActusIntradayWindow(candles, timeframe, targetBars);
  const durationMs = actusTimeframeDurationMs(timeframe);
  const lastTimestampMs = Date.parse(sorted[sorted.length - 1].timestamp);
  if (!Number.isFinite(lastTimestampMs)) {
    return sorted;
  }

  const firstWindowTimestampMs = lastTimestampMs - durationMs * (targetBars - 1);
  const byTimestamp = new Map(sorted.map((candle) => [Date.parse(candle.timestamp), candle] as const));
  const maxGapBuckets = actusMaxFlatFillGapBuckets(timeframe);
  const firstActualInWindow =
    sorted.find((candle) => {
      const timestampMs = Date.parse(candle.timestamp);
      return Number.isFinite(timestampMs) && timestampMs >= firstWindowTimestampMs;
    }) ?? sorted[0];
  const firstActualTimestampMs = Date.parse(firstActualInWindow.timestamp);

  if (!Number.isFinite(firstActualTimestampMs)) {
    return sorted;
  }

  let carry = firstActualInWindow.close;
  const densified: NormalizedFuturesCandle[] = [firstActualInWindow];

  for (let timestampMs = firstActualTimestampMs + durationMs; timestampMs <= lastTimestampMs; timestampMs += durationMs) {
    const actual = byTimestamp.get(timestampMs);
    if (actual) {
      carry = actual.close;
      densified.push(actual);
      continue;
    }

    let nextActualTimestampMs: number | null = null;
    for (let probe = timestampMs + durationMs; probe <= lastTimestampMs; probe += durationMs) {
      if (byTimestamp.has(probe)) {
        nextActualTimestampMs = probe;
        break;
      }
    }

    if (nextActualTimestampMs === null) {
      break;
    }

    const gapBuckets = Math.round((nextActualTimestampMs - timestampMs) / durationMs);
    if (gapBuckets > maxGapBuckets) {
      continue;
    }

    densified.push({
      asset: firstActualInWindow.asset,
      symbol: firstActualInWindow.symbol,
      timeframe: firstActualInWindow.timeframe,
      timestamp: new Date(timestampMs).toISOString(),
      open: carry,
      high: carry,
      low: carry,
      close: carry,
      volume: 0,
    });
  }

  return densified;
}

function mergeActusLiveCandleSeries(
  currentCandles: NormalizedFuturesCandle[] | null,
  incoming: NormalizedFuturesCandle,
  asset: ActusLiveAsset,
  timeframe: TimeframeFilter,
  historyLimit: number,
) {
  const base = sortActusCandles((currentCandles ?? []).filter((candle) => candle.timestamp !== incoming.timestamp));
  const lastExisting = base[base.length - 1] ?? null;

  if (supportsActusIntradayDensification(asset, timeframe) && lastExisting) {
    const durationMs = actusTimeframeDurationMs(timeframe);
    const lastMs = Date.parse(lastExisting.timestamp);
    const nextMs = Date.parse(incoming.timestamp);
    const maxGapBuckets = actusMaxFlatFillGapBuckets(timeframe);

    if (
      Number.isFinite(lastMs) &&
      Number.isFinite(nextMs) &&
      nextMs - lastMs > durationMs &&
      (nextMs - lastMs) / durationMs - 1 <= maxGapBuckets
    ) {
      let carry = lastExisting.close;
      for (let ts = lastMs + durationMs; ts < nextMs; ts += durationMs) {
        base.push({
          asset: incoming.asset,
          symbol: incoming.symbol,
          timeframe: incoming.timeframe,
          timestamp: new Date(ts).toISOString(),
          open: carry,
          high: carry,
          low: carry,
          close: carry,
          volume: 0,
        });
      }
    }
  }

  const merged = sortActusCandles([...base, incoming]);
  return merged.slice(-historyLimit);
}

function evolveActusActiveCandleFromLivePrice(
  currentCandles: NormalizedFuturesCandle[] | null,
  args: {
    asset: ActusLiveAsset;
    timeframe: TimeframeFilter;
    livePrice: number | null;
    updatedAt: string | null;
  },
) {
  const { asset, timeframe, livePrice, updatedAt } = args;
  if (!currentCandles?.length || typeof livePrice !== "number" || !Number.isFinite(livePrice) || !updatedAt) {
    return currentCandles;
  }

  const updatedAtMs = Date.parse(updatedAt);
  if (!Number.isFinite(updatedAtMs)) {
    return currentCandles;
  }

  const bucketStartMs = closedCandleBoundaryMs(timeframe, updatedAtMs);
  const lastIndex = currentCandles.length - 1;
  const lastCandle = currentCandles[lastIndex];
  const lastTimestampMs = Date.parse(lastCandle.timestamp);
  if (!Number.isFinite(lastTimestampMs) || lastTimestampMs !== bucketStartMs) {
    return currentCandles;
  }

  const nextClose = livePrice;
  const nextCandle: NormalizedFuturesCandle = {
    ...lastCandle,
    asset,
    symbol: asset,
    close: nextClose,
    high: Math.max(lastCandle.high, nextClose),
    low: Math.min(lastCandle.low, nextClose),
  };

  if (
    nextCandle.close === lastCandle.close &&
    nextCandle.high === lastCandle.high &&
    nextCandle.low === lastCandle.low
  ) {
    return currentCandles;
  }

  return [...currentCandles.slice(0, lastIndex), nextCandle];
}

async function ensureActusCandleDepth(args: {
  asset: DatabentoCoreAsset;
  displaySymbol: string;
  timeframe: TimeframeFilter;
  historyLimit: number;
}) {
  const { asset, displaySymbol, timeframe, historyLimit } = args;
  void displaySymbol;
  const targetBars = actusTargetBars(timeframe);
  const end = actusSafeHistoryEndIso(timeframe);
  const requestLimit = Math.max(historyLimit, targetBars);
  const sparseFeedMultiplier = actusSparseFeedWindowMultiplier(asset);
  const attempts: Array<{ stage: string; count: number; first: string | null; last: string | null }> = [];

  const fetchAttempt = async (stage: string, start?: string) => {
    const candles = await fetchDatabentoFuturesHistory({
      asset,
      timeframe,
      limit: requestLimit,
      start,
      end,
    });
    attempts.push({
      stage,
      count: candles.length,
      first: candles[0]?.timestamp ?? null,
      last: candles[candles.length - 1]?.timestamp ?? null,
    });
    return candles;
  };

  let best = await fetchAttempt("initial");

  if (best.length < targetBars) {
    for (const windowHours of actusLookbackWindowHours(asset, timeframe)) {
      const widenedWindowHours = Math.ceil(windowHours * sparseFeedMultiplier);
      const widened = await fetchAttempt(
        `retry-${widenedWindowHours}h`,
        actusAdaptiveHistoryStartIso(end, widenedWindowHours),
      );
      if (widened.length > best.length) {
        best = widened;
      }
      if (best.length >= targetBars) {
        break;
      }
    }
  }

  const finalCandles = best.slice(-historyLimit);
  const semanticCandles = densifySparseActusCandles(finalCandles, asset, timeframe, historyLimit);

  return semanticCandles;
}

function buildSparklineFallbackCandles(item: ActusOpportunityOutput): NormalizedFuturesCandle[] | null {
  if (!hasRenderableActusSparkline(item.sparkline)) {
    return null;
  }

  const durationMs = actusTimeframeDurationMs(item.timeframe);
  const endBoundary = closedCandleBoundaryMs(item.timeframe, Date.now());
  const firstBarTime = endBoundary - durationMs * (item.sparkline.length - 1);

  return item.sparkline.map((close, index) => {
    const previousClose = index > 0 ? item.sparkline[index - 1] : close;
    const open = previousClose;
    const high = Math.max(open, close);
    const low = Math.min(open, close);

    return {
      asset: item.symbol,
      symbol: item.symbol,
      timeframe: item.timeframe,
      timestamp: new Date(firstBarTime + durationMs * index).toISOString(),
      open,
      high,
      low,
      close,
      volume: 0,
    };
  });
}

function supportsSparklineBootstrap(asset: ActusLiveAsset | null) {
  return asset !== "ETH" && asset !== "SOL" && asset !== "SOL_CME";
}

async function fetchActusSourceHistory(args: {
  asset: Extract<ActusLiveAsset, "ETH" | "SOL">;
  timeframe: TimeframeFilter;
  limit: number;
}) {
  const url = new URL(`${API_BASE}/api/actus/source-history`);
  url.searchParams.set("asset", args.asset);
  url.searchParams.set("timeframe", args.timeframe);
  url.searchParams.set("limit", String(args.limit));
  const response = await fetch(url.toString());
  const payload = (await response.json()) as ActusSourceHistoryResponse;
  if (!response.ok || !payload?.ok) {
    throw new Error(payload?.error ?? "ACTUS source history request failed");
  }
  return sortActusCandles((payload.candles ?? []).filter((candle) => Number.isFinite(Date.parse(candle.timestamp))));
}

function hasRenderableActusCandles(candles: NormalizedFuturesCandle[] | null | undefined) {
  return Boolean(
    candles &&
      candles.length >= 8 &&
      candles.every(
        (candle) =>
          Number.isFinite(candle.open) &&
          Number.isFinite(candle.high) &&
          Number.isFinite(candle.low) &&
          Number.isFinite(candle.close) &&
          candle.open > 0 &&
          candle.high > 0 &&
          candle.low > 0 &&
          candle.close > 0,
      ),
  );
}

function hasRenderableActusSparkline(points: number[] | null | undefined): points is number[] {
  return Boolean(points && points.length >= 8 && points.every((point) => Number.isFinite(point)) && points.some((point) => point > 0));
}

function displayLocation(location: string) {
  if (location === "near-ema") return "Fair Value";
  if (location === "session-high") return "Premium Zone";
  if (location === "session-low") return "Discount Zone";
  if (location === "opening-range") return "Opening Structure";
  if (location === "first-hour") return "Opening Control";
  if (location === "extended") return "Stretched";
  if (location === "mid-range") return "Neutral Zone";
  return location.replace("-", " ");
}

function displayState(state: ActusOpportunityOutput["state"]) {
  if (state === "execute") return "Actionable";
  if (state === "building") return "Building";
  if (state === "watching") return "Watching";
  if (state === "waiting") return "Waiting";
  if (state === "invalidated") return "Invalidated";
  if (state === "exhaustion") return "Late";
  return state.replace("-", " ");
}

function displayRisk(risk: ActusOpportunityOutput["riskState"]) {
  if (risk === "clean") return "Clean";
  if (risk === "crowded") return "Crowded";
  if (risk === "late") return "Too Late";
  return "Unstable";
}

function perceivedFreshnessState(item: ActusOpportunityOutput) {
  const score = item.freshnessScore ?? null;
  if (item.freshnessState === "stale") return "Stale";
  if (item.freshnessState === "aging") return "Aging";
  if (score !== null && score <= 35) return "Aging";
  return "Fresh";
}

function freshnessTone(freshnessState?: ActusOpportunityOutput["freshnessState"]) {
  if (freshnessState === "stale") return "#ff9c9c";
  if (freshnessState === "aging") return "#f5c86a";
  return "#d7e1f4";
}

function freshnessDetail(item: ActusOpportunityOutput, nowTick: number) {
  const elapsed = `${formatStateTimer(item.stateAgeMinutes, nowTick)} elapsed`;
  const health =
    typeof item.freshnessScore === "number"
      ? item.freshnessScore <= 20
        ? "spent"
        : item.freshnessScore <= 40
          ? "weakening"
          : "strong"
      : null;

  if (item.tooLateFlag && health) return `${elapsed} • ${health} • late-state penalty`;
  if (item.tooLateFlag) return `${elapsed} • late-state penalty`;
  if (health) return `${elapsed} • ${health}`;
  return elapsed;
}

function actusLiveStatus(status: ActusExecutionState) {
  if (status === "active") return "IN TRADE";
  if (status === "ready") return "READY";
  if (status === "building") return "BUILDING";
  if (status === "weakening") return "WEAKENING";
  if (status === "exit_soon") return "EXIT SOON";
  if (status === "too_late") return "TOO LATE";
  if (status === "invalidated") return "INVALIDATED";
  return "WAITING";
}

function actusStatusTone(status: ReturnType<typeof actusLiveStatus>) {
  if (status === "IN TRADE") return { text: "#3ef0a6", bg: "rgba(62,240,166,0.08)", border: "rgba(62,240,166,0.22)" };
  if (status === "READY") return { text: "#f5c86a", bg: "rgba(245,200,106,0.08)", border: "rgba(245,200,106,0.22)" };
  if (status === "BUILDING") return { text: "#67b7ff", bg: "rgba(103,183,255,0.08)", border: "rgba(103,183,255,0.22)" };
  if (status === "WEAKENING") return { text: "#ffb26b", bg: "rgba(255,178,107,0.08)", border: "rgba(255,178,107,0.22)" };
  if (status === "EXIT SOON") return { text: "#ff7b7b", bg: "rgba(255,123,123,0.1)", border: "rgba(255,123,123,0.28)" };
  if (status === "TOO LATE") return { text: "#ff8ea8", bg: "rgba(255,142,168,0.08)", border: "rgba(255,142,168,0.24)" };
  if (status === "INVALIDATED") return { text: "#ff8ea8", bg: "rgba(255,142,168,0.08)", border: "rgba(255,142,168,0.24)" };
  return { text: "#c6d4ef", bg: "rgba(198,212,239,0.06)", border: "rgba(198,212,239,0.16)" };
}

function actusReadTitle(status: ActusExecutionState) {
  if (status === "active" || status === "weakening" || status === "exit_soon") return "Execution Read";
  if (status === "ready" || status === "building") return "Decision Read";
  if (status === "invalidated") return "Status Read";
  return "Market Read";
}

function compactExecutionRead(item: ActusOpportunityOutput) {
  return item.whyItMatters
    .slice(0, 4)
    .map((reason) =>
      reason
        .replace(/\.$/, "")
        .replace(/^Directional control and momentum are aligned$/i, "Control aligned")
        .replace(/^Price is still close enough to the decision zone to act cleanly$/i, "At trigger")
        .replace(/^The setup is interesting, but it still needs confirmation$/i, "Confirmation pending")
        .replace(/^The setup is aging and needs progress soon$/i, "Losing urgency")
        .replace(/^The setup has gone stale for this timeframe$/i, "Dead setup")
        .replace(/^Price is lingering near trigger without confirmation$/i, "Hovering near trigger")
        .replace(/^The setup is not progressing toward confirmation$/i, "No progress")
        .replace(/^Directional control is still mixed$/i, "Control mixed")
        .replace(/^Price is still sitting in a neutral decision zone$/i, "Neutral zone")
        .replace(/^The current structure does not justify pressing yet$/i, "Do not trade")
        .replace(/^Structure remains clean enough for an actionable read$/i, "Structure clean")
        .replace(/^The structure has already broken the invalidation level$/i, "Invalidated")
    )
    .filter(Boolean);
}

function watchRiskLines(item: ActusOpportunityOutput) {
  const lines = [
    ...(item.warnings ?? []).slice(0, 2).map((line) => line.replace(/\.$/, "")),
    item.tooLateFlag ? item.invalidationLine.replace(/^Invalid/i, "Too late").replace(/\.$/, "") : null,
    item.riskState === "late" && !item.tooLateFlag ? "Exit soon if momentum fails" : null,
    item.riskState === "unstable" ? "Weak if structure loses control" : null,
  ].filter(Boolean);

  return lines.slice(0, 2);
}

function gammaBiasTone(bias: GammaOverlay["bias"]) {
  if (bias === "LONG") return "#3ef0a6";
  if (bias === "SHORT") return "#ff8ea8";
  return "#d7e1f4";
}

function gammaConditionTone(condition: GammaOverlay["condition"]) {
  if (condition === "BREAKOUT") return "#67b7ff";
  if (condition === "TRAP") return "#ffb26b";
  return "#d7e1f4";
}

function positioningTypeTone(type: ActusPositioning["positioningType"]) {
  if (type === "REAL_GAMMA") return "#3ef0a6";
  if (type === "POSITIONING_PROXY") return "#67b7ff";
  return "#9fb0cb";
}

function hasFiniteGammaExposureValue(value: number | null | undefined) {
  return typeof value === "number" && Number.isFinite(value);
}

function gammaExposureState(positioning: ActusPositioning | null, gammaOverlay: GammaOverlay | null) {
  const sourceAvailable = Boolean(gammaOverlay?.source) || Boolean(positioning?.gammaSourceAvailable);
  const upper = positioning?.levels?.upper ?? gammaOverlay?.callWall ?? null;
  const lower = positioning?.levels?.lower ?? gammaOverlay?.putWall ?? null;
  const anchor = positioning?.levels?.anchor ?? gammaOverlay?.anchor ?? gammaOverlay?.gammaFlip ?? null;
  const gammaFlip = gammaOverlay?.gammaFlip ?? null;
  const levelsAvailable =
    Boolean(positioning?.gammaLevelsAvailable) ||
    hasFiniteGammaExposureValue(upper) ||
    hasFiniteGammaExposureValue(lower) ||
    hasFiniteGammaExposureValue(anchor) ||
    hasFiniteGammaExposureValue(gammaFlip);
  const directionalAvailable =
    Boolean(positioning?.gammaDirectionalAvailable) || hasFiniteGammaExposureValue(gammaFlip);

  if (sourceAvailable && levelsAvailable && directionalAvailable) {
    return {
      label: "Gamma: Directional",
      color: "#d7ffea",
      background: "rgba(69,255,181,0.12)",
      border: "rgba(69,255,181,0.3)",
      summary: "Real gamma exposure is visible, and directional levels are available to the decision layer.",
    };
  }

  if (sourceAvailable && levelsAvailable) {
    return {
      label: "Gamma: Levels Active",
      color: "#d8e7ff",
      background: "rgba(103,183,255,0.11)",
      border: "rgba(103,183,255,0.24)",
      summary: "Real gamma exposure is visible, but the structure is not directional enough for an active edge.",
    };
  }

  if (sourceAvailable) {
    return {
      label: "Gamma: Source Only",
      color: "#d8e7ff",
      background: "rgba(103,183,255,0.08)",
      border: "rgba(103,183,255,0.2)",
      summary: "A real gamma source is active, but no honest levels are resolved yet.",
    };
  }

  if (positioning?.positioningType === "POSITIONING_PROXY") {
    return {
      label: "Positioning: Proxy",
      color: "#c8dcff",
      background: "rgba(103,183,255,0.09)",
      border: "rgba(103,183,255,0.22)",
      summary: "No real gamma levels are resolved, so proxy positioning is guiding the decision surface.",
    };
  }

  return {
    label: "Positioning: Unavailable",
    color: "#b8c7df",
    background: "rgba(255,255,255,0.035)",
    border: "rgba(142,160,191,0.16)",
    summary: "No honest options positioning source is available right now.",
  };
}

function gammaExposureSourceLabel(gammaOverlay: GammaOverlay | null) {
  if (!gammaOverlay?.source) return "Not resolved";
  if (gammaOverlay.source === "deribit-btc-option-chain") return "Deribit BTC";
  if (gammaOverlay.source === "deribit-eth-option-chain") return "Deribit ETH";
  if (gammaOverlay.source === "deribit-sol-option-chain") return "Deribit SOL";
  if (gammaOverlay.source === "nq-option-chain" || gammaOverlay.source === "databento-nq-option-chain") return "Databento NQ";
  if (gammaOverlay.source === "6e-option-chain") return "Databento 6E";
  if (gammaOverlay.source === "gc-option-chain") return "Databento GC";
  if (gammaOverlay.source === "cl-option-chain") return "Databento CL";
  return gammaOverlay.source;
}

function gammaExposureDetail(positioning: ActusPositioning | null, gammaOverlay: GammaOverlay | null) {
  const upper = positioning?.levels?.upper ?? gammaOverlay?.callWall ?? null;
  const lower = positioning?.levels?.lower ?? gammaOverlay?.putWall ?? null;
  const anchor = positioning?.levels?.anchor ?? gammaOverlay?.anchor ?? gammaOverlay?.gammaFlip ?? null;
  const gammaFlip = gammaOverlay?.gammaFlip ?? null;

  if (hasFiniteGammaExposureValue(upper) && hasFiniteGammaExposureValue(lower) && hasFiniteGammaExposureValue(gammaFlip)) {
    return "Walls and flip resolved";
  }
  if (hasFiniteGammaExposureValue(upper) || hasFiniteGammaExposureValue(lower) || hasFiniteGammaExposureValue(anchor)) {
    return "Levels visible, edge still incomplete";
  }
  if (gammaOverlay?.source) {
    return "Source active, structure still sparse";
  }
  return "Source unavailable";
}

function actionabilityState(positioning: ActusPositioning | null) {
  const confidence = positioning?.confidence ?? 0;
  const directional = positioning?.bias && positioning.bias !== "NEUTRAL";
  const condition = positioning?.condition ?? "MEAN_REVERSION";

  if (condition === "TRAP") {
    return {
      label: "Judgment: Defensive",
      color: "#ffd6dd",
      background: "rgba(255,142,168,0.11)",
      border: "rgba(255,142,168,0.24)",
      summary: "ACTUS sees structure, but the current condition is defensive rather than tradeable.",
    };
  }

  if (directional && confidence >= 0.6) {
    return {
      label: "Judgment: Strong",
      color: "#d7ffea",
      background: "rgba(69,255,181,0.12)",
      border: "rgba(69,255,181,0.28)",
      summary: "Actionability is strong enough to matter now, separate from the exposure map beneath it.",
    };
  }

  if (confidence >= 0.35) {
    return {
      label: "Judgment: Building",
      color: "#d8e7ff",
      background: "rgba(103,183,255,0.11)",
      border: "rgba(103,183,255,0.24)",
      summary: "Exposure is present, but ACTUS still treats the setup as developing rather than fully trade-ready.",
    };
  }

  return {
    label: "Judgment: Weak",
    color: "#f2e3bf",
    background: "rgba(255,202,112,0.1)",
    border: "rgba(255,202,112,0.2)",
    summary: "Exposure may exist, but current decision quality is still weak or incomplete.",
  };
}

function deltaAvailabilityTone(signal: DeltaSignal | null) {
  if (signal?.deltaAvailability === "DIRECTIONAL") {
    return {
      label: "Delta: Directional",
      color: "#d7ffea",
      background: "rgba(69,255,181,0.12)",
      border: "rgba(69,255,181,0.28)",
    };
  }
  if (signal?.deltaAvailability === "SOURCE_ONLY") {
    return {
      label: "Delta: Source Only",
      color: "#cfe0ff",
      background: "rgba(103,183,255,0.11)",
      border: "rgba(103,183,255,0.24)",
    };
  }
  if (signal?.deltaAvailability === "UNSUPPORTED") {
    return {
      label: "Delta: Unsupported",
      color: "#b9c6de",
      background: "rgba(132,151,186,0.08)",
      border: "rgba(132,151,186,0.18)",
    };
  }
  return {
    label: "Delta: Unavailable",
    color: "#d8c4cd",
    background: "rgba(255,111,145,0.08)",
    border: "rgba(255,111,145,0.16)",
  };
}

function deltaStrengthTone(signal: DeltaSignal | null) {
  const strength = signal?.strength ?? 0;
  if (signal?.deltaAvailability === "DIRECTIONAL" && strength >= 0.2) return "#3ef0a6";
  if (signal?.deltaAvailability === "DIRECTIONAL" && strength >= 0.12) return "#67b7ff";
  if (signal?.deltaAvailability === "SOURCE_ONLY") return "#9fc4ff";
  return "#c8d5ee";
}

function deltaStrengthLabel(signal: DeltaSignal | null) {
  if (!signal) return "Pending";
  if (signal.deltaAvailability === "UNSUPPORTED") return "Not tracked";
  if (signal.deltaAvailability === "UNAVAILABLE") return "No source";
  if (signal.deltaAvailability === "SOURCE_ONLY") {
    return signal.strength && signal.strength > 0 ? `${Math.round(signal.strength * 100)}% flow` : "Flow present";
  }
  return `${Math.round((signal.strength ?? 0) * 100)}%`;
}

function deltaSummary(signal: DeltaSignal | null) {
  if (!signal) return "Waiting for live delta evidence.";
  if (signal.deltaAvailability === "DIRECTIONAL") {
    return "Real directional delta exposure is visible for this asset.";
  }
  if (signal.deltaAvailability === "SOURCE_ONLY") {
    return "Real source flow is visible, but the current imbalance is still weak or non-directional.";
  }
  if (signal.deltaAvailability === "UNSUPPORTED") {
    return "Delta is not supported for this asset yet.";
  }
  return "No usable delta source is available right now.";
}

function positioningAvailabilityPill(positioning: ActusPositioning | null, gammaOverlay: GammaOverlay | null) {
  return gammaExposureState(positioning, gammaOverlay);
}

function positioningClassificationState(positioning: ActusPositioning | null, gammaOverlay: GammaOverlay | null) {
  const sourceAvailable = Boolean(gammaOverlay?.source) || Boolean(positioning?.gammaSourceAvailable);
  const upper = positioning?.levels?.upper ?? gammaOverlay?.callWall ?? null;
  const lower = positioning?.levels?.lower ?? gammaOverlay?.putWall ?? null;
  const anchor = positioning?.levels?.anchor ?? gammaOverlay?.anchor ?? gammaOverlay?.gammaFlip ?? null;
  const gammaFlip = gammaOverlay?.gammaFlip ?? null;
  const levelsAvailable =
    Boolean(positioning?.gammaLevelsAvailable) ||
    hasFiniteGammaExposureValue(upper) ||
    hasFiniteGammaExposureValue(lower) ||
    hasFiniteGammaExposureValue(anchor) ||
    hasFiniteGammaExposureValue(gammaFlip);

  if (sourceAvailable && levelsAvailable) {
    return {
      label: "REAL_GAMMA",
      tone: positioningTypeTone("REAL_GAMMA"),
      summary: "Real gamma source-backed positioning is resolved, even if the edge is still weak.",
    };
  }

  if (sourceAvailable) {
    return {
      label: "GAMMA_SOURCE_ONLY",
      tone: "#9fc4ff",
      summary: "A real gamma source is active, but positioning remains incomplete because honest levels are not resolved yet.",
    };
  }

  if (positioning?.positioningType === "POSITIONING_PROXY") {
    return {
      label: "POSITIONING_PROXY",
      tone: positioningTypeTone("POSITIONING_PROXY"),
      summary: "ACTUS is relying on indirect positioning context because no real gamma structure is resolved.",
    };
  }

  return {
    label: "UNAVAILABLE",
    tone: "#9fb0cb",
    summary: "No honest positioning source is available right now.",
  };
}

function buildActusChartGammaOverlay(
  item: ActusOpportunityOutput,
  positioning: ActusPositioning | null,
  gammaOverlay: GammaOverlay | null,
): GammaOverlay | null {
  if (!gammaOverlay?.source) {
    return null;
  }

  const upper = gammaOverlay?.callWall ?? positioning?.levels?.upper ?? null;
  const lower = gammaOverlay?.putWall ?? positioning?.levels?.lower ?? null;
  const anchor = gammaOverlay?.anchor ?? positioning?.levels?.anchor ?? gammaOverlay?.gammaFlip ?? null;
  const gammaFlip = gammaOverlay?.gammaFlip ?? null;
  const levelsAvailable =
    hasFiniteGammaExposureValue(upper) ||
    hasFiniteGammaExposureValue(lower) ||
    hasFiniteGammaExposureValue(anchor) ||
    hasFiniteGammaExposureValue(gammaFlip);
  const spotReference =
    typeof item.price === "number" && Number.isFinite(item.price)
      ? item.price
      : gammaOverlay?.spotReference ?? null;

  return {
    ...gammaOverlay,
    callWall: levelsAvailable ? upper : null,
    putWall: levelsAvailable ? lower : null,
    anchor: levelsAvailable ? anchor : null,
    gammaFlip: levelsAvailable ? gammaFlip : null,
    spotReference,
  };
}

function decisionPanelField(label: string, value: string, tone = "#f4f7fb") {
  return (
    <div
      style={{
        display: "grid",
        gap: 5,
        padding: "11px 12px 10px",
        borderRadius: 12,
        background: "linear-gradient(180deg, rgba(255,255,255,0.02), rgba(255,255,255,0.012))",
        border: "1px solid rgba(142,160,191,0.12)",
        boxShadow: "inset 0 1px 0 rgba(255,255,255,0.025)",
      }}
    >
      <div style={{ fontSize: 10, color: "#7f8da8", letterSpacing: "0.08em", textTransform: "uppercase" }}>{label}</div>
      <div style={{ fontSize: 14, fontWeight: 750, color: tone, letterSpacing: "0.01em", lineHeight: 1.2 }}>{value}</div>
    </div>
  );
}

function deltaPanelField(label: string, value: string, tone = "#f4f7fb", detail?: string) {
  return (
    <div
      style={{
        display: "grid",
        gap: 4,
        padding: "9px 11px 8px",
        borderRadius: 11,
        background: "linear-gradient(180deg, rgba(255,255,255,0.018), rgba(255,255,255,0.01))",
        border: "1px solid rgba(142,160,191,0.1)",
      }}
    >
      <div style={{ fontSize: 10, color: "#7f8da8", letterSpacing: "0.08em", textTransform: "uppercase" }}>{label}</div>
      <div style={{ fontSize: 13, fontWeight: 750, color: tone, letterSpacing: "0.01em", lineHeight: 1.15 }}>{value}</div>
      {detail ? <div style={{ fontSize: 11, color: "#8ea0bf", lineHeight: 1.3 }}>{detail}</div> : null}
    </div>
  );
}

function actusExecutionBlock(item: ActusOpportunityOutput, liveStatus: ReturnType<typeof actusLiveStatus>) {
  const entry = item.entry.toLocaleString();
  const invalidation = item.invalidation.toLocaleString();
  const isShort = item.direction === "short";
  const qualifier =
    item.riskState === "unstable"
      ? " (UNSTABLE)"
      : item.confidenceScore < 60
        ? " (LOW CONFIDENCE)"
        : "";

  if (liveStatus === "TOO LATE") {
    return {
      primary: "TOO LATE",
      secondary: `${isShort ? "Do not chase below" : "Do not chase above"} ${entry}${qualifier}`,
    };
  }

  if (liveStatus === "EXIT SOON") {
    return {
      primary: "PREPARE TO EXIT",
      secondary: `${isShort ? "Protect above" : "Protect below"} ${invalidation}`,
    };
  }

  if (liveStatus === "WEAKENING") {
    return {
      primary: "MANAGE TIGHTLY",
      secondary: `${isShort ? "Structure is soft below" : "Structure is soft above"} ${entry}${qualifier}`,
    };
  }

  if (liveStatus === "IN TRADE") {
    return {
      primary: isShort ? "SHORT ACTIVE" : "LONG ACTIVE",
      secondary: `${isShort ? "Below" : "Above"} ${entry}${qualifier}`,
    };
  }

  if (liveStatus === "READY") {
    return {
      primary: isShort ? "READY TO SHORT" : "READY TO BUY",
      secondary: `${isShort ? "Below" : "Above"} ${entry}${qualifier}`,
    };
  }

  if (liveStatus === "BUILDING") {
    return {
      primary: "BUILDING",
      secondary: `${isShort ? "Needs cleaner break below" : "Needs cleaner break above"} ${entry}${qualifier}`,
    };
  }

  return {
    primary: "DO NOT TRADE",
    secondary: `${isShort ? "Wait for break below" : "Wait for break above"} ${entry}${qualifier}`,
  };
}

function actusFreshnessTone(item: ActusOpportunityOutput) {
  const score = item.freshnessScore ?? 0;
  if (score <= 20) return "#ff9c9c";
  if (score <= 40) return "#f5c86a";
  return freshnessTone(item.freshnessState);
}

function actusFreshnessDetail(item: ActusOpportunityOutput, nowTick: number) {
  const elapsed = `${formatStateTimer(item.stateAgeMinutes, nowTick)} elapsed`;
  const score = item.freshnessScore ?? 0;

  if (score <= 20) return `${elapsed} • dead`;
  if (score <= 40) return `${elapsed} • uncertain`;
  return `${elapsed} • live`;
}

function actusTradeDelta(item: ActusOpportunityOutput) {
  const delta = item.direction === "short" ? item.entry - item.price : item.price - item.entry;
  const pct = item.entry ? (delta / item.entry) * 100 : 0;
  return {
    delta,
    pct,
    positive: delta >= 0,
  };
}

function actusStopDistance(item: ActusOpportunityOutput) {
  return Math.abs(item.price - item.invalidation);
}

function actusExecutionPrecision(symbol: string) {
  const normalized = symbol.toUpperCase();
  if (normalized === "EUR/USD" || normalized === "EURUSD" || normalized === "6E") {
    return 5;
  }
  return 2;
}

function formatActusExecutionValue(symbol: string, value: number) {
  const precision = actusExecutionPrecision(symbol);
  return value.toLocaleString(undefined, {
    minimumFractionDigits: precision,
    maximumFractionDigits: precision,
  });
}

function actusMomentumState(item: ActusOpportunityOutput) {
  const points = item.sparkline;
  if (points.length < 4) return "Stable";
  const recent = points[points.length - 1] - points[Math.max(0, points.length - 4)];
  const directionalRecent = item.direction === "short" ? -recent : recent;
  if (directionalRecent > Math.max(item.price * 0.001, 0.12)) return "Building";
  if (directionalRecent < -Math.max(item.price * 0.001, 0.12)) return "Weakening";
  return "Stable";
}

function buildSolCmeLiquidityIndicator(
  chartSymbol: string,
  chartCandles: NormalizedFuturesCandle[] | null,
  timeframe: TimeframeFilter,
) {
  if (chartSymbol !== "SOL_CME" || !chartCandles || chartCandles.length < 8) {
    return null;
  }

  const recentWindowSize = timeframe === "1m" ? 120 : timeframe === "5m" ? 96 : 64;
  const recent = chartCandles.slice(-recentWindowSize);
  if (recent.length < 8) {
    return null;
  }

  const timeframeMs = actusTimeframeDurationMs(timeframe);
  const firstMs = Date.parse(recent[0].timestamp);
  const lastMs = Date.parse(recent[recent.length - 1].timestamp);
  if (!Number.isFinite(firstMs) || !Number.isFinite(lastMs) || lastMs < firstMs) {
    return null;
  }

  const spanBuckets = Math.max(1, Math.round((lastMs - firstMs) / timeframeMs) + 1);
  const density = recent.length / spanBuckets;
  let maxGapBuckets = 0;

  for (let index = 1; index < recent.length; index += 1) {
    const previousMs = Date.parse(recent[index - 1].timestamp);
    const currentMs = Date.parse(recent[index].timestamp);
    if (!Number.isFinite(previousMs) || !Number.isFinite(currentMs)) {
      continue;
    }
    const gapBuckets = Math.max(0, Math.round((currentMs - previousMs) / timeframeMs) - 1);
    if (gapBuckets > maxGapBuckets) {
      maxGapBuckets = gapBuckets;
    }
  }

  if (density >= 0.78 && maxGapBuckets < 3) {
    return null;
  }

  return {
    label: "THIN PRINT ENVIRONMENT",
    detail: "CME SOL structure is valid, but recent prints are sparse by market nature.",
  };
}

function displaySetupType(setupType: ActusOpportunityOutput["setupType"]) {
  if (setupType === "Continuation") return "Continuation (Pullback Entry)";
  if (setupType === "Breakout") return "Breakout (Momentum Entry)";
  if (setupType === "Reclaim") return "Reclaim (Recovery Entry)";
  if (setupType === "Compression") return "Compression (Wait)";
  if (setupType === "Expansion") return "Expansion (Manage / Late)";
  if (setupType === "Reversal") return "Reversal (Fade / Caution)";
  return "No Setup";
}

function displayDirection(direction: ActusOpportunityOutput["direction"]) {
  if (direction === "long") return "LONG";
  if (direction === "short") return "SHORT";
  return "NEUTRAL";
}

function displaySession(session: string) {
  if (session === "overnight") return "Asia";
  if (session === "new-york") return "New York";
  if (session === "london") return "London";
  return "Asia";
}

function directionTone(direction: ActusOpportunityOutput["direction"]) {
  if (direction === "long") {
    return { text: "#3ef0a6", bg: "rgba(62,240,166,0.08)", border: "rgba(62,240,166,0.22)" };
  }
  if (direction === "short") {
    return { text: "#ff7b7b", bg: "rgba(255,123,123,0.08)", border: "rgba(255,123,123,0.22)" };
  }
  return { text: "#c6d4ef", bg: "rgba(198,212,239,0.08)", border: "rgba(198,212,239,0.16)" };
}

function stateTone(state: ActusOpportunityOutput["state"]) {
  if (state === "execute") {
    return { text: "#3ef0a6", bg: "rgba(62,240,166,0.12)", border: "rgba(62,240,166,0.28)" };
  }
  if (state === "building") {
    return { text: "#67b7ff", bg: "rgba(103,183,255,0.12)", border: "rgba(103,183,255,0.24)" };
  }
  if (state === "watching") {
    return { text: "#f5c86a", bg: "rgba(245,200,106,0.12)", border: "rgba(245,200,106,0.24)" };
  }
  if (state === "invalidated" || state === "exhaustion") {
    return { text: "#ff7b7b", bg: "rgba(255,123,123,0.12)", border: "rgba(255,123,123,0.24)" };
  }
  return { text: "#9aabc8", bg: "rgba(154,171,200,0.1)", border: "rgba(154,171,200,0.22)" };
}

function convictionTone(conviction: ActusOpportunityOutput["conviction"]) {
  if (conviction === "high") return "#3ef0a6";
  if (conviction === "medium") return "#f5c86a";
  return "#8ea0bf";
}

function riskToneValue(risk: ActusOpportunityOutput["riskState"]) {
  if (risk === "clean") return "#3ef0a6";
  if (risk === "crowded") return "#f5c86a";
  return "#ff7b7b";
}

function contextPill(label: string, value: string, accent: string) {
  return (
    <div
      style={{
        padding: "9px 11px",
        borderRadius: 12,
        background: "rgba(255,255,255,0.025)",
        border: "1px solid rgba(142,160,191,0.12)",
      }}
    >
      <div style={{ fontSize: 10, color: "#7f8da8", letterSpacing: "0.08em", textTransform: "uppercase" }}>{label}</div>
      <div style={{ marginTop: 5, fontSize: 13, fontWeight: 600, color: accent }}>{value}</div>
    </div>
  );
}

function loadingPanel(label: string, blocks: number) {
  return (
    <div
      style={{
        padding: 16,
        borderRadius: 18,
        border: "1px solid rgba(132,151,186,0.12)",
        background: "linear-gradient(180deg, rgba(18,26,42,0.74), rgba(9,14,24,0.9))",
        display: "grid",
        gap: 12,
      }}
    >
      <div style={{ fontSize: 11, color: "#7f8da8", letterSpacing: "0.08em", textTransform: "uppercase" }}>{label}</div>
      <div style={{ display: "grid", gap: 10 }}>
        {Array.from({ length: blocks }).map((_, index) => (
          <div
            key={`${label}-${index}`}
            style={{
              height: index === 0 ? 18 : 12,
              width: index === 0 ? "42%" : index % 2 === 0 ? "88%" : "64%",
              borderRadius: 999,
              background: "linear-gradient(90deg, rgba(255,255,255,0.06), rgba(255,255,255,0.12), rgba(255,255,255,0.06))",
              backgroundSize: "200% 100%",
              animation: "actusShimmer 1.6s ease-in-out infinite",
            }}
          />
        ))}
      </div>
    </div>
  );
}

function loadingCardGrid() {
  return (
    <>
      <style>
        {`
          @keyframes actusShimmer {
            0% { background-position: 200% 0; }
            100% { background-position: -200% 0; }
          }
        `}
      </style>
      <section style={{ display: "grid", gap: 18 }}>
        <div style={{ background: "linear-gradient(145deg, rgba(10,17,31,0.98), rgba(7,12,22,0.96))", border: "1px solid rgba(132,151,186,0.16)", borderRadius: 26, padding: 18, boxShadow: "inset 0 1px 0 rgba(255,255,255,0.03)" }}>
          <div style={{ display: "grid", gap: 14 }}>
            {loadingPanel("Loading timeframe", 3)}
            <div style={{ display: "grid", gridTemplateColumns: "repeat(3, minmax(0, 1fr))", gap: 12 }}>
              {loadingPanel("Wait lane", 4)}
              {loadingPanel("Execute lane", 4)}
              {loadingPanel("Avoid lane", 4)}
            </div>
          </div>
        </div>
      </section>
    </>
  );
}

function commandSection(
  title: string,
  toneColor: string,
  items: React.ReactNode,
  detail?: string,
) {
  return (
    <section
      style={{
        padding: 14,
        borderRadius: 18,
        background: "rgba(255,255,255,0.02)",
        border: "1px solid rgba(142,160,191,0.1)",
        display: "grid",
        gap: 10,
      }}
    >
      <div style={{ display: "flex", justifyContent: "space-between", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
        <div style={{ fontSize: 11, color: "#7f8da8", letterSpacing: "0.1em", textTransform: "uppercase" }}>{title}</div>
        <div style={{ width: 8, height: 8, borderRadius: 999, background: toneColor, boxShadow: `0 0 0 4px ${toneColor}22` }} />
      </div>
      {detail ? <div style={{ fontSize: 12, color: "#8ea0bf", lineHeight: 1.45 }}>{detail}</div> : null}
      {items}
    </section>
  );
}

function commandRow(item: ActusOpportunityOutput, index: number) {
  return (
    <div
      key={`${item.symbol}-${item.timeframe}-${index}`}
      style={{
        display: "grid",
        gridTemplateColumns: "24px minmax(0, 1fr) auto",
        gap: 10,
        alignItems: "center",
        padding: "8px 10px",
        borderRadius: 12,
        background: "rgba(255,255,255,0.018)",
        border: "1px solid rgba(132,151,186,0.1)",
      }}
    >
      <div style={{ width: 24, height: 24, borderRadius: 999, display: "grid", placeItems: "center", background: "rgba(255,255,255,0.04)", color: "#d7e1f4", fontSize: 11, fontWeight: 600 }}>
        {index + 1}
      </div>
      <div style={{ minWidth: 0 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: "#f4f7fb" }}>{item.symbol}</div>
          {badge(displayDirection(item.direction), directionTone(item.direction).text, directionTone(item.direction).bg, directionTone(item.direction).border)}
          <div style={{ fontSize: 11, color: stateTone(item.state).text, letterSpacing: "0.06em", textTransform: "uppercase", fontWeight: 600 }}>
            {displayState(item.state)}
          </div>
        </div>
        <div style={{ marginTop: 4, fontSize: 12, color: "#c8d5ee", lineHeight: 1.4, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
          {item.actionLine}
        </div>
      </div>
      <div style={{ textAlign: "right" }}>
        <div style={{ fontSize: 12, color: "#d7e1f4", fontWeight: 600 }}>{item.confidenceScore}%</div>
        <div style={{ marginTop: 4, fontSize: 11, color: "#8ea0bf" }}>{displaySetupType(item.setupType)}</div>
      </div>
    </div>
  );
}

function topOpportunityPanel(hero: ActusOpportunityOutput) {
  const liveTone = stateTone(hero.state);
  const dirTone = directionTone(hero.direction);
  return (
    <section
      style={{
        padding: 16,
        borderRadius: 20,
        background: "radial-gradient(circle at top right, rgba(69,255,181,0.14), transparent 32%), linear-gradient(180deg, rgba(10,15,27,0.92), rgba(4,7,14,0.98))",
        border: "1px solid rgba(69,255,181,0.24)",
        boxShadow: "inset 0 1px 0 rgba(255,255,255,0.04), 0 18px 40px rgba(0,0,0,0.22), 0 0 36px rgba(69,255,181,0.08)",
        display: "grid",
        gap: 12,
      }}
    >
      <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "flex-start", flexWrap: "wrap" }}>
        <div>
          <div style={{ fontSize: 11, color: "#7f8da8", letterSpacing: "0.1em", textTransform: "uppercase" }}>Top Opportunity</div>
          <div style={{ marginTop: 8, display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
            <div style={{ fontSize: 18, fontWeight: 700, color: "#f4f7fb" }}>{hero.symbol}</div>
            {badge(displayDirection(hero.direction), dirTone.text, dirTone.bg, dirTone.border)}
            <div style={{ fontSize: 11, color: liveTone.text, letterSpacing: "0.08em", textTransform: "uppercase", fontWeight: 700 }}>
              {displayState(hero.state)}
            </div>
          </div>
          <div style={{ marginTop: 6, fontSize: 12, color: "#9aabc8" }}>{displaySetupType(hero.setupType)}</div>
        </div>
        <div style={{ textAlign: "right" }}>
          <div style={{ fontSize: 20, fontWeight: 700, color: "#f4f7fb" }}>{hero.confidenceScore}%</div>
          <div style={{ marginTop: 4, fontSize: 11, color: "#8ea0bf" }}>confidence</div>
        </div>
      </div>
      <div style={{ fontSize: 14, color: "#e6edf9", lineHeight: 1.5, fontWeight: 600 }}>{hero.actionLine}</div>
      <div style={{ fontSize: 12, color: "#f0b4b4", lineHeight: 1.45 }}>{hero.invalidationLine}</div>
      {hero.contextLine ? <div style={{ fontSize: 12, color: "#9aabc8", lineHeight: 1.45 }}>{hero.contextLine}</div> : null}
    </section>
  );
}

function buildSeries(points: number[]) {
  if (points.length < 2) return points;
  const expanded: number[] = [];
  for (let i = 0; i < points.length - 1; i += 1) {
    const current = points[i];
    const next = points[i + 1];
    const delta = next - current;
    expanded.push(current);
    expanded.push(current + delta * 0.28);
    expanded.push(current + delta * 0.62);
  }
  expanded.push(points[points.length - 1]);
  return expanded;
}

function focusChartWindow(points: number[], emphasizeLevels?: boolean) {
  if (!emphasizeLevels || points.length <= 14) {
    return points;
  }

  const target = Math.min(14, Math.max(10, Math.ceil(points.length * 0.42)));
  return points.slice(-target);
}

type ChartDatasetPoint = {
  x: number;
  y: number;
  value: number;
};

function useSequentialChartPoints(points: ChartDatasetPoint[], enabled: boolean) {
  const [animatedPoints, setAnimatedPoints] = useState<ChartDatasetPoint[]>(points);
  const pointsSignature = useMemo(
    () => points.map((point) => `${point.x.toFixed(2)}:${point.y.toFixed(2)}:${point.value.toFixed(4)}`).join("|"),
    [points],
  );

  useEffect(() => {
    if (!enabled || points.length <= 1) {
      setAnimatedPoints(points);
      return;
    }

    const totalDuration = 10_000;
    const delayBetweenPoints = totalDuration / Math.max(points.length, 1);
    let frameId = 0;
    const startedAt = performance.now();

    const tick = (now: number) => {
      const elapsed = Math.min(totalDuration, now - startedAt);
      const pointFloat = elapsed / delayBetweenPoints;
      const completedIndex = Math.min(points.length - 1, Math.floor(pointFloat));
      const partialProgress = Math.max(0, Math.min(1, pointFloat - completedIndex));

      const nextPoints = points.slice(0, completedIndex + 1);
      if (completedIndex < points.length - 1) {
        const previous = points[Math.max(0, completedIndex)];
        const next = points[completedIndex + 1];
        nextPoints.push({
          x: previous.x + (next.x - previous.x) * partialProgress,
          y: previous.y + (next.y - previous.y) * partialProgress,
          value: previous.value + (next.value - previous.value) * partialProgress,
        });
      }

      setAnimatedPoints(nextPoints);

      if (elapsed < totalDuration) {
        frameId = window.requestAnimationFrame(tick);
      }
    };

    frameId = window.requestAnimationFrame(tick);
    return () => window.cancelAnimationFrame(frameId);
  }, [enabled, pointsSignature]);

  return enabled ? animatedPoints : points;
}

function buildChartPoints(
  values: number[],
  width: number,
  height: number,
  padding = 8,
  framingPoints = values,
) {
  const min = Math.min(...framingPoints);
  const max = Math.max(...framingPoints);
  const rawRange = max - min || 1;
  const bufferedMin = min - rawRange * 0.055;
  const bufferedMax = max + rawRange * 0.055;
  const range = bufferedMax - bufferedMin || 1;

  const pointCount = values.length;
  const points = values.map((value, index) => ({
    x: (index / Math.max(pointCount - 1, 1)) * width,
    y: height - ((value - bufferedMin) / range) * (height - padding * 2) - padding,
    value,
  }));
  return { min: bufferedMin, max: bufferedMax, points };
}

function buildLinePath(points: ChartDatasetPoint[], smooth = true) {
  if (!points.length) return "";

  let line = `M ${points[0].x} ${points[0].y}`;
  for (let i = 1; i < points.length; i += 1) {
    const previous = points[i - 1];
    const current = points[i];
    if (smooth) {
      const controlX = (previous.x + current.x) / 2;
      line += ` C ${controlX} ${previous.y}, ${controlX} ${current.y}, ${current.x} ${current.y}`;
    } else {
      line += ` L ${current.x} ${current.y}`;
    }
  }
  return line;
}

function buildAreaPath(points: ChartDatasetPoint[], height: number, smooth = true) {
  if (!points.length) return "";
  const line = buildLinePath(points, smooth);
  return `${line} L ${points[points.length - 1].x} ${height} L ${points[0].x} ${height} Z`;
}

function guideY(value: number, min: number, max: number, height: number, padding = 8) {
  const range = max - min || 1;
  return height - ((value - min) / range) * (height - padding * 2) - padding;
}

function MarketChart({
  points,
  color,
  height,
  entry,
  invalidation,
  chartId,
  emphasizeLevels,
}: {
  points: number[];
  color: string;
  height: number;
  entry?: number;
  invalidation?: number;
  chartId: string;
  emphasizeLevels?: boolean;
}) {
  const width = emphasizeLevels ? 332 : 440;
  const windowedPoints = focusChartWindow(points, emphasizeLevels);
  const series = emphasizeLevels ? windowedPoints : buildSeries(windowedPoints);
  const chartPadding = emphasizeLevels ? 8 : 8;
  const framingSeries = [...series, ...(typeof entry === "number" ? [entry] : []), ...(typeof invalidation === "number" ? [invalidation] : [])];
  const { min, max, points: chartPoints } = buildChartPoints(series, width, height, chartPadding, framingSeries);
  const renderedPoints = useSequentialChartPoints(chartPoints, !emphasizeLevels);
  const trailCutIndex = Math.max(1, renderedPoints.length - (emphasizeLevels ? 4 : 2));
  const trailingDataset = renderedPoints.slice(0, trailCutIndex);
  const liveDataset = renderedPoints.slice(Math.max(0, trailCutIndex - 1));
  const trailingPath = buildLinePath(trailingDataset, !emphasizeLevels);
  const livePath = buildLinePath(liveDataset, false);
  const area = buildAreaPath(renderedPoints, height, !emphasizeLevels);
  const entryY = typeof entry === "number" ? guideY(entry, min, max, height, chartPadding) : null;
  const invalidationY = typeof invalidation === "number" ? guideY(invalidation, min, max, height, chartPadding) : null;
  const zoneTop = entryY !== null && invalidationY !== null ? Math.min(entryY, invalidationY) : null;
  const zoneHeight = entryY !== null && invalidationY !== null ? Math.abs(entryY - invalidationY) : null;
  const gradientId = `fill-${chartId.replace(/[^a-z0-9]/gi, "")}-${color.replace(/[^a-z0-9]/gi, "")}-${height}`;
  const lineGlowId = `glow-${chartId.replace(/[^a-z0-9]/gi, "")}`;
  const trailGlowId = `trail-${chartId.replace(/[^a-z0-9]/gi, "")}`;
  const railGlowId = `rail-${chartId.replace(/[^a-z0-9]/gi, "")}`;
  const current = renderedPoints[renderedPoints.length - 1] ?? null;
  const lastValue = series[series.length - 1] ?? null;
  const assumedLong = typeof entry === "number" && typeof invalidation === "number" ? entry > invalidation : true;
  const currentBias =
    lastValue !== null && typeof entry === "number" && typeof invalidation === "number"
      ? assumedLong
        ? lastValue >= entry
          ? "positive"
          : lastValue <= invalidation
            ? "negative"
            : "neutral"
        : lastValue <= entry
          ? "positive"
          : lastValue >= invalidation
            ? "negative"
            : "neutral"
      : "neutral";
  const currentColor = currentBias === "positive" ? "#dff5ea" : currentBias === "negative" ? "#ffd5de" : "#f1dfaa";
  const liveSegmentColor = currentBias === "positive" ? "#7fdab2" : currentBias === "negative" ? "#f58aa0" : "#e5c66f";
  const trailingColor = emphasizeLevels ? "#d5b14a" : color;
  const trailingLaserCore = emphasizeLevels ? "#e6c866" : color;
  const zoneFill =
    entryY !== null && invalidationY !== null
      ? entryY < invalidationY
        ? "rgba(62,240,166,0.018)"
        : "rgba(255,111,145,0.018)"
      : "rgba(255,255,255,0.012)";
  const currentLabelX = current ? Math.max(0, width - 56) : null;
  const currentLabelY = current ? Math.max(10, Math.min(height - 10, current.y - 8)) : null;
  return (
    <svg viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="none" style={{ width: "100%", height }}>
      <defs>
        <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={emphasizeLevels ? "#c39c39" : color} stopOpacity={emphasizeLevels ? "0.05" : "0.24"} />
          <stop offset="100%" stopColor={color} stopOpacity="0" />
        </linearGradient>
        <filter id={lineGlowId} x="-20%" y="-20%" width="140%" height="140%">
          <feGaussianBlur stdDeviation={emphasizeLevels ? "0.45" : "1.8"} result="blur" />
          <feMerge>
            <feMergeNode in="blur" />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>
        <filter id={trailGlowId} x="-15%" y="-15%" width="130%" height="130%">
          <feGaussianBlur stdDeviation={emphasizeLevels ? "0.18" : "1"} result="blur" />
          <feMerge>
            <feMergeNode in="blur" />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>
        <filter id={railGlowId} x="-15%" y="-25%" width="130%" height="150%">
          <feGaussianBlur stdDeviation={emphasizeLevels ? "0.4" : "1.4"} result="blur" />
          <feMerge>
            <feMergeNode in="blur" />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>
      </defs>
      <rect x="0" y="0" width={width} height={height} fill={emphasizeLevels ? "rgba(8,11,18,0.88)" : "rgba(255,255,255,0.012)"} />
      {emphasizeLevels ? (
        <>
          <line x1="0" x2={width} y1={height * 0.2} y2={height * 0.2} stroke="rgba(255,255,255,0.028)" strokeWidth="1" />
          <line x1="0" x2={width} y1={height * 0.5} y2={height * 0.5} stroke="rgba(255,255,255,0.024)" strokeWidth="1" />
          <line x1="0" x2={width} y1={height * 0.8} y2={height * 0.8} stroke="rgba(255,255,255,0.028)" strokeWidth="1" />
        </>
      ) : null}
      {emphasizeLevels && zoneTop !== null && zoneHeight !== null ? <rect x="0" y={zoneTop} width={width} height={zoneHeight} fill={zoneFill} opacity={0.72} /> : null}
      <path d={area} fill={`url(#${gradientId})`} opacity={emphasizeLevels ? 0.48 : 0.94} />
      {current ? <line x1={current.x} x2={current.x} y1="0" y2={height} stroke="rgba(255,255,255,0.03)" strokeWidth="1" /> : null}
      {trailingPath ? (
        <>
          <path d={trailingPath} fill="none" stroke={emphasizeLevels ? "rgba(213,177,74,0.12)" : color} strokeWidth={emphasizeLevels ? "3.1" : "3.4"} strokeLinecap="round" strokeLinejoin="miter" opacity={emphasizeLevels ? 0.08 : 0.16} />
          <path d={trailingPath} fill="none" stroke={trailingColor} strokeWidth={emphasizeLevels ? "1.65" : "2.4"} strokeLinecap="round" strokeLinejoin="miter" filter={`url(#${trailGlowId})`} opacity={0.94} />
          {emphasizeLevels ? <path d={trailingPath} fill="none" stroke={trailingLaserCore} strokeWidth="0.72" strokeLinecap="round" strokeLinejoin="miter" opacity="0.92" /> : null}
        </>
      ) : null}
      {entryY !== null ? (
        <>
          <line x1="0" x2={width} y1={entryY} y2={entryY} stroke="#36dca5" strokeWidth={emphasizeLevels ? "1.1" : "1.4"} strokeDasharray={emphasizeLevels ? "0" : "4 5"} opacity="0.98" />
          {emphasizeLevels ? <text x="8" y={Math.max(10, entryY - 4)} fill="#58cfa6" fontSize="7.3" fontWeight="700" letterSpacing="0.8">ENTRY</text> : null}
        </>
      ) : null}
      {invalidationY !== null ? (
        <>
          <line x1="0" x2={width} y1={invalidationY} y2={invalidationY} stroke="#ef6a86" strokeWidth={emphasizeLevels ? "1.1" : "1.4"} strokeDasharray={emphasizeLevels ? "0" : "4 5"} opacity="0.98" />
          {emphasizeLevels ? <text x="8" y={Math.max(10, invalidationY - 4)} fill="#d17b8d" fontSize="7.3" fontWeight="700" letterSpacing="0.8">STOP</text> : null}
        </>
      ) : null}
      {livePath ? <path d={livePath} fill="none" stroke={liveSegmentColor} strokeWidth={emphasizeLevels ? "1.9" : "3"} strokeLinecap="round" strokeLinejoin="round" filter={`url(#${lineGlowId})`} opacity="0.96" /> : null}
      {current ? (
        <>
          {emphasizeLevels ? <line x1={current.x} x2={width} y1={current.y} y2={current.y} stroke={liveSegmentColor} strokeWidth="0.9" opacity="0.4" /> : null}
          <circle cx={current.x} cy={current.y} r={emphasizeLevels ? "2.8" : "4.2"} fill={currentColor} stroke="rgba(6,10,18,0.9)" strokeWidth="1.1" />
          {emphasizeLevels && currentLabelX !== null && currentLabelY !== null && lastValue !== null ? (
            <g transform={`translate(${currentLabelX} ${currentLabelY})`}>
              <rect width="56" height="14" rx="2" fill="rgba(10,14,22,0.96)" stroke="rgba(255,255,255,0.05)" />
              <text x="6" y="10" fill={currentColor} fontSize="7.6" fontWeight="700">{lastValue.toLocaleString()}</text>
            </g>
          ) : null}
        </>
      ) : null}
    </svg>
  );
}

function opportunityCard(item: ActusOpportunityOutput, nowTick: number, onOpenActusMode?: (symbol: string) => void) {
  const baseColors = tone(item.action);
  const colors =
    item.action === "execute" && item.confidenceScore < 60
      ? { text: "#7fd9b0", bg: "rgba(62,240,166,0.04)", border: "rgba(62,240,166,0.14)" }
      : baseColors;
  const liveStateTone = stateTone(item.state);
  const directionalTone = directionTone(item.direction);
  const riskColor = riskToneValue(item.riskState);
  const chartId = `${item.symbol}-${item.timeframe}-${item.action}-${item.sparkline.length}-${item.sparkline[0] ?? 0}-${item.sparkline[item.sparkline.length - 1] ?? 0}`;
  const sessionLabel = item.sessionContext ? displaySession(item.sessionContext.currentSession) : null;
  const stateLabel = item.state === "execute" ? null : displayState(item.state);
  const inlineContext = [
    `[${displayLocation(item.location)}]`,
    `[${displayRisk(item.riskState)}]`,
    sessionLabel ? `[${sessionLabel}]` : null,
  ].filter(Boolean);

  return (
    <article
      key={`${item.symbol}-${item.timeframe}`}
      style={{
        background: `radial-gradient(circle at top right, ${colors.bg}, transparent 30%), linear-gradient(180deg, rgba(8,12,22,0.99), rgba(3,5,12,0.99))`,
        border: `1px solid ${item.action === "execute" ? colors.border : "rgba(132,151,186,0.16)"}`,
        boxShadow: `inset 0 1px 0 rgba(255,255,255,0.04), 0 24px 52px rgba(0,0,0,0.26)${item.action === "execute" ? `, 0 0 34px ${colors.bg}` : ""}`,
        borderRadius: 22,
        padding: 18,
        display: "grid",
        gap: 14,
      }}
    >
      <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "flex-start" }}>
        <div>
          <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
            <div style={{ fontSize: 17, fontWeight: 800, color: "#f4f7fb", letterSpacing: "0.08em" }}>{item.symbol}</div>
            {stateLabel ? badge(stateLabel, liveStateTone.text, liveStateTone.bg, liveStateTone.border) : null}
            {badge(displayDirection(item.direction), directionalTone.text, directionalTone.bg, directionalTone.border)}
            {badge(displaySetupType(item.setupType), "#c6d4ef", "rgba(198,212,239,0.08)", "rgba(198,212,239,0.16)")}
          </div>
          <div style={{ marginTop: 5, fontSize: 13, color: "#8ea0bf" }}>{item.displayName}</div>
        </div>
        {onOpenActusMode ? ghostButton("ACTUS Mode", () => onOpenActusMode(item.symbol), colors.text) : null}
      </div>

      <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "baseline" }}>
        <div style={{ fontSize: 24, fontWeight: 700, color: "#f4f7fb" }}>{item.price.toLocaleString()}</div>
        <div style={{ fontSize: 13, color: item.changePct >= 0 ? "#3ef0a6" : "#ff7b7b" }}>
          {item.changePct >= 0 ? "+" : ""}
          {item.changePct.toFixed(2)}%
        </div>
      </div>

      <div
        style={{
          padding: "12px 14px",
          background: "linear-gradient(180deg, rgba(15,20,33,0.78), rgba(7,10,18,0.9))",
          borderRadius: 16,
          border: "1px solid rgba(118,138,176,0.14)",
        }}
      >
        <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "center", flexWrap: "wrap" }}>
          <div style={{ fontSize: 12, color: "#7f8da8", letterSpacing: "0.08em", textTransform: "uppercase" }}>Decision Frame</div>
        </div>
        <div style={{ marginTop: 8, fontSize: 15, lineHeight: 1.55, color: "#e6edf9", fontWeight: 550 }}>{item.summary}</div>
        <div style={{ marginTop: 10, fontSize: 14, lineHeight: 1.55, color: colors.text, fontWeight: 600 }}>{item.actionLine}</div>
        <div style={{ marginTop: 8, fontSize: 13, lineHeight: 1.5, color: "#f0b4b4" }}>{item.invalidationLine}</div>
        {item.contextLine ? (
          <div style={{ marginTop: 8, fontSize: 13, lineHeight: 1.5, color: "#9aabc8" }}>{item.contextLine}</div>
        ) : null}
        <div style={{ marginTop: 10, display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
          {inlineContext.map((label) => (
            <div
              key={label}
              style={{
                fontSize: 12,
                color: label === `[${displayRisk(item.riskState)}]` ? riskColor : label === `[${sessionLabel}]` ? "#67b7ff" : "#c8d5ee",
                background: "rgba(255,255,255,0.025)",
                border: "1px solid rgba(142,160,191,0.1)",
                borderRadius: 999,
                padding: "4px 9px",
                lineHeight: 1.2,
              }}
            >
              {label}
            </div>
          ))}
        </div>
      </div>

      <div style={{ padding: "8px 8px 2px", background: "linear-gradient(180deg, rgba(7,11,20,0.82), rgba(3,6,13,0.96))", borderRadius: 16, border: "1px solid rgba(118,138,176,0.14)", boxShadow: `0 0 26px ${colors.bg}` }}>
        <MarketChart points={item.sparkline} color={colors.text} height={72} entry={item.entry} invalidation={item.invalidation} chartId={chartId} />
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(3, minmax(0, 1fr))", gap: 8 }}>
        {metricCard("Confidence", `${item.confidenceScore}%`, "Current decision confidence", colors.text)}
        {metricCard("Opportunity", `${item.opportunityScore}`, "Relative ranking strength")}
        {metricCard("Time In State", perceivedFreshnessState(item), freshnessDetail(item, nowTick), actusFreshnessTone(item))}
      </div>

      <div style={{ padding: "13px 14px", background: "linear-gradient(180deg, rgba(12,17,30,0.74), rgba(6,9,17,0.88))", borderRadius: 14, border: "1px solid rgba(118,138,176,0.12)" }}>
        <div style={{ display: "flex", justifyContent: "space-between", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
          <div style={{ fontSize: 12, color: "#7f8da8", letterSpacing: "0.08em", textTransform: "uppercase" }}>Why It Matters</div>
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
            {badge(displayState(item.state), liveStateTone.text, liveStateTone.bg, liveStateTone.border)}
            {badge(displayRisk(item.riskState), riskColor, "rgba(255,255,255,0.03)", "rgba(142,160,191,0.18)")}
          </div>
        </div>
        <div style={{ marginTop: 10, display: "grid", gap: 6 }}>
          {item.whyItMatters.slice(0, 3).map((reason, index) => (
            <div key={reason} style={{ display: "grid", gridTemplateColumns: "16px minmax(0,1fr)", gap: 10, alignItems: "start" }}>
              <div style={{ width: 16, height: 16, borderRadius: 999, display: "grid", placeItems: "center", marginTop: 1, background: "rgba(255,255,255,0.05)", color: colors.text, fontSize: 10, fontWeight: 700 }}>
                {index + 1}
              </div>
              <div style={{ fontSize: 13, color: "#d7e1f4", lineHeight: 1.45 }}>{reason.replace(/\.$/, "")}</div>
            </div>
          ))}
        </div>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(2, minmax(0, 1fr))", gap: 8 }}>
        {contextPill("Entry", item.entry.toLocaleString(), "#3ef0a6")}
        {contextPill("Invalidation", item.invalidation.toLocaleString(), "#ff7b7b")}
      </div>

      {item.warnings?.length ? (
        <div style={{ padding: "12px 14px", borderRadius: 14, background: "rgba(255,123,123,0.06)", border: "1px solid rgba(255,123,123,0.16)" }}>
          <div style={{ fontSize: 11, color: "#ffb0b0", letterSpacing: "0.08em", textTransform: "uppercase" }}>Watchouts</div>
          <div style={{ marginTop: 8, display: "grid", gap: 6 }}>
            {item.warnings.slice(0, 2).map((warning) => (
              <div key={warning} style={{ fontSize: 13, color: "#f3d0d0", lineHeight: 1.5 }}>{warning}</div>
            ))}
          </div>
        </div>
      ) : null}
    </article>
  );
}

function heroSignalCard(hero: ActusOpportunityOutput, nowTick: number, onOpenActusMode?: (symbol: string) => void) {
  const colors = tone(hero.action);
  const liveStateTone = stateTone(hero.state);
  const directionalTone = directionTone(hero.direction);
  const convictionColor = convictionTone(hero.conviction);
  const riskColor = riskToneValue(hero.riskState);
  const heroAgeColor = actusFreshnessTone(hero);
  const chartId = `hero-${hero.symbol}-${hero.timeframe}-${hero.action}-${hero.sparkline.length}-${hero.sparkline[0] ?? 0}-${hero.sparkline[hero.sparkline.length - 1] ?? 0}`;
  const sourceQualifier = actusSourceQualifier(hero.symbol);

  return (
    <section
      key={`${hero.symbol}-${hero.timeframe}`}
      style={{
        background: "radial-gradient(circle at top right, rgba(69,255,181,0.1), transparent 24%), radial-gradient(circle at 85% 12%, rgba(103,183,255,0.1), transparent 28%), linear-gradient(145deg, rgba(8,12,22,0.99), rgba(3,6,12,0.99))",
        border: "1px solid rgba(118,138,176,0.18)",
        borderRadius: 24,
        padding: 18,
        boxShadow: "inset 0 1px 0 rgba(255,255,255,0.04), 0 24px 60px rgba(0,0,0,0.24)",
      }}
    >
      <div style={{ display: "grid", gridTemplateColumns: "minmax(0, 1.25fr) minmax(320px, 0.9fr)", gap: 16, alignItems: "stretch" }}>
        <div style={{ padding: "6px 4px 4px" }}>
          <div style={{ fontSize: 11, color: "#45ffb5", letterSpacing: "0.14em", textTransform: "uppercase", textShadow: "0 0 12px rgba(69,255,181,0.28)" }}>What To Do Right Now</div>

          <div style={{ marginTop: 8, display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
            <span style={{ fontSize: 24, fontWeight: 700, color: "#f4f7fb", letterSpacing: "-0.03em" }}>{hero.action.toUpperCase()}:</span>
            <span style={{ fontSize: 28, fontWeight: 800, color: colors.text, letterSpacing: "-0.035em" }}>{hero.symbol}</span>
            {sourceQualifier ? (
              <span style={{ fontSize: 11, color: "#9fb0cb", letterSpacing: "0.16em", textTransform: "uppercase", fontWeight: 700 }}>
                {sourceQualifier}
              </span>
            ) : null}
            {badge(displayState(hero.state), liveStateTone.text, liveStateTone.bg, liveStateTone.border)}
            {badge(displayDirection(hero.direction), directionalTone.text, directionalTone.bg, directionalTone.border)}
            {onOpenActusMode ? ghostButton("ACTUS Mode", () => onOpenActusMode(hero.symbol), colors.text) : null}
          </div>

          <div style={{ marginTop: 14, display: "grid", gridTemplateColumns: "repeat(4, minmax(0, 1fr))", gap: 14 }}>
            <div>
              <div style={{ fontSize: 11, color: "#7f8da8", letterSpacing: "0.08em", textTransform: "uppercase" }}>Confidence</div>
              <div style={{ marginTop: 6, fontSize: 27, fontWeight: 650, color: "#f4f7fb" }}>{hero.confidenceScore}%</div>
            </div>
            <div>
              <div style={{ fontSize: 11, color: "#7f8da8", letterSpacing: "0.08em", textTransform: "uppercase" }}>Time In State</div>
              <div style={{ marginTop: 6, fontSize: 27, fontWeight: 650, color: heroAgeColor }}>{perceivedFreshnessState(hero)}</div>
              <div style={{ marginTop: 4, fontSize: 13, color: "#c8d5ee" }}>{formatStateTimer(hero.stateAgeMinutes, nowTick)} elapsed</div>
            </div>
            <div>
              <div style={{ fontSize: 11, color: "#7f8da8", letterSpacing: "0.08em", textTransform: "uppercase" }}>Conviction</div>
              <div style={{ marginTop: 6, fontSize: 27, fontWeight: 650, color: convictionColor }}>{hero.conviction.toUpperCase()}</div>
            </div>
            <div>
              <div style={{ fontSize: 11, color: "#7f8da8", letterSpacing: "0.08em", textTransform: "uppercase" }}>Risk</div>
              <div style={{ marginTop: 6, fontSize: 27, fontWeight: 650, color: riskColor }}>{displayRisk(hero.riskState)}</div>
            </div>
          </div>

          <div style={{ marginTop: 14, padding: "12px 14px", borderRadius: 16, background: "linear-gradient(180deg, rgba(12,17,30,0.74), rgba(6,9,17,0.88))", border: "1px solid rgba(118,138,176,0.12)" }}>
            <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "center", flexWrap: "wrap" }}>
              <div style={{ fontSize: 11, color: "#7f8da8", letterSpacing: "0.08em", textTransform: "uppercase" }}>Operator Read</div>
              <div style={{ fontSize: 13, color: "#9aabc8" }}>{displaySetupType(hero.setupType)}</div>
            </div>
            <div style={{ marginTop: 8, fontSize: 14, lineHeight: 1.55, color: "#e6edf9", fontWeight: 550 }}>{hero.summary}</div>
            <div style={{ marginTop: 10, fontSize: 14, lineHeight: 1.55, color: colors.text, fontWeight: 600 }}>{hero.actionLine}</div>
            <div style={{ marginTop: 8, fontSize: 13, lineHeight: 1.5, color: "#f0b4b4" }}>{hero.invalidationLine}</div>
            {hero.contextLine ? (
              <div style={{ marginTop: 8, fontSize: 13, lineHeight: 1.5, color: "#9aabc8" }}>{hero.contextLine}</div>
            ) : null}
            <div style={{ marginTop: 10, display: "grid", gap: 6 }}>
              {hero.whyItMatters.slice(0, 2).map((reason) => (
                <div key={reason} style={{ fontSize: 13, color: "#c8d5ee", lineHeight: 1.5 }}>{reason}</div>
              ))}
            </div>
          </div>
        </div>

        <div style={{ background: "linear-gradient(180deg, rgba(10,15,27,0.88), rgba(4,7,14,0.98))", border: "1px solid rgba(118,138,176,0.16)", boxShadow: "inset 0 1px 0 rgba(255,255,255,0.04), 0 0 30px rgba(103,183,255,0.06)", borderRadius: 18, padding: 14 }}>
          <div style={{ display: "flex", justifyContent: "space-between", gap: 10, alignItems: "flex-start", marginBottom: 12 }}>
            <div style={{ fontSize: 13, fontWeight: 600, color: "#f4f7fb" }}>
              {hero.symbol}
              <span style={{ marginLeft: 8, fontFamily: '"Courier New", monospace', color: "#d7e1f4" }}>{hero.price.toLocaleString()}</span>
              <span style={{ marginLeft: 8, color: hero.changePct >= 0 ? "#3ef0a6" : "#ff7b7b" }}>
                {hero.changePct >= 0 ? "+" : ""}
                {hero.changePct.toFixed(2)}%
              </span>
            </div>
            <div style={{ display: "flex", gap: 6 }}>
              {["1m", "5m", "15m"].map((tf) => (
                <span key={tf} style={{ padding: "4px 7px", borderRadius: 6, fontSize: 9, color: hero.timeframe === tf ? "#f4f7fb" : "#7f8da8", background: hero.timeframe === tf ? "rgba(255,255,255,0.08)" : "rgba(255,255,255,0.03)", border: "1px solid rgba(132,151,186,0.14)" }}>{tf}</span>
              ))}
            </div>
          </div>

          <div style={{ padding: "8px 8px 2px", background: "linear-gradient(180deg, rgba(7,11,20,0.86), rgba(3,6,13,0.98))", borderRadius: 14, border: "1px solid rgba(118,138,176,0.14)" }}>
            <MarketChart points={hero.sparkline} color={colors.text} height={128} entry={hero.entry} invalidation={hero.invalidation} chartId={chartId} />
          </div>

          <div style={{ marginTop: 10, display: "grid", gap: 6, justifyItems: "end" }}>
            <div style={{ fontSize: 11, color: "#d7e1f4" }}><span style={{ color: "#3ef0a6" }}>Entry</span> {hero.entry.toLocaleString()}</div>
            <div style={{ fontSize: 11, color: "#d7e1f4" }}><span style={{ color: "#ff7b7b" }}>Invalid</span> {hero.invalidation.toLocaleString()}</div>
          </div>
        </div>
      </div>
    </section>
  );
}

function actusModePanel(
  item: ActusModeRenderableAsset,
  chartCandles: NormalizedFuturesCandle[] | null,
  gammaOverlay: GammaOverlay | null,
  deltaSignal: DeltaSignal | null,
  nyOpenFlow: NyOpenFlowSnapshot | null,
  replayState: ActusReplayState,
  nowTick: number,
  onExit: () => void,
  onToggleReplayMode: () => void,
  onReplayPlayPause: () => void,
  onReplayStepBack: () => void,
  onReplayStepForward: () => void,
  onReplaySpeedCycle: () => void,
  position: OpenPositionRecord | null,
  closedPosition: ClosedPositionRecord | null,
  fillPriceDraft: string,
  onFillPriceDraftChange: (item: ActusOpportunityOutput, value: string) => void,
  onOrderFilled: (item: ActusOpportunityOutput) => void,
  onClosePosition: (item: ActusOpportunityOutput) => void,
  assetUniverse: readonly string[],
  onSwitchAsset: (symbol: string) => void,
  solView: SolActusView,
  onSolViewChange: (view: SolActusView) => void,
) {
  const colors = tone(item.action);
  const directionalTone = directionTone(item.direction);
  const riskColor = riskToneValue(item.riskState);
  const executionState = deriveActusExecutionState(item, {
    position: position
      ? {
          side: position.side,
          stop: position.stop,
          active: position.active,
        }
      : null,
    closedPosition: closedPosition
      ? {
          outcome: closedPosition.outcome,
        }
      : null,
  });
  const liveStatus = actusLiveStatus(executionState);
  const liveStatusTone = actusStatusTone(liveStatus);
  const statePrompt = executionPrompt(executionState);
  const actionTag = executionActionTag(executionState);
  const positionSignal = position ? managementSignal(item, position) : null;
  const closedSignal = closedPosition
    ? {
        banner: "CLOSED",
        primary: closedPosition.exitLabel,
        secondary: `Closed ${item.direction === "short" ? "below" : "above"} ${closedPosition.exitPrice.toLocaleString()}`,
      }
    : null;
  const displayStatus = closedSignal?.banner ?? positionSignal?.banner ?? liveStatus;
  const displayStatusTone = positionSignal
    ? positionSignal.tone === "invalidated"
      ? actusStatusTone("EXIT SOON")
      : positionSignal.tone === "exit"
        ? actusStatusTone("EXIT SOON")
        : actusStatusTone("IN TRADE")
    : closedSignal
      ? actusStatusTone("EXIT SOON")
      : liveStatusTone;
  const commandPrimaryColor = positionSignal
    ? positionSignal.tone === "invalidated"
      ? "#ff8ea8"
      : positionSignal.tone === "exit"
        ? "#ffd084"
        : "#45ffb5"
    : liveStatus === "EXIT SOON"
      ? "#ff8ea8"
      : liveStatus === "READY"
        ? "#ffd84d"
        : liveStatusTone.text;
  const commandSecondaryColor = positionSignal
    ? positionSignal.tone === "invalidated"
      ? "#ffd2da"
      : positionSignal.tone === "exit"
        ? "#ffd084"
        : "#d7e1f4"
    : liveStatus === "EXIT SOON"
      ? "#ffd2da"
      : item.riskState === "unstable" || item.confidenceScore < 60
        ? "#ffd084"
        : "#d7e1f4";
  const baseExecutionBlock = actusExecutionBlock(item, liveStatus);
  const executionBlock = closedSignal
    ? { primary: closedSignal.primary, secondary: closedSignal.secondary }
    : positionSignal
      ? { primary: positionSignal.primary, secondary: positionSignal.secondary }
      : baseExecutionBlock;
  const sessionLabel = item.sessionContext ? displaySession(item.sessionContext.currentSession) : null;
  const executionRead = compactExecutionRead(item);
  const riskWatchLines = watchRiskLines(item);
  const contextTags = [
    sessionLabel ? `[${sessionLabel}]` : null,
    `[${displayLocation(item.location)}]`,
    item.freshnessState === "aging" ? "[Aging]" : item.freshnessState === "stale" ? "[Stale]" : null,
    item.positioningContext?.positioningCeiling ? `[Ceiling ${item.positioningContext.positioningCeiling.toLocaleString()}]` : null,
    item.positioningContext?.positioningFloor ? `[Floor ${item.positioningContext.positioningFloor.toLocaleString()}]` : null,
  ].filter(Boolean);
  const positioningLines = item.positioningContext
    ? [item.positioningContext.expansionRisk, item.positioningContext.dealerPressureShift].filter(Boolean)
    : [];
  const unifiedPositioning = deriveActusPositioning(item, gammaOverlay, deltaSignal);
  const chartGammaOverlay = buildActusChartGammaOverlay(item, unifiedPositioning, gammaOverlay);
  const positioningPill = positioningAvailabilityPill(unifiedPositioning, gammaOverlay);
  const positioningClassification = positioningClassificationState(unifiedPositioning, gammaOverlay);
  const actionabilityPill = actionabilityState(unifiedPositioning);
  const decisionDrivers = unifiedPositioning?.drivers.slice(0, 2) ?? [];
  const deltaTone = deltaAvailabilityTone(deltaSignal);
  const displayedConfidenceScore =
    replayState.isReplayMode && unifiedPositioning
      ? Math.round(unifiedPositioning.confidence * 100)
      : item.confidenceScore;
  const tradeDelta = position
    ? {
        delta: position.side === "short" ? position.filledPrice - item.price : item.price - position.filledPrice,
        pct:
          position.filledPrice
            ? (((position.side === "short" ? position.filledPrice - item.price : item.price - position.filledPrice) / position.filledPrice) * 100)
            : 0,
        positive: (position.side === "short" ? position.filledPrice - item.price : item.price - position.filledPrice) >= 0,
      }
    : actusTradeDelta(item);
  const stopDistance = position ? Math.abs(item.price - position.stop) : actusStopDistance(item);
  const momentumState = actusMomentumState(item);
  const canMarkFilled = !position && !closedPosition && baseExecutionBlock.primary !== "DO NOT TRADE";
  const entryDisplay = position?.filledPrice ?? item.entry;
  const stopDisplay = position?.stop ?? item.invalidation;
  const executionRisk = Math.abs(entryDisplay - stopDisplay);
  const executionRiskDisplay = formatActusExecutionValue(item.symbol, executionRisk);
  const replayCandleCount = chartCandles?.length ?? 0;
  const sourceQualifier = item.actusSourceLabel ?? actusSourceQualifier(item.symbol, solView);
  const chartSymbol = item.actusChartSymbol ?? item.symbol;
  const solCmeLiquidityIndicator = buildSolCmeLiquidityIndicator(chartSymbol, chartCandles, item.timeframe);
  return (
    <section
      style={{
        background:
          "radial-gradient(circle at top right, rgba(62,120,255,0.055), transparent 24%), linear-gradient(180deg, rgba(7,11,18,0.995), rgba(5,8,15,0.995))",
        border: "1px solid rgba(132,151,186,0.12)",
        borderRadius: 24,
        padding: 18,
        boxShadow: "inset 0 1px 0 rgba(255,255,255,0.03), 0 30px 90px rgba(0,0,0,0.34)",
        display: "grid",
        gap: 16,
      }}
    >
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          gap: 18,
          alignItems: "flex-start",
          flexWrap: "wrap",
          paddingBottom: 10,
          borderBottom: "1px solid rgba(142,160,191,0.07)",
        }}
      >
        <div style={{ display: "grid", gap: 6, minWidth: 0 }}>
          <div style={{ display: "flex", alignItems: "baseline", gap: 12, flexWrap: "wrap" }}>
            <div style={{ fontSize: 30, fontWeight: 780, color: "#f4f7fb", letterSpacing: "-0.045em", lineHeight: 1 }}>{item.symbol}</div>
            {sourceQualifier ? (
              <div style={{ fontSize: 11, color: "#9fb0cb", letterSpacing: "0.16em", textTransform: "uppercase", fontWeight: 700 }}>
                {sourceQualifier}
              </div>
            ) : null}
            <div style={{ fontSize: 14, fontWeight: 760, color: directionalTone.text, letterSpacing: "0.13em", textTransform: "uppercase" }}>
              {displayDirection(item.direction)}
            </div>
            <div style={{ fontSize: 12, color: "#8ea0bf", letterSpacing: "0.11em", textTransform: "uppercase" }}>{displaySetupType(item.setupType)}</div>
          </div>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
            <div style={{ fontSize: 11, color: "#7f8da8", letterSpacing: "0.1em", textTransform: "uppercase" }}>{item.timeframe}</div>
            <div style={{ width: 4, height: 4, borderRadius: 999, background: "rgba(142,160,191,0.42)" }} />
            <div style={{ fontSize: 12, color: "#9fb0cb", lineHeight: 1.35 }}>{item.summary}</div>
            {solCmeLiquidityIndicator ? (
              <>
                <div style={{ width: 4, height: 4, borderRadius: 999, background: "rgba(142,160,191,0.42)" }} />
                <div
                  title={solCmeLiquidityIndicator.detail}
                  style={{
                    display: "inline-flex",
                    alignItems: "center",
                    gap: 7,
                    padding: "5px 9px",
                    borderRadius: 999,
                    color: "#d8e7ff",
                    background: "rgba(103,183,255,0.08)",
                    border: "1px solid rgba(103,183,255,0.18)",
                    fontSize: 10,
                    letterSpacing: "0.08em",
                    textTransform: "uppercase",
                    fontWeight: 800,
                  }}
                >
                  <span
                    style={{
                      width: 6,
                      height: 6,
                      borderRadius: 999,
                      background: "#67b7ff",
                      boxShadow: "0 0 8px rgba(103,183,255,0.55)",
                    }}
                  />
                  <span>{solCmeLiquidityIndicator.label}</span>
                </div>
              </>
            ) : null}
          </div>
        </div>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "flex-end", gap: 8, flexWrap: "wrap" }}>
          {replayState.isReplayMode ? (
            <div
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: 8,
                padding: "7px 11px",
                borderRadius: 999,
                color: "#d8e7ff",
                background: "rgba(103,183,255,0.1)",
                border: "1px solid rgba(103,183,255,0.22)",
                fontSize: 11,
                letterSpacing: "0.08em",
                textTransform: "uppercase",
                fontWeight: 800,
              }}
            >
              <span
                style={{
                  width: 7,
                  height: 7,
                  borderRadius: 999,
                  background: replayState.isPlaying ? "#67b7ff" : "#8ea0bf",
                  boxShadow: replayState.isPlaying ? "0 0 10px rgba(103,183,255,0.72)" : "none",
                }}
              />
              <span>{replayState.isPlaying ? "Replay Live" : "Replay Paused"}</span>
            </div>
          ) : null}
          <div
            style={{
              fontSize: 12,
              color: displayStatusTone.text,
              background: displayStatusTone.bg,
              border: `1px solid ${displayStatusTone.border}`,
              borderRadius: 999,
              padding: "7px 11px",
              letterSpacing: "0.11em",
              textTransform: "uppercase",
              fontWeight: 800,
            }}
          >
            {displayStatus}
          </div>
          <div
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 8,
              padding: "7px 11px",
              borderRadius: 999,
              color: positioningPill.color,
              background: positioningPill.background,
              border: `1px solid ${positioningPill.border}`,
              fontSize: 11,
              letterSpacing: "0.08em",
              textTransform: "uppercase",
              fontWeight: 800,
              boxShadow: `inset 0 1px 0 rgba(255,255,255,0.03), 0 0 16px ${positioningPill.background}`,
            }}
          >
            <span
              style={{
                width: 7,
                height: 7,
                borderRadius: 999,
                background: positioningPill.color,
                boxShadow: `0 0 10px ${positioningPill.color}`,
                opacity: positioningPill.label.endsWith("Unavailable") ? 0.75 : 1,
              }}
            />
            <span>{positioningPill.label}</span>
          </div>
          {replayCandleCount > 1 ? ghostButton(replayState.isReplayMode ? "Live Mode" : "Replay Mode", onToggleReplayMode, replayState.isReplayMode ? "#67b7ff" : "#d7e1f4") : null}
          {position ? ghostButton("Position Closed", () => onClosePosition(item), "#ff9d66") : null}
          {ghostButton("Back To Board", onExit, "#d7e1f4")}
        </div>
      </div>

      {isSolActusSymbol(item.symbol) ? (
        <div
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: 6,
            padding: 4,
            borderRadius: 999,
            background: "rgba(255,255,255,0.025)",
            border: "1px solid rgba(142,160,191,0.12)",
            width: "fit-content",
          }}
        >
          {([
            { id: "binance-execution", label: "Binance Execution" },
            { id: "cme-structure", label: "CME Structure" },
          ] as const).map((option) => {
            const active = solView === option.id;
            return (
              <button
                key={option.id}
                type="button"
                onClick={() => onSolViewChange(option.id)}
                style={{
                  border: active ? "1px solid rgba(69,255,181,0.28)" : "1px solid rgba(142,160,191,0.12)",
                  background: active ? "rgba(69,255,181,0.1)" : "rgba(255,255,255,0.02)",
                  color: active ? "#e7fff5" : "#aebdd8",
                  borderRadius: 999,
                  padding: "8px 12px",
                  cursor: "pointer",
                  fontSize: 11,
                  letterSpacing: "0.08em",
                  textTransform: "uppercase",
                  fontWeight: 800,
                }}
              >
                {option.label}
              </button>
            );
          })}
        </div>
      ) : null}

      <div style={{ display: "grid", gridTemplateColumns: "minmax(0, 1.42fr) minmax(220px, 0.42fr)", gap: 16, alignItems: "start" }}>
        <div style={{ display: "grid", gap: 16 }}>
        <div
          style={{
            padding: "4px 4px 3px",
            background:
              "radial-gradient(circle at top right, rgba(98,196,255,0.055), transparent 26%), linear-gradient(180deg, rgba(8,12,22,0.72), rgba(4,7,14,0.9))",
            borderRadius: 14,
            border: "1px solid rgba(132,151,186,0.08)",
            boxShadow: "inset 0 1px 0 rgba(255,255,255,0.02)",
          }}
        >
          <div style={{ display: "flex", justifyContent: "space-between", gap: 10, alignItems: "center", marginBottom: 8, flexWrap: "wrap", padding: "0 8px" }}>
            <div style={{ fontSize: 13, fontWeight: 600, color: "#f4f7fb" }}>
              {item.symbol}
              <span style={{ marginLeft: 8, fontFamily: '"Courier New", monospace', color: "#d7e1f4" }}>{item.price.toLocaleString()}</span>
              <span style={{ marginLeft: 8, color: item.changePct >= 0 ? "#3ef0a6" : "#ff7b7b" }}>
                {item.changePct >= 0 ? "+" : ""}
                {item.changePct.toFixed(2)}%
              </span>
            </div>
            <div style={{ fontSize: 11, color: "#7f8da8", letterSpacing: "0.08em", textTransform: "uppercase" }}>{item.timeframe}</div>
          </div>
          {replayState.isReplayMode ? (
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                gap: 12,
                alignItems: "flex-start",
                flexWrap: "wrap",
                marginBottom: 10,
                padding: "0 8px",
              }}
            >
              <div style={{ display: "grid", gap: 7, minWidth: 220, flex: "1 1 280px" }}>
                <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
                  <div
                    style={{
                      display: "inline-flex",
                      alignItems: "center",
                      gap: 8,
                      padding: "6px 10px",
                      borderRadius: 999,
                      background: "rgba(103,183,255,0.1)",
                      border: "1px solid rgba(103,183,255,0.22)",
                      color: "#d8e7ff",
                      fontSize: 10,
                      letterSpacing: "0.1em",
                      textTransform: "uppercase",
                      fontWeight: 800,
                    }}
                  >
                    <span
                      style={{
                        width: 6,
                        height: 6,
                        borderRadius: 999,
                        background: replayState.isPlaying ? "#67b7ff" : "#8ea0bf",
                        boxShadow: replayState.isPlaying ? "0 0 10px rgba(103,183,255,0.72)" : "none",
                      }}
                    />
                    <span>{replayState.isPlaying ? "Playing" : "Paused"}</span>
                  </div>
                  <div
                    style={{
                      display: "inline-flex",
                      alignItems: "center",
                      gap: 6,
                      padding: "6px 10px",
                      borderRadius: 999,
                      background: "rgba(255,255,255,0.03)",
                      border: "1px solid rgba(142,160,191,0.12)",
                      color: "#c8d5ee",
                      fontSize: 10,
                      letterSpacing: "0.09em",
                      textTransform: "uppercase",
                      fontWeight: 800,
                    }}
                  >
                    <span>Speed</span>
                    <span style={{ color: "#f4f7fb" }}>{replaySpeedLabel(replayState.replaySpeed)}</span>
                  </div>
                  <div style={{ fontSize: 11, color: "#b8c6de", fontWeight: 700 }}>
                    Candle {replayState.replayIndex + 1} of {replayCandleCount}
                  </div>
                </div>
                <div style={{ display: "grid", gap: 5 }}>
                  <div
                    style={{
                      height: 6,
                      borderRadius: 999,
                      overflow: "hidden",
                      background: "rgba(255,255,255,0.045)",
                      border: "1px solid rgba(142,160,191,0.08)",
                    }}
                  >
                    <div
                      style={{
                        width: `${Math.max(2, ((replayState.replayIndex + 1) / Math.max(replayCandleCount, 1)) * 100)}%`,
                        height: "100%",
                        borderRadius: 999,
                        background: "linear-gradient(90deg, rgba(103,183,255,0.86), rgba(69,255,181,0.86))",
                        boxShadow: "0 0 14px rgba(103,183,255,0.22)",
                      }}
                    />
                  </div>
                  <div style={{ fontSize: 10, color: "#7f8da8", letterSpacing: "0.08em", textTransform: "uppercase" }}>
                    Replay re-runs the ACTUS read candle by candle with no future leakage
                  </div>
                </div>
              </div>
              <div
                style={{
                  display: "inline-flex",
                  gap: 8,
                  flexWrap: "wrap",
                  alignItems: "center",
                  padding: "6px",
                  borderRadius: 14,
                  background: "rgba(5,9,16,0.38)",
                  border: "1px solid rgba(118,138,176,0.1)",
                }}
              >
                {ghostButton("Back", onReplayStepBack, "#8ea0bf")}
                {ghostButton(replayState.isPlaying ? "Pause" : "Play", onReplayPlayPause, replayState.isPlaying ? "#67b7ff" : "#45ffb5")}
                {ghostButton("Step", onReplayStepForward, "#d7e1f4")}
                {ghostButton(`Speed ${replaySpeedLabel(replayState.replaySpeed)}`, onReplaySpeedCycle, "#8ea0bf")}
              </div>
            </div>
          ) : null}
          <div style={{ borderRadius: 12, overflow: "hidden", background: "linear-gradient(180deg, rgba(12,18,30,0.42), rgba(8,12,22,0.84))", minHeight: 286 }}>
            <ActusChart
              symbol={chartSymbol}
              candles={chartCandles}
              livePrice={item.price}
              timeframe={item.timeframe}
              height={286}
              entry={entryDisplay}
              invalidation={stopDisplay}
              dayHigh={item.sessionContext?.dayHigh ?? null}
              dayLow={item.sessionContext?.dayLow ?? null}
              gammaOverlay={chartGammaOverlay}
              deltaSignal={deltaSignal}
            />
          </div>
        </div>

        <div
          style={{
            display: "grid",
            gap: 10,
            padding: "12px 14px",
            borderRadius: 14,
            background: "linear-gradient(180deg, rgba(10,14,25,0.62), rgba(5,8,14,0.84))",
            border: "1px solid rgba(118,138,176,0.08)",
          }}
        >
          <div style={{ display: "grid", gridTemplateColumns: "minmax(0, 1.34fr) minmax(240px, 0.78fr) minmax(196px, 0.68fr)", gap: 14, alignItems: "start" }}>
            <div style={{ display: "grid", gap: 8 }}>
              <div style={{ fontSize: 11, color: displayStatusTone.text, letterSpacing: "0.1em", textTransform: "uppercase" }}>
                {position ? "Position" : liveStatus === "IN TRADE" || liveStatus === "READY" ? "Execution" : liveStatus === "EXIT SOON" ? "Urgent" : "Decision"}
              </div>
              <div style={{ fontSize: 30, lineHeight: 1.05, fontWeight: 800, color: commandPrimaryColor, letterSpacing: "-0.04em" }}>
                {executionBlock.primary}
              </div>
              <div style={{ fontSize: 20, lineHeight: 1.08, fontWeight: 750, color: commandSecondaryColor, letterSpacing: "-0.02em" }}>
                {executionBlock.secondary}
              </div>
              {!closedSignal ? (
                <div
                  style={{
                    display: "inline-flex",
                    alignItems: "center",
                    gap: 8,
                    padding: "6px 10px",
                    borderRadius: 999,
                    background: "rgba(255,255,255,0.03)",
                    border: "1px solid rgba(118,138,176,0.12)",
                    color: "#c8d5ee",
                    fontSize: 12,
                    fontWeight: 600,
                  }}
                >
                  <span
                    style={{
                      color: "#f4f7fb",
                      background: "rgba(255,255,255,0.06)",
                      border: "1px solid rgba(118,138,176,0.16)",
                      borderRadius: 999,
                      padding: "4px 8px",
                      letterSpacing: "0.08em",
                      textTransform: "uppercase",
                      fontSize: 10,
                      lineHeight: 1,
                    }}
                  >
                    {actionTag}
                  </span>
                  <span
                    style={{
                      color: displayStatusTone.text,
                      letterSpacing: "0.08em",
                      textTransform: "uppercase",
                      fontSize: 10,
                    }}
                  >
                    {statePrompt.label}
                  </span>
                  <span>{statePrompt.body}</span>
                </div>
              ) : null}
              {unifiedPositioning ? (
                <div
                  style={{
                    display: "grid",
                    gap: 12,
                    padding: "14px 14px 12px",
                    borderRadius: 16,
                    background:
                      "radial-gradient(circle at top right, rgba(255,224,130,0.08), transparent 28%), linear-gradient(180deg, rgba(10,15,25,0.88), rgba(7,11,19,0.97))",
                    border: "1px solid rgba(118,138,176,0.16)",
                    boxShadow: "inset 0 1px 0 rgba(255,255,255,0.035), 0 12px 28px rgba(0,0,0,0.18)",
                    maxWidth: 700,
                  }}
                >
                  <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "flex-start", flexWrap: "wrap" }}>
                    <div style={{ display: "grid", gap: 5 }}>
                      <div style={{ fontSize: 10, color: "#7f8da8", letterSpacing: "0.12em", textTransform: "uppercase" }}>ACTUS Judgment</div>
                      <div style={{ display: "flex", alignItems: "baseline", gap: 10, flexWrap: "wrap" }}>
                        <div style={{ fontSize: 19, fontWeight: 820, color: "#f4f7fb", letterSpacing: "-0.03em", lineHeight: 1.05 }}>
                          {unifiedPositioning.bias === "NEUTRAL"
                            ? unifiedPositioning.condition.replace("_", " ")
                            : `${unifiedPositioning.bias} ${unifiedPositioning.condition.replace("_", " ")}`}
                        </div>
                        <div style={{ fontSize: 12, color: "#9fb0cb", letterSpacing: "0.08em", textTransform: "uppercase" }}>
                          {unifiedPositioning.regime}
                        </div>
                      </div>
                      <div style={{ fontSize: 12, color: "#aebdd8", lineHeight: 1.4 }}>
                        {actionabilityPill.summary}
                      </div>
                    </div>
                    <div style={{ display: "grid", gap: 8, justifyItems: "end" }}>
                      <div
                        style={{
                          display: "inline-flex",
                          alignItems: "center",
                          gap: 8,
                          padding: "8px 11px",
                          borderRadius: 999,
                          color: actionabilityPill.color,
                          background: actionabilityPill.background,
                          border: `1px solid ${actionabilityPill.border}`,
                          fontSize: 11,
                          letterSpacing: "0.08em",
                          textTransform: "uppercase",
                          fontWeight: 800,
                          boxShadow: `inset 0 1px 0 rgba(255,255,255,0.03), 0 0 20px ${actionabilityPill.background}`,
                        }}
                      >
                        {actionabilityPill.label}
                      </div>
                      <div
                        style={{
                          display: "grid",
                          gap: 2,
                          minWidth: 96,
                          padding: "9px 11px",
                          borderRadius: 12,
                          background: "linear-gradient(180deg, rgba(255,224,130,0.09), rgba(255,224,130,0.03))",
                          border: "1px solid rgba(255,224,130,0.2)",
                          textAlign: "right",
                        }}
                      >
                        <div style={{ fontSize: 10, color: "#bda86a", letterSpacing: "0.08em", textTransform: "uppercase" }}>Confidence</div>
                        <div style={{ fontSize: 22, fontWeight: 820, color: "#ffe082", letterSpacing: "-0.03em", lineHeight: 1 }}>
                          {Math.round(unifiedPositioning.confidence * 100)}%
                        </div>
                      </div>
                    </div>
                  </div>

                  <div style={{ display: "grid", gap: 8 }}>
                    <div style={{ fontSize: 10, color: "#7f8da8", letterSpacing: "0.12em", textTransform: "uppercase" }}>Exposure Map</div>
                    <div style={{ display: "grid", gridTemplateColumns: "repeat(2, minmax(0, 1fr))", gap: 10 }}>
                      <div
                        style={{
                          display: "grid",
                          gap: 10,
                          padding: "12px 12px 10px",
                          borderRadius: 14,
                          background:
                            "radial-gradient(circle at top right, rgba(103,183,255,0.05), transparent 28%), linear-gradient(180deg, rgba(8,12,20,0.72), rgba(5,8,15,0.9))",
                          border: "1px solid rgba(118,138,176,0.12)",
                        }}
                      >
                        <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "flex-start", flexWrap: "wrap" }}>
                          <div style={{ display: "grid", gap: 4 }}>
                            <div style={{ fontSize: 10, color: "#7f8da8", letterSpacing: "0.12em", textTransform: "uppercase" }}>Gamma Exposure</div>
                            <div style={{ fontSize: 12, color: "#aebdd8", lineHeight: 1.35 }}>
                              {positioningPill.summary}
                            </div>
                          </div>
                          <div
                            style={{
                              display: "inline-flex",
                              alignItems: "center",
                              gap: 8,
                              padding: "7px 10px",
                              borderRadius: 999,
                              color: positioningPill.color,
                              background: positioningPill.background,
                              border: `1px solid ${positioningPill.border}`,
                              fontSize: 10,
                              letterSpacing: "0.08em",
                              textTransform: "uppercase",
                              fontWeight: 800,
                              boxShadow: `inset 0 1px 0 rgba(255,255,255,0.03), 0 0 16px ${positioningPill.background}`,
                            }}
                          >
                            <span
                              style={{
                                width: 6,
                                height: 6,
                                borderRadius: 999,
                                background: positioningPill.color,
                                boxShadow: `0 0 10px ${positioningPill.color}`,
                              }}
                            />
                            <span>{positioningPill.label}</span>
                          </div>
                        </div>

                        <div style={{ display: "grid", gridTemplateColumns: "repeat(3, minmax(0, 1fr))", gap: 8 }}>
                          {deltaPanelField("Source", gammaExposureSourceLabel(gammaOverlay), "#d8e7ff", gammaOverlay?.updatedAt ? "Live source resolved" : "No source stamp")}
                          {deltaPanelField("Structure", gammaExposureDetail(unifiedPositioning, gammaOverlay), positioningPill.color, "Exposure map only")}
                          {deltaPanelField(
                            "Levels",
                            unifiedPositioning.gammaDirectionalAvailable
                              ? "Flip + walls"
                              : unifiedPositioning.gammaLevelsAvailable || Boolean(gammaOverlay?.source)
                                ? "Partial / mapped"
                                : "Absent",
                            positioningPill.color,
                            unifiedPositioning.gammaDirectionalAvailable ? "Directional map" : "Not a conviction signal by itself",
                          )}
                        </div>
                      </div>

                      {deltaSignal ? (
                        <div
                          style={{
                            display: "grid",
                            gap: 10,
                            padding: "12px 12px 10px",
                            borderRadius: 14,
                            background:
                              "radial-gradient(circle at top right, rgba(103,183,255,0.05), transparent 28%), linear-gradient(180deg, rgba(8,12,20,0.72), rgba(5,8,15,0.9))",
                            border: "1px solid rgba(118,138,176,0.12)",
                          }}
                        >
                          <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "flex-start", flexWrap: "wrap" }}>
                            <div style={{ display: "grid", gap: 4 }}>
                              <div style={{ fontSize: 10, color: "#7f8da8", letterSpacing: "0.12em", textTransform: "uppercase" }}>Delta Exposure</div>
                              <div style={{ fontSize: 12, color: "#aebdd8", lineHeight: 1.35 }}>
                                {deltaSummary(deltaSignal)}
                              </div>
                            </div>
                            <div
                              style={{
                                display: "inline-flex",
                                alignItems: "center",
                                gap: 8,
                                padding: "7px 10px",
                                borderRadius: 999,
                                color: deltaTone.color,
                                background: deltaTone.background,
                                border: `1px solid ${deltaTone.border}`,
                                fontSize: 10,
                                letterSpacing: "0.08em",
                                textTransform: "uppercase",
                                fontWeight: 800,
                                boxShadow: `inset 0 1px 0 rgba(255,255,255,0.03), 0 0 16px ${deltaTone.background}`,
                              }}
                            >
                              <span
                                style={{
                                  width: 6,
                                  height: 6,
                                  borderRadius: 999,
                                  background: deltaTone.color,
                                  boxShadow: `0 0 10px ${deltaTone.color}`,
                                }}
                              />
                              <span>{deltaTone.label}</span>
                            </div>
                          </div>

                          <div style={{ display: "grid", gridTemplateColumns: "repeat(3, minmax(0, 1fr))", gap: 8 }}>
                            {deltaPanelField(
                              "Evidence",
                              deltaSignal.deltaAvailability === "DIRECTIONAL"
                                ? "Directional"
                                : deltaSignal.deltaAvailability === "SOURCE_ONLY"
                                  ? "Flow present"
                                  : deltaSignal.deltaAvailability === "UNSUPPORTED"
                                    ? "Unsupported"
                                    : "Unavailable",
                              deltaTone.color,
                              deltaSignal.deltaDirectionalAvailable ? "Source + imbalance" : "Source truth without conviction",
                            )}
                            {deltaPanelField(
                              "Bias",
                              deltaSignal.deltaDirectionalAvailable ? (deltaSignal.bias ?? "NEUTRAL") : "NEUTRAL",
                              gammaBiasTone(deltaSignal.deltaDirectionalAvailable ? deltaSignal.bias ?? "NEUTRAL" : "NEUTRAL"),
                              deltaSignal.deltaDirectionalAvailable ? "Directional flow" : "No directional edge",
                            )}
                            {deltaPanelField(
                              "Read Quality",
                              deltaStrengthLabel(deltaSignal),
                              deltaStrengthTone(deltaSignal),
                              deltaSignal.deltaAvailability === "DIRECTIONAL"
                                ? "Net known flow imbalance"
                                : deltaSignal.deltaAvailability === "SOURCE_ONLY"
                                  ? "Real source flow"
                                  : deltaSignal.deltaAvailability === "UNSUPPORTED"
                                    ? "Not in current stack"
                                    : "No usable source",
                            )}
                          </div>
                        </div>
                      ) : null}
                    </div>
                  </div>

                  <div style={{ display: "grid", gap: 8 }}>
                    <div style={{ fontSize: 10, color: "#7f8da8", letterSpacing: "0.12em", textTransform: "uppercase" }}>Judgment Layer</div>
                    <div style={{ display: "grid", gridTemplateColumns: "repeat(4, minmax(0, 1fr))", gap: 8 }}>
                    {decisionPanelField("Positioning", positioningClassification.label.replace(/_/g, " "), positioningClassification.tone)}
                    {decisionPanelField("Regime", unifiedPositioning.regime)}
                    {decisionPanelField("Bias", unifiedPositioning.bias, gammaBiasTone(unifiedPositioning.bias))}
                    {decisionPanelField("Condition", unifiedPositioning.condition.replace("_", " "), gammaConditionTone(unifiedPositioning.condition))}
                    </div>
                  </div>

                  {decisionDrivers.length ? (
                    <div style={{ display: "grid", gap: 6 }}>
                      <div style={{ fontSize: 10, color: "#7f8da8", letterSpacing: "0.1em", textTransform: "uppercase" }}>Judgment Drivers</div>
                      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                        {decisionDrivers.map((driver, index) => (
                          <span
                            key={driver}
                            style={{
                              display: "inline-flex",
                              alignItems: "center",
                              gap: 7,
                              fontSize: 11,
                              color: "#dbe6f8",
                              background: "rgba(255,255,255,0.035)",
                              border: "1px solid rgba(142,160,191,0.16)",
                              borderRadius: 999,
                              padding: "6px 10px",
                              lineHeight: 1.2,
                              fontWeight: 600,
                            }}
                          >
                            <span style={{ color: "#8ea0bf", fontSize: 10, letterSpacing: "0.08em", textTransform: "uppercase" }}>
                              {index + 1}
                            </span>
                            <span>{driver}</span>
                          </span>
                        ))}
                      </div>
                    </div>
                  ) : null}

                </div>
              ) : null}
              {canMarkFilled ? (
                <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap", marginTop: 4 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "7px 10px", borderRadius: 999, background: "rgba(255,255,255,0.02)", border: "1px solid rgba(142,160,191,0.12)" }}>
                    <input
                      type="text"
                      value={fillPriceDraft}
                      onChange={(event) => onFillPriceDraftChange(item, event.target.value)}
                      placeholder={item.price.toLocaleString()}
                      style={{ width: 116, border: "none", outline: "none", background: "transparent", color: "#f4f7fb", fontSize: 12, fontWeight: 700 }}
                    />
                    <div style={{ fontSize: 10, color: "#7f8da8", letterSpacing: "0.08em", textTransform: "uppercase" }}>Fill Price</div>
                  </div>
                  {ghostButton("Order Filled", () => onOrderFilled(item), "#45ffb5")}
                </div>
              ) : null}
              {contextTags.length ? (
                <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 4 }}>
                  {contextTags.slice(0, 4).map((label) => (
                    <div
                      key={label}
                      style={{
                        fontSize: 12,
                        color: label === `[${sessionLabel}]` ? "#67b7ff" : "#c8d5ee",
                        background: "rgba(255,255,255,0.02)",
                        border: "1px solid rgba(142,160,191,0.1)",
                        borderRadius: 999,
                        padding: "5px 9px",
                        lineHeight: 1.2,
                      }}
                    >
                      {label}
                    </div>
                  ))}
                </div>
              ) : null}
            </div>
            <div style={{ padding: "10px 11px", borderRadius: 12, background: "linear-gradient(180deg, rgba(10,14,25,0.46), rgba(5,8,14,0.72))", border: "1px solid rgba(118,138,176,0.1)", display: "grid", gap: 7 }}>
              <div style={{ display: "grid", gap: 2 }}>
                <div style={{ fontSize: 10, color: "#7f8da8", letterSpacing: "0.08em", textTransform: "uppercase" }}>Position Status</div>
                <div style={{ fontSize: 13, color: "#f4f7fb", lineHeight: 1.35, fontWeight: 600 }}>
                  Entry {entryDisplay.toLocaleString()} • Current {item.price.toLocaleString()}
                </div>
                <div style={{ fontSize: 13, color: tradeDelta.positive ? "#3ef0a6" : "#ff8ea8", lineHeight: 1.35, fontWeight: 700 }}>
                  {tradeDelta.positive ? "+" : ""}
                  {tradeDelta.delta.toFixed(2)} / {tradeDelta.positive ? "+" : ""}
                  {tradeDelta.pct.toFixed(2)}%
                </div>
              </div>
              <div style={{ display: "grid", gap: 2 }}>
                <div style={{ fontSize: 10, color: "#7f8da8", letterSpacing: "0.08em", textTransform: "uppercase" }}>Distance To Stop</div>
                <div style={{ fontSize: 14, color: "#f4f7fb", fontWeight: 700 }}>{stopDistance.toFixed(2)}</div>
              </div>
              <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                <div style={{ fontSize: 10, color: momentumState === "Building" ? "#3ef0a6" : momentumState === "Weakening" ? "#ff8ea8" : "#d7e1f4", background: "rgba(255,255,255,0.03)", border: "1px solid rgba(118,138,176,0.1)", borderRadius: 999, padding: "4px 8px", letterSpacing: "0.08em", textTransform: "uppercase", fontWeight: 700 }}>
                  {momentumState}
                </div>
              </div>
            </div>
            <div style={{ display: "grid", gap: 10 }}>
              <div style={{ padding: "10px 11px", borderRadius: 12, background: "linear-gradient(180deg, rgba(8,15,20,0.62), rgba(3,9,12,0.82))", border: "1px solid rgba(62,240,166,0.16)" }}>
                <div style={{ fontSize: 10, color: "#3ef0a6", letterSpacing: "0.1em", textTransform: "uppercase", fontWeight: 700 }}>Entry Zone</div>
                <div style={{ marginTop: 5, fontSize: 18, color: "#f4f7fb", fontWeight: 700 }}>{entryDisplay.toLocaleString()}</div>
              </div>
              <div style={{ padding: "10px 11px", borderRadius: 12, background: "linear-gradient(180deg, rgba(20,8,14,0.62), rgba(12,3,7,0.82))", border: "1px solid rgba(255,111,145,0.16)" }}>
                <div style={{ fontSize: 10, color: "#ff6f91", letterSpacing: "0.1em", textTransform: "uppercase", fontWeight: 700 }}>Stop</div>
                <div style={{ marginTop: 5, fontSize: 18, color: "#f4f7fb", fontWeight: 700 }}>{stopDisplay.toLocaleString()}</div>
              </div>
              <div style={{ padding: "10px 11px", borderRadius: 12, background: "linear-gradient(180deg, rgba(17,15,8,0.52), rgba(11,9,4,0.78))", border: "1px solid rgba(201,166,94,0.16)" }}>
                <div style={{ fontSize: 10, color: "#d6b86e", letterSpacing: "0.1em", textTransform: "uppercase", fontWeight: 700 }}>Risk</div>
                <div style={{ marginTop: 5, fontSize: 18, color: "#f4f7fb", fontWeight: 700 }}>{executionRiskDisplay}</div>
                <div style={{ marginTop: 4, fontSize: 10, color: "#8ea0bf", letterSpacing: "0.06em", textTransform: "uppercase" }}>Entry to Stop</div>
              </div>
            </div>
          </div>
        </div>

        <div style={{ padding: "11px 13px", borderRadius: 14, background: "rgba(255,255,255,0.014)", border: "1px solid rgba(142,160,191,0.06)" }}>
              <div style={{ fontSize: 11, color: "#7f8da8", letterSpacing: "0.1em", textTransform: "uppercase" }}>{position ? "Management Read" : actusReadTitle(executionState)}</div>
          <div style={{ marginTop: 10, display: "grid", gap: 6 }}>
            {executionRead.slice(0, 3).map((line) => (
              <div key={line} style={{ fontSize: 15, lineHeight: 1.35, color: "#e6edf9", fontWeight: 600 }}>
                • {line}
              </div>
            ))}
          </div>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "repeat(4, minmax(0, 1fr))", gap: 10 }}>
          {compactMetricCard("Confidence", `${displayedConfidenceScore}%`, replayState.isReplayMode ? "Replay step" : undefined, colors.text)}
          {compactMetricCard("Opportunity", `${item.opportunityScore}`, undefined, "#d7e1f4")}
          {compactMetricCard("Freshness", perceivedFreshnessState(item), actusFreshnessDetail(item, nowTick), actusFreshnessTone(item))}
          {compactMetricCard("Risk", displayRisk(item.riskState), undefined, riskColor)}
        </div>

        {compactNyOpenFlowLabel(nyOpenFlow) ? (
          <div style={{ padding: "11px 13px", borderRadius: 14, background: "rgba(255,255,255,0.014)", border: "1px solid rgba(142,160,191,0.06)", display: "flex", justifyContent: "space-between", gap: 12, alignItems: "center", flexWrap: "wrap" }}>
            <div style={{ fontSize: 13, color: "#e6edf9", lineHeight: 1.4, fontWeight: 600 }}>
              {compactNyOpenFlowLabel(nyOpenFlow)}
            </div>
            <div style={{ fontSize: 11, color: nyOpenFlowAccent(nyOpenFlow), letterSpacing: "0.08em", textTransform: "uppercase", fontWeight: 700 }}>
              13:30-14:00 UTC
            </div>
          </div>
        ) : null}

        {(riskWatchLines.length || positioningLines.length) ? (
          <div style={{ padding: "11px 13px", borderRadius: 14, background: "rgba(255,255,255,0.014)", border: "1px solid rgba(142,160,191,0.06)", display: "grid", gap: 5 }}>
            <div style={{ fontSize: 11, color: "#7f8da8", letterSpacing: "0.1em", textTransform: "uppercase" }}>Watch / Risk</div>
            {riskWatchLines.map((line) => (
              <div key={line} style={{ fontSize: 14, color: "#f0c4c4", lineHeight: 1.4, fontWeight: 600 }}>
                • {line}
              </div>
            ))}
            {positioningLines.slice(0, 1).map((line) => (
              <div key={line} style={{ fontSize: 14, color: "#c6d4ef", lineHeight: 1.4 }}>
                • {line}
              </div>
            ))}
          </div>
        ) : null}
        </div>
        <aside
          style={{
            display: "grid",
            gap: 10,
            alignSelf: "start",
            padding: "12px 14px",
            borderRadius: 16,
            background: "linear-gradient(180deg, rgba(10,14,25,0.62), rgba(5,8,14,0.84))",
            border: "1px solid rgba(118,138,176,0.08)",
            boxShadow: "inset 0 1px 0 rgba(255,255,255,0.02)",
          }}
        >
          <div style={{ display: "grid", gap: 4 }}>
            <div style={{ fontSize: 10, color: "#7f8da8", letterSpacing: "0.12em", textTransform: "uppercase" }}>ACTUS Mode</div>
            <div style={{ fontSize: 15, color: "#f4f7fb", fontWeight: 700 }}>Asset Switcher</div>
          </div>
          <div style={{ display: "grid", gap: 8 }}>
            {assetUniverse.map((symbol) => {
              const isActive = actusModeSelectionSymbolCandidates(symbol).includes(item.symbol.toUpperCase());
              return (
                <div
                  key={`actus-mode-switch-${symbol}`}
                  style={{
                    display: "grid",
                    gridTemplateColumns: "minmax(0, 1fr) auto",
                    gap: 10,
                    alignItems: "center",
                    padding: "9px 10px",
                    borderRadius: 12,
                    background: isActive ? "rgba(69,255,181,0.08)" : "rgba(255,255,255,0.018)",
                    border: isActive ? "1px solid rgba(69,255,181,0.22)" : "1px solid rgba(118,138,176,0.1)",
                  }}
                >
                  <div style={{ fontSize: 13, color: isActive ? "#f4f7fb" : "#d7e1f4", fontWeight: isActive ? 700 : 600 }}>
                    {symbol}
                  </div>
                  <button
                    type="button"
                    onClick={() => onSwitchAsset(symbol)}
                    disabled={isActive}
                    style={{
                      border: isActive ? "1px solid rgba(69,255,181,0.24)" : "1px solid rgba(142,160,191,0.16)",
                      background: isActive ? "rgba(69,255,181,0.1)" : "rgba(255,255,255,0.02)",
                      color: isActive ? "#45ffb5" : "#d7e1f4",
                      borderRadius: 999,
                      padding: "7px 10px",
                      cursor: isActive ? "default" : "pointer",
                      fontSize: 10,
                      fontWeight: 800,
                      letterSpacing: "0.08em",
                      textTransform: "uppercase",
                      opacity: isActive ? 0.95 : 1,
                    }}
                  >
                    {isActive ? "Active" : "ACTUS MODE"}
                  </button>
                </div>
              );
            })}
          </div>
        </aside>
      </div>
    </section>
  );
}

function laneCard(
  title: string,
  action: ActusAction,
  items: ActusOpportunityOutput[],
  detail: string,
  nowTick: number,
  onOpenActusMode?: (symbol: string) => void,
) {
  const colors = tone(action);
  const laneGlow =
    action === "execute"
      ? "radial-gradient(circle at top, rgba(62,240,166,0.12), transparent 42%)"
      : action === "avoid"
        ? "radial-gradient(circle at top, rgba(255,123,123,0.1), transparent 42%)"
        : "radial-gradient(circle at top, rgba(245,200,106,0.12), transparent 42%)";
  const laneBorder =
    action === "execute"
      ? "rgba(62,240,166,0.26)"
      : action === "avoid"
        ? "rgba(255,123,123,0.24)"
        : "rgba(245,200,106,0.24)";

  return (
    <section
      style={{
        background: `${laneGlow}, linear-gradient(145deg, rgba(10,17,31,0.98), rgba(7,12,22,0.96))`,
        border: `1px solid ${laneBorder}`,
        borderRadius: 24,
        padding: 16,
        boxShadow: `inset 0 1px 0 rgba(255,255,255,0.03), inset 0 0 0 1px ${colors.bg}`,
        display: "grid",
        gap: 14,
        alignContent: "start",
        position: "relative",
        overflow: "hidden",
      }}
    >
      <div
        style={{
          position: "absolute",
          inset: "0 0 auto 0",
          height: 3,
          background: colors.text,
          opacity: 0.72,
        }}
      />
      <div style={{ display: "flex", justifyContent: "space-between", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
        <div>
          <div style={{ fontSize: 11, color: colors.text, letterSpacing: "0.12em", textTransform: "uppercase", fontWeight: 700 }}>{title}</div>
          <div style={{ marginTop: 6, fontSize: 13, color: "#9aabc8", lineHeight: 1.5 }}>{detail}</div>
        </div>
        {badge(`${items.length}`, colors.text, colors.bg, colors.border)}
      </div>

      {items.length ? (
        <div style={{ display: "grid", gap: 14 }}>{items.map((item) => opportunityCard(item, nowTick, onOpenActusMode))}</div>
      ) : (
        <div style={{ padding: 16, borderRadius: 16, background: "rgba(255,255,255,0.02)", border: "1px solid rgba(142,160,191,0.1)", fontSize: 14, color: "#9aabc8", lineHeight: 1.55 }}>
          No assets are currently landing in this lane.
        </div>
      )}
    </section>
  );
}

export default function App() {
  const [productPrefs, setProductPrefs] = useState<ProductPrefs>(() => readProductPrefs());
  const [selectedTimeframe, setSelectedTimeframe] = useState<TimeframeFilter>(() => readProductPrefs().preferredTimeframe);
  const { snapshot, loading, hasCachedInputs, refresh } = useActusPlatform(selectedTimeframe);
  const [viewMode, setViewMode] = useState<ViewMode>("focus");
  const [actusModeSelection, setActusModeSelection] = useState<ActusModeSelection | null>(null);
  const [actusReplayState, setActusReplayState] = useState<ActusReplayState>({
    isReplayMode: false,
    isPlaying: false,
    replayIndex: 0,
    replaySpeed: DEFAULT_REPLAY_SPEED,
  });
  const [actusReplayHistory, setActusReplayHistory] = useState<ActusReplayHistoryState>({
    loading: false,
    candles: null,
    resolved: false,
  });
  const [actusModeLiveChart, setActusModeLiveChart] = useState<ActusModeLiveChartState>({
    supported: false,
    connected: false,
    historyResolved: false,
    sparkline: null,
    candles: null,
    price: null,
    updatedAt: null,
  });
  const [actusModeGammaBase, setActusModeGammaBase] = useState<GammaOverlay | null>(null);
  const [actusModeDeltaSignal, setActusModeDeltaSignal] = useState<DeltaSignal | null>(null);
  const [actusModeRefreshTick, setActusModeRefreshTick] = useState(0);
  const [nowTick, setNowTick] = useState(0);
  const [commandHistory, setCommandHistory] = useState<CommandHistoryEntry[]>([]);
  const [inAppAlert, setInAppAlert] = useState<InAppAlert | null>(null);
  const [internalAlertEvents, setInternalAlertEvents] = useState<ActusInternalAlertEvent[]>([]);
  const [browserNotificationPermission, setBrowserNotificationPermission] = useState<NotificationPermission | "unsupported">(
    () => currentBrowserNotificationPermission(),
  );
  const [setupHistory, setSetupHistory] = useState<SetupHistoryEntry[]>(() => readLocalStorage(PRODUCT_HISTORY_KEY, [] as SetupHistoryEntry[]));
  const [openPositions, setOpenPositions] = useState<Record<string, OpenPositionRecord>>(() => readLocalStorage(OPEN_POSITIONS_KEY, {} as Record<string, OpenPositionRecord>));
  const [closedPositions, setClosedPositions] = useState<Record<string, ClosedPositionRecord>>(() => readLocalStorage(CLOSED_POSITIONS_KEY, {} as Record<string, ClosedPositionRecord>));
  const [fillPriceDrafts, setFillPriceDrafts] = useState<Record<string, string>>({});
  const [nyOpenFlowByAsset, setNyOpenFlowByAsset] = useState<NyOpenFlowMap>({});
  const [nyOpenFlowHistoryByAsset, setNyOpenFlowHistoryByAsset] = useState<NyOpenFlowHistoryMap>({});
  const [workflowAsset, setWorkflowAsset] = useState<string>("all");
  const alertTimestampsRef = useRef<Record<string, number>>({});
  const previousLifecycleRef = useRef<Record<string, ActusExecutionState>>({});
  const previousLaneActionRef = useRef<Record<string, ActusAction>>({});
  const previousManagementSignalRef = useRef<Record<string, string>>({});
  const previousInternalAlertStateRef = useRef<Record<string, ActusInternalAlertSnapshot>>({});
  const emittedInternalAlertSignaturesRef = useRef<Record<string, number>>({});
  const deliveredBrowserAlertIdsRef = useRef<Record<string, number>>({});
  const playedExecuteAlertSignaturesRef = useRef<Record<string, number>>({});
  const openSetupsRef = useRef<Record<string, OpenSetupRecord>>({});
  const actusModeGammaKeyRef = useRef<string | null>(null);
  const actusModeDeltaKeyRef = useRef<string | null>(null);

  useEffect(() => {
    const interval = window.setInterval(() => {
      setNowTick((tick) => tick + 1);
    }, 1000);

    return () => window.clearInterval(interval);
  }, []);

  useEffect(() => {
    writeLocalStorage(PRODUCT_PREFS_KEY, productPrefs);
  }, [productPrefs]);

  useEffect(() => {
    if (!browserNotificationsSupported()) {
      return;
    }

    const syncPermission = () => {
      setBrowserNotificationPermission(currentBrowserNotificationPermission());
    };

    syncPermission();
    window.addEventListener("focus", syncPermission);
    document.addEventListener("visibilitychange", syncPermission);

    return () => {
      window.removeEventListener("focus", syncPermission);
      document.removeEventListener("visibilitychange", syncPermission);
    };
  }, []);

  const nyOpenFlowAssets = useMemo(() => {
    const symbols = new Set<string>();
    snapshot.opportunities.forEach((item) => {
      const asset = mapSymbolToNyOpenFlowAsset(item.symbol);
      if (asset) {
        symbols.add(asset);
      }
    });
    const actusAsset = actusModeSelection ? mapSymbolToNyOpenFlowAsset(actusModeSelection.symbol) : null;
    if (actusAsset) {
      symbols.add(actusAsset);
    }
    return [...symbols] as NyOpenFlowAsset[];
  }, [snapshot.opportunities, actusModeSelection]);

  useEffect(() => {
    let cancelled = false;

    if (!nyOpenFlowAssets.length) {
      setNyOpenFlowByAsset({});
      return () => {
        cancelled = true;
      };
    }

    const load = async () => {
      const results = await Promise.all(
        nyOpenFlowAssets.map(async (asset) => {
          try {
            const [snapshot, history] = await Promise.all([
              fetchNyOpenFlowSnapshot(asset),
              fetchNyOpenFlowHistory(asset),
            ]);
            return [asset, { snapshot, history }] as const;
          } catch {
            return [asset, { snapshot: null, history: [] }] as const;
          }
        }),
      );

      if (cancelled) {
        return;
      }

      setNyOpenFlowByAsset(Object.fromEntries(results.map(([asset, value]) => [asset, value.snapshot])) as NyOpenFlowMap);
      setNyOpenFlowHistoryByAsset(
        Object.fromEntries(results.map(([asset, value]) => [asset, value.history])) as NyOpenFlowHistoryMap,
      );
    };

    void load();
    return () => {
      cancelled = true;
    };
  }, [nyOpenFlowAssets, actusModeRefreshTick, selectedTimeframe]);

  useEffect(() => {
    writeLocalStorage(PRODUCT_HISTORY_KEY, setupHistory);
  }, [setupHistory]);

  useEffect(() => {
    writeLocalStorage(OPEN_POSITIONS_KEY, openPositions);
  }, [openPositions]);

  useEffect(() => {
    writeLocalStorage(CLOSED_POSITIONS_KEY, closedPositions);
  }, [closedPositions]);

  useEffect(() => {
    setProductPrefs((current) =>
      current.preferredTimeframe === selectedTimeframe ? current : { ...current, preferredTimeframe: selectedTimeframe },
    );
  }, [selectedTimeframe]);

  useEffect(() => {
    if (!snapshot.hero) {
      return;
    }

    const nextEntry: CommandHistoryEntry = {
      id: `${snapshot.hero.symbol}-${snapshot.hero.action}-${snapshot.hero.timeframe}-${snapshot.hero.opportunityScore}`,
      symbol: snapshot.hero.symbol,
      action: snapshot.hero.action.toUpperCase(),
      timeframe: snapshot.hero.timeframe,
      score: snapshot.hero.opportunityScore,
      timestamp: Date.now(),
    };

    setCommandHistory((current) => {
      if (current[0]?.id === nextEntry.id) {
        return current;
      }

      return [nextEntry, ...current].slice(0, 6);
    });
  }, [snapshot.hero]);

  const filteredOpportunities = useMemo(() => snapshot.opportunities, [snapshot.opportunities]);

  useEffect(() => {
    const now = Date.now();
    const currentStates: Record<string, ActusExecutionState> = {};
    const nextOpenSetups = { ...openSetupsRef.current };
    const nextLaneActions: Record<string, ActusAction> = {};

    filteredOpportunities.forEach((item) => {
      const key = setupKey(item);
      const rawState = deriveActusExecutionState(item, {
        position: openPositions[key]
          ? {
              side: openPositions[key].side,
              stop: openPositions[key].stop,
              active: openPositions[key].active,
            }
          : null,
        closedPosition: closedPositions[key]
          ? {
              outcome: closedPositions[key].outcome,
            }
          : null,
      });
      const status = stabilizeExecutionTransition(previousLifecycleRef.current[key], rawState);
      currentStates[key] = status;
      const previousStatus = previousLifecycleRef.current[key];
      const previousLaneAction = previousLaneActionRef.current[key];
      nextLaneActions[key] = item.action;
      const alertsEnabled = isAlertEnabledForAsset(productPrefs, item.symbol);

      if (alertsEnabled && shouldAlertExecutionTransition(previousStatus, status)) {
        const throttleKey = `${key}-${previousStatus ?? "none"}-${status}`;
        const lastAlertAt = alertTimestampsRef.current[throttleKey] ?? 0;

        if (now - lastAlertAt > ALERT_THROTTLE_MS) {
          const nextAlert = alertPayload(item, status, previousStatus);
          setInAppAlert({
            id: `${throttleKey}-${now}`,
            symbol: item.symbol,
            title: nextAlert.title,
            body: nextAlert.body,
            tone: nextAlert.tone,
            createdAt: now,
          });
          alertTimestampsRef.current[throttleKey] = now;
        }
      }

      if (alertsEnabled && productPrefs.executeAlertsEnabled && previousLaneAction !== "execute" && item.action === "execute") {
        const throttleKey = `${key}-execute-appearance`;
        const lastAlertAt = alertTimestampsRef.current[throttleKey] ?? 0;

        if (now - lastAlertAt > ALERT_THROTTLE_MS) {
          setInAppAlert({
            id: `${throttleKey}-${now}`,
            symbol: item.symbol,
            title: item.direction === "short" ? `EXECUTE SHORT - ${item.symbol}` : `EXECUTE LONG - ${item.symbol}`,
            body: item.actionLine,
            tone: "active",
            createdAt: now,
            sound: "execute",
          });
          setInternalAlertEvents((current) => [
            {
              id: `${throttleKey}-${now}`,
              asset: item.symbol,
              timestamp: now,
              eventType: "execute-appearance" as const,
              snapshot: buildInternalAlertSnapshot(item),
              previousSnapshot: null,
            },
            ...current,
          ].slice(0, 40));
          alertTimestampsRef.current[throttleKey] = now;
        }
      }

      const existing = nextOpenSetups[key];
      const shouldTrack = isTrackableExecutionState(status);

      if (!existing && shouldTrack) {
        nextOpenSetups[key] = {
          key,
          symbol: item.symbol,
          timeframe: item.timeframe,
          startedAt: now,
          snapshot: item,
          lastStatus: status,
          everActive: status === "active",
        };
      } else if (existing) {
        nextOpenSetups[key] = {
          ...existing,
          lastStatus: status,
          snapshot: status === "active" ? item : existing.snapshot,
          everActive: existing.everActive || status === "active",
        };
      }

      if (existing && status === "invalidated") {
        if (openPositions[key]) {
          delete nextOpenSetups[key];
          return;
        }
        const finalized: SetupHistoryEntry = {
          id: `${key}-invalidated-${now}`,
          symbol: existing.symbol,
          timeframe: existing.timeframe,
          direction: existing.snapshot.direction,
          entry: existing.snapshot.entry,
          invalidation: existing.snapshot.invalidation,
          command: existing.snapshot.actionLine,
          outcome: "invalidated",
          startedAt: existing.startedAt,
          endedAt: now,
          snapshot: existing.snapshot,
        };

        setSetupHistory((current) => [finalized, ...current].slice(0, MAX_SETUP_HISTORY));
        delete nextOpenSetups[key];
      } else if (existing && existing.everActive && isExitExecutionState(status)) {
        if (openPositions[key]) {
          delete nextOpenSetups[key];
          return;
        }
        const finalized: SetupHistoryEntry = {
          id: `${key}-completed-${now}`,
          symbol: existing.symbol,
          timeframe: existing.timeframe,
          direction: existing.snapshot.direction,
          entry: existing.snapshot.entry,
          invalidation: existing.snapshot.invalidation,
          command: existing.snapshot.actionLine,
          outcome: "completed",
          startedAt: existing.startedAt,
          endedAt: now,
          snapshot: existing.snapshot,
        };

        setSetupHistory((current) => [finalized, ...current].slice(0, MAX_SETUP_HISTORY));
        delete nextOpenSetups[key];
      }
    });

    Object.entries(nextOpenSetups).forEach(([key, openSetup]) => {
      if (currentStates[key]) {
        return;
      }
      if (openPositions[key]) {
        delete nextOpenSetups[key];
        return;
      }

      const finalized: SetupHistoryEntry = {
        id: `${key}-expired-${now}`,
        symbol: openSetup.symbol,
        timeframe: openSetup.timeframe,
        direction: openSetup.snapshot.direction,
        entry: openSetup.snapshot.entry,
        invalidation: openSetup.snapshot.invalidation,
        command: openSetup.snapshot.actionLine,
        outcome: openSetup.everActive ? "completed" : "not-triggered",
        startedAt: openSetup.startedAt,
        endedAt: now,
        snapshot: openSetup.snapshot,
      };

      setSetupHistory((current) => [finalized, ...current].slice(0, MAX_SETUP_HISTORY));
      delete nextOpenSetups[key];
    });

    openSetupsRef.current = nextOpenSetups;
    previousLifecycleRef.current = currentStates;
    previousLaneActionRef.current = nextLaneActions;
  }, [closedPositions, filteredOpportunities, openPositions, productPrefs]);

  useEffect(() => {
    if (!productPrefs.browserAlertsEnabled || browserNotificationPermission !== "granted" || !inAppAlert || !shouldDeliverBrowserAlert()) {
      return;
    }

    const notification = buildBrowserNotificationFromInAppAlert(inAppAlert);
    const lastDeliveredAt = deliveredBrowserAlertIdsRef.current[notification.fingerprint] ?? 0;
    if (Date.now() - lastDeliveredAt <= ALERT_THROTTLE_MS) {
      return;
    }

    const instance = new window.Notification(notification.title, {
      body: notification.body,
      tag: notification.tag,
    });
    instance.onclick = () => {
      window.focus();
      instance.close();
    };
    deliveredBrowserAlertIdsRef.current[notification.fingerprint] = Date.now();
  }, [browserNotificationPermission, inAppAlert, productPrefs.browserAlertsEnabled]);

  useEffect(() => {
    if (!inAppAlert || inAppAlert.sound !== "execute" || !productPrefs.executeSoundEnabled) {
      return;
    }

    const fingerprint = `${inAppAlert.symbol}:${inAppAlert.title}:${inAppAlert.createdAt}`;
    const lastPlayedAt = playedExecuteAlertSignaturesRef.current[fingerprint] ?? 0;
    if (Date.now() - lastPlayedAt <= ALERT_THROTTLE_MS) {
      return;
    }

    playExecuteAlertSound();
    playedExecuteAlertSignaturesRef.current[fingerprint] = Date.now();
  }, [inAppAlert, productPrefs.executeSoundEnabled]);

  useEffect(() => {
    if (
      !productPrefs.browserAlertsEnabled ||
      browserNotificationPermission !== "granted" ||
      !internalAlertEvents.length ||
      !shouldDeliverBrowserAlert()
    ) {
      return;
    }

    const latestEvent = internalAlertEvents[0];
    const notification = buildBrowserNotificationFromInternalEvent(latestEvent);
    const lastDeliveredAt = deliveredBrowserAlertIdsRef.current[notification.fingerprint] ?? 0;
    if (Date.now() - lastDeliveredAt <= ALERT_THROTTLE_MS) {
      return;
    }

    const instance = new window.Notification(notification.title, {
      body: notification.body,
      tag: notification.tag,
    });
    instance.onclick = () => {
      window.focus();
      instance.close();
    };
    deliveredBrowserAlertIdsRef.current[notification.fingerprint] = Date.now();
  }, [browserNotificationPermission, internalAlertEvents, productPrefs.browserAlertsEnabled]);

  useEffect(() => {
    const now = Date.now();

    filteredOpportunities.forEach((item) => {
      const key = setupKey(item);
      const position = openPositions[key];
      if (!position || !position.active || !isAlertEnabledForAsset(productPrefs, item.symbol)) {
        return;
      }

      const nextSignal = managementSignal(item, position);
      if (nextSignal.mode === "stop-hit") {
        const stopAlertKey = `${key}-stop-hit`;
        const lastAlertAt = alertTimestampsRef.current[stopAlertKey] ?? 0;
        if (now - lastAlertAt > ALERT_THROTTLE_MS) {
          setInAppAlert({
            id: `${stopAlertKey}-${now}`,
            symbol: item.symbol,
            title: nextSignal.alertTitle,
            body: nextSignal.alertBody,
            tone: nextSignal.tone,
            createdAt: now,
          });
          alertTimestampsRef.current[stopAlertKey] = now;
        }

        setOpenPositions((current) => {
          const next = { ...current };
          delete next[key];
          return next;
        });
        setClosedPositions((current) => ({
          ...current,
          [key]: {
            key,
            symbol: item.symbol,
            outcome: "invalidated",
            exitLabel: "STOP HIT",
            exitPrice: item.price,
            timestamp: now,
          },
        }));
        const finalizedStopHit: SetupHistoryEntry = {
          id: `${key}-stop-hit-${now}`,
          symbol: item.symbol,
          timeframe: item.timeframe,
          direction: position.side,
          entry: position.snapshot.entry,
          invalidation: position.stop,
          command: position.snapshot.actionLine,
          outcome: "invalidated",
          startedAt: position.timestamp,
          endedAt: now,
          snapshot: position.snapshot,
          filledPrice: position.filledPrice,
          exitPrice: item.price,
          exitLabel: "STOP HIT",
        };
        setSetupHistory((current) => [finalizedStopHit, ...current].slice(0, MAX_SETUP_HISTORY));
        previousManagementSignalRef.current[key] = "closed";
        return;
      }

      const previousSignal = previousManagementSignalRef.current[key];
      if (nextSignal.mode === previousSignal || !nextSignal.alertTitle) {
        previousManagementSignalRef.current[key] = nextSignal.mode;
        return;
      }

      const throttleKey = `${key}-${nextSignal.mode}`;
      const lastAlertAt = alertTimestampsRef.current[throttleKey] ?? 0;
      if (now - lastAlertAt <= ALERT_THROTTLE_MS) {
        previousManagementSignalRef.current[key] = nextSignal.mode;
        return;
      }

      setInAppAlert({
        id: `${throttleKey}-${now}`,
        symbol: item.symbol,
        title: nextSignal.alertTitle,
        body: nextSignal.alertBody,
        tone: nextSignal.tone,
        createdAt: now,
      });
      alertTimestampsRef.current[throttleKey] = now;
      previousManagementSignalRef.current[key] = nextSignal.mode;
    });
  }, [filteredOpportunities, openPositions, productPrefs]);

  const grouped = useMemo(() => {
    const byConfidence = (a: ActusOpportunityOutput, b: ActusOpportunityOutput) =>
      b.confidenceScore - a.confidenceScore || b.opportunityScore - a.opportunityScore || a.symbol.localeCompare(b.symbol);

    return {
      wait: filteredOpportunities.filter((item) => item.action === "wait").slice().sort(byConfidence),
      execute: filteredOpportunities.filter((item) => item.action === "execute").slice().sort(byConfidence),
      avoid: filteredOpportunities.filter((item) => item.action === "avoid").slice().sort(byConfidence),
    };
  }, [filteredOpportunities]);
  const focusGrouped = useMemo(() => {
    const byConfidence = (a: ActusOpportunityOutput, b: ActusOpportunityOutput) =>
      b.confidenceScore - a.confidenceScore || b.opportunityScore - a.opportunityScore || a.symbol.localeCompare(b.symbol);
    const executeStates = new Set<ActusOpportunityOutput["state"]>(["execute"]);
    const waitStates = new Set<ActusOpportunityOutput["state"]>(["waiting", "watching", "building"]);

    return {
      execute: filteredOpportunities.filter((item) => item.action === "execute" || executeStates.has(item.state)).slice().sort(byConfidence),
      wait: filteredOpportunities
        .filter((item) => (item.action === "wait" || waitStates.has(item.state)) && item.action !== "execute" && !executeStates.has(item.state))
        .slice()
        .sort(byConfidence),
      avoid: filteredOpportunities
        .filter((item) => item.action === "avoid" && !waitStates.has(item.state) && !executeStates.has(item.state))
        .slice()
        .sort(byConfidence),
    };
  }, [filteredOpportunities]);

  const filteredHero = useMemo(() => snapshot.hero ?? filteredOpportunities[0] ?? null, [filteredOpportunities, snapshot.hero]);
  const actusModeSolView = useMemo(() => normalizeSolActusView(actusModeSelection), [actusModeSelection]);
  const actusModeLiveAsset = useMemo(
    () =>
      actusModeSelection
        ? filteredOpportunities.find((item) => item.symbol === actusModeSelection.symbol) ?? null
        : null,
    [actusModeSelection, filteredOpportunities],
  );
  const actusModeAsset = useMemo<ActusModeRenderableAsset | null>(() => {
    if (!actusModeSelection) {
      return null;
    }
    const actusSourceKey = resolveActusModeSourceKey(actusModeLiveAsset ?? actusModeSelection.snapshot, actusModeSolView) ?? actusModeSelection.symbol;
    const actusSourceLabel = actusSourceQualifier(actusModeSelection.symbol, actusModeSolView);
    const actusChartSymbol = resolveActusModeChartSymbol(actusModeSelection.snapshot, actusModeSolView);
    if (!actusModeLiveAsset) {
      return {
        ...actusModeSelection.snapshot,
        timeframe: actusModeSelection.timeframe,
        actusSourceKey,
        actusSourceLabel,
        actusChartSymbol,
      };
    }

    return {
      ...actusModeLiveAsset,
      timeframe: actusModeSelection.timeframe,
      direction: actusModeSelection.snapshot.direction,
      setupType: actusModeSelection.snapshot.setupType,
      actionLine: actusModeSelection.snapshot.actionLine,
      invalidationLine: actusModeSelection.snapshot.invalidationLine,
      entry: actusModeSelection.snapshot.entry,
      invalidation: actusModeSelection.snapshot.invalidation,
      summary: actusModeSelection.snapshot.summary,
      whyItMatters: actusModeSelection.snapshot.whyItMatters,
      contextLine: actusModeSelection.snapshot.contextLine,
      actusSourceKey,
      actusSourceLabel,
      actusChartSymbol,
    };
  }, [actusModeLiveAsset, actusModeSelection, actusModeSolView]);
  useEffect(() => {
    if (!actusModeSelection || actusModeSelection.timeframe === selectedTimeframe) {
      return;
    }

    setActusModeSelection((current) =>
      current
        ? {
            ...current,
            timeframe: selectedTimeframe,
            snapshot: {
              ...current.snapshot,
              timeframe: selectedTimeframe,
            },
          }
        : current,
    );
  }, [actusModeSelection, selectedTimeframe]);
  const actusModeStreamAsset = useMemo(
    () => resolveActusLiveAsset(actusModeAsset, actusModeSolView),
    [actusModeAsset, actusModeSolView],
  );

  useEffect(() => {
    if (!actusModeAsset) {
        setActusModeLiveChart({
          supported: false,
          connected: false,
          historyResolved: false,
          sparkline: null,
          candles: null,
          price: null,
          updatedAt: null,
        });
      return;
    }

    if (!actusModeStreamAsset) {
      setActusModeLiveChart({
        supported: false,
        connected: false,
        historyResolved: true,
        sparkline: actusModeAsset.sparkline,
        candles: buildSparklineFallbackCandles(actusModeAsset),
        price: actusModeAsset.price,
        updatedAt: Date.now(),
      });
      return;
    }

    setActusModeLiveChart({
      supported: true,
      connected: false,
      historyResolved: false,
      sparkline: actusModeAsset.sparkline,
      candles: supportsSparklineBootstrap(actusModeStreamAsset) ? buildSparklineFallbackCandles(actusModeAsset) : null,
      price: actusModeAsset.price,
      updatedAt: null,
    });

    let cancelled = false;
    let eventSource: EventSource | null = null;
    let reconnectTimer: number | null = null;

    const clearReconnectTimer = () => {
      if (reconnectTimer !== null) {
        window.clearTimeout(reconnectTimer);
        reconnectTimer = null;
      }
    };

    const cleanupEventSource = () => {
      eventSource?.removeEventListener("ready", handleReady as EventListener);
      eventSource?.removeEventListener("snapshot", handleSnapshot as EventListener);
      eventSource?.removeEventListener("error", handleError as EventListener);
      eventSource?.close();
      eventSource = null;
    };

    const scheduleReconnect = () => {
      if (cancelled || reconnectTimer !== null) return;
      reconnectTimer = window.setTimeout(() => {
        reconnectTimer = null;
        void bootstrapChart();
      }, 2000);
    };

    const handleReady = () => {
      clearReconnectTimer();
      setActusModeLiveChart((current) => ({
        ...current,
        supported: true,
        connected: true,
      }));
    };

    const handleSnapshot = (event: MessageEvent<string>) => {
      try {
        const payload = JSON.parse(event.data) as {
          ok: boolean;
          asset: string;
          timeframe: TimeframeFilter;
          snapshot: ActusLiveChartSnapshot;
        };
        const snapshot = payload?.snapshot ?? null;
        if (!snapshot) return;

        const normalized = snapshot.candle ? normalizeLiveCandle(snapshot.candle, actusModeStreamAsset, actusModeAsset.timeframe) : null;
        const livePrice =
          typeof snapshot.livePrice === "number" && Number.isFinite(snapshot.livePrice)
            ? snapshot.livePrice
            : normalized
              ? normalized.close
              : null;

        setActusModeLiveChart((current) => {
          const historyLimit = actusHistoryLimit();
          const baseSeries = current.sparkline?.length ? current.sparkline : actusModeAsset.sparkline;
          const mergedCandles = normalized
            ? mergeActusLiveCandleSeries(
                current.candles,
                normalized,
                actusModeStreamAsset,
                actusModeAsset.timeframe,
                historyLimit,
              )
            : current.candles;
          const nextCandles = evolveActusActiveCandleFromLivePrice(mergedCandles, {
            asset: actusModeStreamAsset,
            timeframe: actusModeAsset.timeframe,
            livePrice,
            updatedAt: snapshot.updatedAt ?? null,
          });
          const fallbackSparkline =
            livePrice !== null ? [...baseSeries.slice(-31), livePrice] : baseSeries;
          return {
            supported: true,
            connected: true,
            historyResolved: current.historyResolved,
            sparkline: nextCandles?.length ? nextCandles.slice(-32).map((candle) => candle.close) : fallbackSparkline,
            candles: nextCandles ?? current.candles,
            price: livePrice ?? current.price,
            updatedAt: snapshot.updatedAt ? Date.parse(snapshot.updatedAt) || Date.now() : Date.now(),
          };
        });
        if (actusModeAsset.symbol.toUpperCase() === "NQ") {
          console.info("[ACTUS][R14][NQ][frontend-live]", {
            incomingLivePrice: livePrice,
            incomingLiveTimestamp: snapshot.updatedAt ?? null,
            incomingLiveSymbol: snapshot.liveSymbol ?? null,
            candleTimestamp: normalized?.timestamp ?? snapshot.candle?.timestamp ?? null,
            displayedPrice: livePrice,
          });
        }
      } catch {
        Sentry.captureException(new Error("ACTUS Mode live chart snapshot parse failed"), {
          tags: { scope: "actus-live-chart-parse", symbol: actusModeAsset.symbol, timeframe: actusModeAsset.timeframe },
        });
        setActusModeLiveChart((current) => ({
          ...current,
          connected: false,
        }));
      }
    };

    const handleError = () => {
      setActusModeLiveChart((current) => ({
        ...current,
        connected: false,
      }));
      cleanupEventSource();
      scheduleReconnect();
    };

    const connectLive = () => {
      cleanupEventSource();
      eventSource = new EventSource(
        `${API_BASE}/api/actus/live-chart?asset=${encodeURIComponent(actusModeStreamAsset)}&timeframe=${encodeURIComponent(actusModeAsset.timeframe)}`,
      );
      eventSource.addEventListener("ready", handleReady as EventListener);
      eventSource.addEventListener("snapshot", handleSnapshot as EventListener);
      eventSource.addEventListener("error", handleError as EventListener);
      eventSource.onerror = handleError;
    };

    const loadHistory = async () => {
      const historyLimit = actusHistoryLimit();
      const minimumHistory = minimumActusHistoryCandles();
      if (!isDatabentoLiveAsset(actusModeStreamAsset)) {
        let sourceHistoryCandles: NormalizedFuturesCandle[] = [];
        try {
          sourceHistoryCandles = await fetchActusSourceHistory({
            asset: actusModeStreamAsset,
            timeframe: actusModeAsset.timeframe,
            limit: historyLimit,
          });
        } catch (error) {
          if (!cancelled) {
            setActusModeLiveChart((current) => ({
              ...current,
              historyResolved: true,
              candles: null,
              updatedAt: current.updatedAt ?? Date.now(),
            }));
          }
          throw error;
        }
        if (!cancelled) {
          const fallbackPrice =
            sourceHistoryCandles.length ? sourceHistoryCandles[sourceHistoryCandles.length - 1]?.close ?? null : null;
          setActusModeLiveChart((current) => ({
            ...current,
            historyResolved: true,
            candles: sourceHistoryCandles.length ? sourceHistoryCandles : null,
            sparkline: sourceHistoryCandles.length ? sourceHistoryCandles.slice(-32).map((candle) => candle.close) : current.sparkline,
            price: current.price ?? fallbackPrice,
            updatedAt: current.updatedAt ?? Date.now(),
          }));
        }
        return;
      }
      const initialCandles = await ensureActusCandleDepth({
        asset: actusModeStreamAsset,
        displaySymbol: actusModeAsset.symbol,
        timeframe: actusModeAsset.timeframe,
        historyLimit,
      });

        if (!cancelled && initialCandles.length) {
          setActusModeLiveChart((current) => ({
            ...current,
            historyResolved: true,
            candles: initialCandles.slice(-historyLimit),
            sparkline: initialCandles.slice(-32).map((candle) => candle.close),
            price: current.price ?? initialCandles[initialCandles.length - 1]?.close ?? null,
            updatedAt: current.updatedAt ?? Date.now(),
        }));
      }

      if (initialCandles.length < minimumHistory) {
        const fallbackCandles = await ensureActusCandleDepth({
          asset: actusModeStreamAsset,
          displaySymbol: actusModeAsset.symbol,
          timeframe: actusModeAsset.timeframe,
          historyLimit: Math.max(historyLimit + ACTUS_HISTORY_BUFFER, minimumHistory),
        });

          if (!cancelled && fallbackCandles.length > initialCandles.length) {
            setActusModeLiveChart((current) => ({
              ...current,
              historyResolved: true,
              candles: fallbackCandles.slice(-historyLimit),
              sparkline: fallbackCandles.slice(-32).map((candle) => candle.close),
              price: current.price ?? fallbackCandles[fallbackCandles.length - 1]?.close ?? null,
              updatedAt: current.updatedAt ?? Date.now(),
            }));
          }
        }

        if (!cancelled) {
          setActusModeLiveChart((current) => ({
            ...current,
            historyResolved: true,
          }));
        }
      };

    const bootstrapChart = async () => {
      connectLive();
      try {
        await loadHistory();
      } catch (error) {
        if (cancelled) return;
        Sentry.captureException(error, {
          tags: { scope: "actus-mode-history-bootstrap", symbol: actusModeAsset.symbol, timeframe: actusModeAsset.timeframe },
        });
        scheduleReconnect();
      }
    };

    void bootstrapChart();

    return () => {
      cancelled = true;
      clearReconnectTimer();
      cleanupEventSource();
    };
  }, [actusModeAsset?.symbol, actusModeAsset?.timeframe, actusModeRefreshTick, actusModeStreamAsset]);

  const actusModeLiveDisplayAsset = useMemo(
    () =>
      actusModeAsset
        ? {
            ...actusModeAsset,
            sparkline:
              hasRenderableActusSparkline(actusModeLiveChart.sparkline) ? actusModeLiveChart.sparkline : actusModeAsset.sparkline,
            price: actusModeLiveChart.price ?? actusModeAsset.price,
          }
        : null,
    [actusModeAsset, actusModeLiveChart.price, actusModeLiveChart.sparkline],
  );
  const actusModeSignalAsset = useMemo(
    () =>
      actusModeLiveDisplayAsset
        ? {
            ...actusModeLiveDisplayAsset,
            symbol: actusModeLiveDisplayAsset.actusSourceKey ?? actusModeLiveDisplayAsset.symbol,
          }
        : null,
    [actusModeLiveDisplayAsset],
  );
  const actusModeBaseChartCandles = useMemo(() => {
    if (hasRenderableActusCandles(actusModeLiveChart.candles)) {
      return actusModeLiveChart.candles;
    }

    const fallbackCandles =
      supportsSparklineBootstrap(actusModeStreamAsset) &&
      actusModeLiveDisplayAsset &&
      hasRenderableActusSparkline(actusModeLiveDisplayAsset.sparkline)
        ? buildSparklineFallbackCandles(actusModeLiveDisplayAsset)
        : null;

    if (fallbackCandles) {
      return fallbackCandles;
    }

    if (actusModeLiveChart.supported && !actusModeLiveChart.historyResolved) {
      return null;
    }

    return null;
  }, [actusModeLiveDisplayAsset, actusModeLiveChart.candles, actusModeLiveChart.historyResolved, actusModeLiveChart.supported, actusModeStreamAsset]);

  const actusReplayAvailable = Boolean(actusModeBaseChartCandles && actusModeBaseChartCandles.length > 1);
  const actusReplaySourceCandles = useMemo(() => {
    if (actusReplayState.isReplayMode && actusReplayHistory.candles?.length) {
      return actusReplayHistory.candles;
    }
    return actusModeBaseChartCandles;
  }, [actusModeBaseChartCandles, actusReplayHistory.candles, actusReplayState.isReplayMode]);
  const actusModeChartCandles = useMemo(() => {
    if (!actusReplayState.isReplayMode || !actusReplaySourceCandles?.length) {
      return actusModeBaseChartCandles;
    }

    return actusReplaySourceCandles.slice(0, actusReplayState.replayIndex + 1);
  }, [actusModeBaseChartCandles, actusReplaySourceCandles, actusReplayState.isReplayMode, actusReplayState.replayIndex]);

  const actusModeDisplayAsset = useMemo(() => {
    if (!actusModeLiveDisplayAsset) {
      return null;
    }

    if (!actusReplayState.isReplayMode || !actusModeChartCandles?.length) {
      return actusModeLiveDisplayAsset;
    }

    const replayCandles = actusModeChartCandles;
    const latestReplayCandle = replayCandles[replayCandles.length - 1] ?? null;
    const firstReplayOpen = replayCandles[0]?.open ?? null;
    const replayPrice = latestReplayCandle?.close ?? actusModeLiveDisplayAsset.price;
    const replayChangePct =
      typeof replayPrice === "number" && Number.isFinite(replayPrice) && typeof firstReplayOpen === "number" && Number.isFinite(firstReplayOpen) && firstReplayOpen !== 0
        ? ((replayPrice - firstReplayOpen) / firstReplayOpen) * 100
        : actusModeLiveDisplayAsset.changePct;

    return {
      ...actusModeLiveDisplayAsset,
      price: replayPrice,
      changePct: replayChangePct,
      sparkline: replayCandles.slice(-32).map((candle) => candle.close),
    };
  }, [actusModeChartCandles, actusModeLiveDisplayAsset, actusReplayState.isReplayMode]);
  useEffect(() => {
    setActusReplayState({
      isReplayMode: false,
      isPlaying: false,
      replayIndex: 0,
      replaySpeed: DEFAULT_REPLAY_SPEED,
    });
    setActusReplayHistory({
      loading: false,
      candles: null,
      resolved: false,
    });
  }, [actusModeAsset?.symbol, actusModeAsset?.timeframe]);

  useEffect(() => {
    if (!actusReplaySourceCandles?.length) {
      setActusReplayState((current) =>
        current.isReplayMode || current.isPlaying || current.replayIndex !== 0
          ? { ...current, isReplayMode: false, isPlaying: false, replayIndex: 0 }
          : current,
      );
      return;
    }

    const maxIndex = actusReplaySourceCandles.length - 1;
    setActusReplayState((current) =>
      current.replayIndex > maxIndex ? { ...current, replayIndex: maxIndex, isPlaying: false } : current,
    );
  }, [actusReplaySourceCandles]);

  useEffect(() => {
    let cancelled = false;

    if (!actusReplayState.isReplayMode || !actusModeStreamAsset || !actusModeAsset) {
      return;
    }

    if (!isDatabentoLiveAsset(actusModeStreamAsset)) {
      setActusReplayHistory({
        loading: false,
        candles: actusModeBaseChartCandles ?? null,
        resolved: true,
      });
      return;
    }

    if (actusReplayHistory.resolved || actusReplayHistory.loading) {
      return;
    }

    setActusReplayHistory({
      loading: true,
      candles: actusModeBaseChartCandles ?? null,
      resolved: false,
    });

    void ensureActusCandleDepth({
      asset: actusModeStreamAsset,
      displaySymbol: actusModeAsset.symbol,
      timeframe: actusModeAsset.timeframe,
      historyLimit: actusReplayHistoryLimit(actusModeAsset.timeframe),
    })
      .then((candles) => {
        if (cancelled) {
          return;
        }

        setActusReplayHistory({
          loading: false,
          candles: candles.length ? candles : actusModeBaseChartCandles ?? null,
          resolved: true,
        });
      })
      .catch((error) => {
        if (cancelled) {
          return;
        }
        Sentry.captureException(error, {
          tags: {
            scope: "actus-replay-history",
            symbol: actusModeAsset.symbol,
            timeframe: actusModeAsset.timeframe,
          },
        });
        setActusReplayHistory({
          loading: false,
          candles: actusModeBaseChartCandles ?? null,
          resolved: true,
        });
      });

    return () => {
      cancelled = true;
    };
  }, [
    actusModeAsset,
    actusModeBaseChartCandles,
    actusModeRefreshTick,
    actusModeStreamAsset,
    actusReplayHistory.loading,
    actusReplayHistory.resolved,
    actusReplayState.isReplayMode,
  ]);

  useEffect(() => {
    if (!actusReplayState.isReplayMode || !actusReplayState.isPlaying || !actusReplaySourceCandles?.length) {
      return;
    }

    const maxIndex = actusReplaySourceCandles.length - 1;
    if (actusReplayState.replayIndex >= maxIndex) {
      setActusReplayState((current) => (current.isPlaying ? { ...current, isPlaying: false } : current));
      return;
    }

    const timer = window.setTimeout(() => {
      setActusReplayState((current) => {
        const nextIndex = Math.min(current.replayIndex + 1, maxIndex);
        return {
          ...current,
          replayIndex: nextIndex,
          isPlaying: nextIndex < maxIndex,
        };
      });
    }, actusReplayState.replaySpeed);

    return () => window.clearTimeout(timer);
  }, [actusReplaySourceCandles, actusReplayState.isPlaying, actusReplayState.isReplayMode, actusReplayState.replayIndex, actusReplayState.replaySpeed]);
  const actusModePosition = useMemo(
    () => (actusReplayState.isReplayMode || !actusModeDisplayAsset ? null : openPositions[setupKey(actusModeDisplayAsset)] ?? null),
    [actusModeDisplayAsset, actusReplayState.isReplayMode, openPositions],
  );
  useEffect(() => {
    let cancelled = false;
    const liveAssetKey = actusModeSignalAsset ? `${actusModeSignalAsset.symbol}:${actusModeSignalAsset.timeframe}` : null;

    if (!actusModeSignalAsset) {
      setActusModeGammaBase(null);
      actusModeGammaKeyRef.current = null;
      return;
    }

    if (actusModeGammaKeyRef.current && actusModeGammaKeyRef.current !== liveAssetKey) {
      setActusModeGammaBase(null);
    }

    void resolveActusGammaOverlay(actusModeSignalAsset)
      .then((overlay) => {
        if (!cancelled) {
          setActusModeGammaBase(overlay);
          actusModeGammaKeyRef.current = liveAssetKey;
        }
      })
      .catch((error) => {
        Sentry.captureException(error, {
          tags: { scope: "actus-gamma-overlay", symbol: actusModeSignalAsset.symbol },
        });
      });

    return () => {
      cancelled = true;
    };
  }, [actusModeRefreshTick, actusModeSignalAsset]);

  useEffect(() => {
    let cancelled = false;
    const liveAssetKey = actusModeSignalAsset ? `${actusModeSignalAsset.symbol}:${actusModeSignalAsset.timeframe}` : null;

    if (!actusModeSignalAsset) {
      setActusModeDeltaSignal(null);
      actusModeDeltaKeyRef.current = null;
      return;
    }

    if (actusModeDeltaKeyRef.current && actusModeDeltaKeyRef.current !== liveAssetKey) {
      setActusModeDeltaSignal(null);
    }

    void resolveActusDeltaSignal(actusModeSignalAsset)
      .then((signal) => {
        if (!cancelled) {
          setActusModeDeltaSignal(signal);
          actusModeDeltaKeyRef.current = liveAssetKey;
        }
      })
      .catch((error) => {
        Sentry.captureException(error, {
          tags: { scope: "actus-delta-signal", symbol: actusModeSignalAsset.symbol },
        });
      });

    return () => {
      cancelled = true;
    };
  }, [actusModeRefreshTick, actusModeSignalAsset]);

  const actusModeGammaOverlay = useMemo(
    () =>
      !actusReplayState.isReplayMode && actusModeDisplayAsset && actusModeGammaBase
        ? withActusGammaSpot(
            actusModeGammaBase,
            typeof actusModeDisplayAsset.price === "number" && Number.isFinite(actusModeDisplayAsset.price)
              ? actusModeDisplayAsset.price
              : null,
          )
        : null,
    [actusModeDisplayAsset, actusModeGammaBase, actusReplayState.isReplayMode],
  );
  const actusModeEffectiveDeltaSignal = useMemo(
    () =>
      actusReplayState.isReplayMode
        ? actusModeDisplayAsset
          ? buildReplaySafeDeltaSignal(actusModeDisplayAsset.symbol)
          : null
        : actusModeDeltaSignal,
    [actusModeDeltaSignal, actusModeDisplayAsset, actusReplayState.isReplayMode],
  );
  const actusModeUnifiedPositioning = useMemo(
    () => (actusModeDisplayAsset ? deriveActusPositioning(actusModeDisplayAsset, actusModeGammaOverlay, actusModeEffectiveDeltaSignal) : null),
    [actusModeEffectiveDeltaSignal, actusModeDisplayAsset, actusModeGammaOverlay],
  );
  const actusModeClosedPosition = useMemo(
    () => (actusReplayState.isReplayMode || !actusModeDisplayAsset ? null : closedPositions[setupKey(actusModeDisplayAsset)] ?? null),
    [actusModeDisplayAsset, actusReplayState.isReplayMode, closedPositions],
  );
  useEffect(() => {
    if (!productPrefs.alertsEnabled) {
      return;
    }

    const nextSnapshots: Record<string, ActusInternalAlertSnapshot> = {};
    const nextEvents: ActusInternalAlertEvent[] = [];
    const now = Date.now();

    filteredOpportunities.forEach((item) => {
      const key = setupKey(item);
      nextSnapshots[key] = buildInternalAlertSnapshot(item);
    });

    if (actusModeDisplayAsset) {
      const actusKey = setupKey(actusModeDisplayAsset);
      nextSnapshots[actusKey] = buildInternalAlertSnapshot(actusModeDisplayAsset, {
        positioningType: actusModeUnifiedPositioning?.positioningType ?? null,
        deltaSignal: actusModeEffectiveDeltaSignal,
      });
    }

    Object.entries(nextSnapshots).forEach(([key, snapshot]) => {
      const previous = previousInternalAlertStateRef.current[key] ?? null;
      const transitions = buildInternalAlertEvents(previous, snapshot);

      transitions.forEach(({ eventType, signature }) => {
        const lastEmittedAt = emittedInternalAlertSignaturesRef.current[signature] ?? 0;
        if (now - lastEmittedAt <= ALERT_THROTTLE_MS) {
          return;
        }

        nextEvents.push({
          id: `${signature}-${now}`,
          asset: snapshot.symbol,
          timestamp: now,
          eventType,
          snapshot,
          previousSnapshot: previous,
        });
        emittedInternalAlertSignaturesRef.current[signature] = now;
      });
    });

    previousInternalAlertStateRef.current = nextSnapshots;

    if (nextEvents.length) {
      setInternalAlertEvents((current) => [...nextEvents, ...current].slice(0, 40));
    }
  }, [filteredOpportunities, actusModeDisplayAsset, actusModeEffectiveDeltaSignal, actusModeUnifiedPositioning, productPrefs.alertsEnabled]);

  const filteredRanked = useMemo(
    () =>
      filteredOpportunities
        .slice()
        .sort(
          (a, b) =>
            b.opportunityScore - a.opportunityScore || b.confidenceScore - a.confidenceScore || a.symbol.localeCompare(b.symbol),
        )
        .map((item, index) => ({
          rank: index + 1,
          symbol: item.symbol,
          displayName: item.displayName,
          action: item.action,
          triggerQuality: item.triggerQuality,
          opportunityScore: item.opportunityScore,
          summary: item.summary,
        })),
    [filteredOpportunities],
  );

  const commandPanel = useMemo(() => {
    const topActionable = grouped.execute[0] ?? null;
    const bestCurrentSetup =
      topActionable ??
      filteredOpportunities
        .slice()
        .sort((a, b) => b.confidenceScore - a.confidenceScore || b.opportunityScore - a.opportunityScore)[0] ??
      null;
    const nextBest = filteredOpportunities
      .filter((item) => item.symbol !== bestCurrentSetup?.symbol)
      .slice()
      .sort((a, b) => b.confidenceScore - a.confidenceScore || b.opportunityScore - a.opportunityScore)
      .slice(0, topActionable ? 3 : 2);
    const watchList = grouped.wait
      .filter((item) => item.state === "building" || item.state === "watching")
      .slice(0, 3);
    const noEdge = [...grouped.avoid, ...grouped.wait.filter((item) => item.state === "waiting")]
      .slice()
      .sort((a, b) => a.confidenceScore - b.confidenceScore || a.opportunityScore - b.opportunityScore)
      .slice(0, 3);

    return { topActionable, bestCurrentSetup, nextBest, watchList, noEdge };
  }, [filteredOpportunities, grouped.avoid, grouped.execute, grouped.wait]);

  const workflowAssets = useMemo(
    () =>
      Array.from(new Set(filteredOpportunities.map((item) => item.symbol)))
        .slice()
        .sort((a, b) => a.localeCompare(b)),
    [filteredOpportunities],
  );

  useEffect(() => {
    if (workflowAsset === "all") {
      return;
    }

    if (!workflowAssets.includes(workflowAsset)) {
      setWorkflowAsset(workflowAssets[0] ?? "all");
    }
  }, [workflowAsset, workflowAssets]);

  const selectedWorkflowAsset = workflowAsset === "all" ? filteredHero?.symbol ?? workflowAssets[0] ?? null : workflowAsset;
  const selectedWorkflowOpportunity =
    filteredOpportunities.find((item) => item.symbol === selectedWorkflowAsset) ??
    (filteredHero?.symbol === selectedWorkflowAsset ? filteredHero : null);
  const selectedWorkflowNote = selectedWorkflowAsset ? productPrefs.notesByAsset[selectedWorkflowAsset] ?? "" : "";

  const todayKey = new Date().toDateString();
  const todayHistory = useMemo(
    () => setupHistory.filter((entry) => new Date(entry.endedAt).toDateString() === todayKey),
    [setupHistory, todayKey],
  );
  const todayCompleted = todayHistory.filter((entry) => entry.outcome === "completed").length;
  const todayInvalidated = todayHistory.filter((entry) => entry.outcome === "invalidated").length;
  const todayExpired = todayHistory.filter((entry) => entry.outcome === "not-triggered").length;
  const todayAvoided = grouped.avoid.length;
  const dailyLoopTitle = grouped.execute[0]
    ? `Top Setup Today: ${grouped.execute[0].symbol}`
    : "No Trade Day";
  const dailyLoopBody = grouped.execute[0]
    ? grouped.execute[0].actionLine
    : "No clean executable setup. Discipline maintained.";
  const behaviorMessages = [
    todayCompleted
      ? `${todayCompleted} setup${todayCompleted === 1 ? "" : "s"} completed cleanly today`
      : "No trade day - discipline maintained",
    todayExpired ? `${todayExpired} setup${todayExpired === 1 ? "" : "s"} expired without a clean entry` : null,
    todayInvalidated ? `${todayInvalidated} setup${todayInvalidated === 1 ? "" : "s"} invalidated and were cut` : null,
    todayAvoided ? `${todayAvoided} no-trade condition${todayAvoided === 1 ? "" : "s"} filtered right now` : null,
  ].filter(Boolean) as string[];

  const hero = filteredHero;
  const showFirstLoadSkeleton = loading && !hasCachedInputs && !actusModeSelection;
  const topStatus = topBarStatus(snapshot.status.mode, snapshot.status.health);
  const lastUpdatedText = updateLabel(snapshot.status.mode, snapshot.status.health, snapshot.status.lastUpdatedLabel);

  const openActusMode = (symbol: string) => {
    const candidateSymbols = actusModeSelectionSymbolCandidates(symbol);
    const selected =
      filteredOpportunities.find((item) => candidateSymbols.includes(item.symbol.toUpperCase())) ??
      (hero && candidateSymbols.includes(hero.symbol.toUpperCase()) ? hero : null);
    if (!selected) {
      return;
    }

    setActusModeSelection({
      symbol: selected.symbol,
      timeframe: selectedTimeframe,
      snapshot: {
        ...selected,
        timeframe: selectedTimeframe,
      },
      solView: isSolActusSymbol(selected.symbol) ? "binance-execution" : undefined,
    });
  };

  const handleSolActusViewChange = (nextView: SolActusView) => {
    if (!actusModeSelection || !isSolActusSymbol(actusModeSelection.symbol) || normalizeSolActusView(actusModeSelection) === nextView) {
      return;
    }

    clearActusGammaOverlayCache();
    clearActusDeltaSignalCache();
    setActusReplayHistory({
      loading: false,
      candles: null,
      resolved: false,
    });
    setActusModeLiveChart({
      supported: true,
      connected: false,
      historyResolved: false,
      sparkline: null,
      candles: null,
      price: null,
      updatedAt: null,
    });
    setActusModeSelection((current) => (current ? { ...current, solView: nextView } : current));
    setActusModeRefreshTick((tick) => tick + 1);
  };

  const toggleActusReplayMode = () => {
    if (!actusReplayAvailable || !actusModeBaseChartCandles?.length) {
      return;
    }

    setActusReplayState((current) => {
      if (current.isReplayMode) {
        return {
          ...current,
          isReplayMode: false,
          isPlaying: false,
        };
      }

      const seedCandles = actusReplayHistory.candles?.length ? actusReplayHistory.candles : actusModeBaseChartCandles;
      const maxIndex = Math.max((seedCandles?.length ?? 1) - 1, 0);
      return {
        ...current,
        isReplayMode: true,
        isPlaying: false,
        replayIndex: Math.min(Math.max(23, 0), maxIndex),
      };
    });
  };

  const toggleActusReplayPlayback = () => {
    if (!actusReplayAvailable || !actusModeBaseChartCandles?.length) {
      return;
    }

    setActusReplayState((current) => {
      const seedCandles = actusReplayHistory.candles?.length ? actusReplayHistory.candles : actusModeBaseChartCandles;
      const maxIndex = Math.max((seedCandles?.length ?? 1) - 1, 0);
      if (!current.isReplayMode) {
        return {
          ...current,
          isReplayMode: true,
          isPlaying: true,
          replayIndex: Math.min(Math.max(23, 0), maxIndex),
        };
      }

      if (current.replayIndex >= maxIndex && !current.isPlaying) {
        return {
          ...current,
          isPlaying: true,
          replayIndex: Math.min(Math.max(23, 0), maxIndex),
        };
      }

      return {
        ...current,
        isPlaying: !current.isPlaying,
      };
    });
  };

  const stepActusReplayBack = () => {
    if (!actusReplayAvailable || !actusModeBaseChartCandles?.length) {
      return;
    }

    setActusReplayState((current) => ({
      ...current,
      isReplayMode: true,
      isPlaying: false,
      replayIndex: Math.max(current.replayIndex - 1, 0),
    }));
  };

  const stepActusReplayForward = () => {
    if (!actusReplayAvailable || !actusModeBaseChartCandles?.length) {
      return;
    }

    const maxIndex = actusModeBaseChartCandles.length - 1;
    setActusReplayState((current) => ({
      ...current,
      isReplayMode: true,
      isPlaying: false,
      replayIndex: Math.min(current.replayIndex + 1, maxIndex),
    }));
  };

  const cycleActusReplaySpeed = () => {
    setActusReplayState((current) => {
      const currentIndex = REPLAY_SPEEDS.indexOf(current.replaySpeed as (typeof REPLAY_SPEEDS)[number]);
      const nextSpeed = REPLAY_SPEEDS[(currentIndex + 1 + REPLAY_SPEEDS.length) % REPLAY_SPEEDS.length];
      return {
        ...current,
        replaySpeed: nextSpeed,
      };
    });
  };

  const markOrderFilled = (item: ActusOpportunityOutput) => {
    if (item.direction !== "long" && item.direction !== "short") {
      return;
    }

    const key = setupKey(item);
    const side: "long" | "short" = item.direction;
    const draftValue = fillPriceDrafts[key];
    const parsedDraft = draftValue ? Number(draftValue.replace(/,/g, "")) : NaN;
    const filledPrice = Number.isFinite(parsedDraft) && parsedDraft > 0 ? parsedDraft : Number.isFinite(item.price) ? item.price : item.entry;
    setOpenPositions((current) => ({
      ...current,
      [key]: {
        key,
        symbol: item.symbol,
        timeframe: item.timeframe,
        side,
        filledPrice,
        stop: item.invalidation,
        timestamp: Date.now(),
        active: true,
        snapshot: item,
      },
    }));
    setClosedPositions((current) => {
      const next = { ...current };
      delete next[key];
      return next;
    });
    setFillPriceDrafts((current) => {
      const next = { ...current };
      delete next[key];
      return next;
    });
  };

  const closePosition = (item: ActusOpportunityOutput) => {
    const key = setupKey(item);
    const position = openPositions[key];
    if (!position) {
      return;
    }

    const delta = position.side === "short" ? position.filledPrice - item.price : item.price - position.filledPrice;
    const management = managementSignal(item, position);
    const outcome: SetupOutcome =
      management.mode === "stop-hit" ? "invalidated" : delta > 0 ? "completed" : "exited-early";
    const exitLabel: ClosedPositionRecord["exitLabel"] =
      management.mode === "stop-hit" ? "STOP HIT" : outcome === "completed" ? "COMPLETED" : "EXITED";

    setOpenPositions((current) => {
      const next = { ...current };
      delete next[key];
      return next;
    });
    setClosedPositions((current) => ({
      ...current,
      [key]: {
        key,
        symbol: item.symbol,
        outcome,
        exitLabel,
        exitPrice: item.price,
        timestamp: Date.now(),
      },
    }));
    const finalizedPosition: SetupHistoryEntry = {
      id: `${key}-filled-${Date.now()}`,
      symbol: item.symbol,
      timeframe: item.timeframe,
      direction: position.side,
      entry: position.snapshot.entry,
      invalidation: position.stop,
      command: position.snapshot.actionLine,
      outcome,
      startedAt: position.timestamp,
      endedAt: Date.now(),
      snapshot: position.snapshot,
      filledPrice: position.filledPrice,
      exitPrice: item.price,
      exitLabel,
    };
    setSetupHistory((current) => [finalizedPosition, ...current].slice(0, MAX_SETUP_HISTORY));
    previousManagementSignalRef.current[key] = "closed";
  };

  const updateFillPriceDraft = (item: ActusOpportunityOutput, value: string) => {
    const key = setupKey(item);
    setFillPriceDrafts((current) => ({
      ...current,
      [key]: value,
    }));
  };

  const toggleFavorite = (symbol: string) => {
    setProductPrefs((current) => ({
      ...current,
      favorites: current.favorites.includes(symbol)
        ? current.favorites.filter((item) => item !== symbol)
        : [...current.favorites, symbol].slice().sort((a, b) => a.localeCompare(b)),
    }));
  };

  const toggleAssetAlert = (symbol: string) => {
    setProductPrefs((current) => ({
      ...current,
      alertEnabledByAsset: {
        ...current.alertEnabledByAsset,
        [symbol]: !(current.alertEnabledByAsset[symbol] ?? true),
      },
    }));
  };

  const toggleAlertsEnabled = () => {
    setProductPrefs((current) => ({
      ...current,
      alertsEnabled: !current.alertsEnabled,
    }));
  };

  const toggleExecuteAlertsEnabled = () => {
    setProductPrefs((current) => ({
      ...current,
      executeAlertsEnabled: !current.executeAlertsEnabled,
    }));
  };

  const requestBrowserNotifications = async () => {
    if (!browserNotificationsSupported()) {
      setBrowserNotificationPermission("unsupported");
      return;
    }

    const currentPermission = currentBrowserNotificationPermission();
    if (currentPermission === "granted") {
      setBrowserNotificationPermission("granted");
      setProductPrefs((current) => ({ ...current, browserAlertsEnabled: true }));
      return;
    }

    const nextPermission = await window.Notification.requestPermission();
    setBrowserNotificationPermission(nextPermission);
    if (nextPermission === "granted") {
      setProductPrefs((current) => ({ ...current, browserAlertsEnabled: true }));
    }
  };

  const toggleBrowserAlerts = async () => {
    if (!browserNotificationsSupported()) {
      setBrowserNotificationPermission("unsupported");
      return;
    }

    if (productPrefs.browserAlertsEnabled) {
      setProductPrefs((current) => ({ ...current, browserAlertsEnabled: false }));
      return;
    }

    await requestBrowserNotifications();
  };

  const toggleExecuteSound = () => {
    setProductPrefs((current) => ({
      ...current,
      executeSoundEnabled: !current.executeSoundEnabled,
    }));
  };

  const updateWorkflowNote = (symbol: string, note: string) => {
    setProductPrefs((current) => ({
      ...current,
      notesByAsset: {
        ...current.notesByAsset,
        [symbol]: note,
      },
    }));
  };

  const browserAlertStatusLabel =
    browserNotificationPermission === "unsupported"
      ? "Unsupported"
      : browserNotificationPermission === "granted"
        ? productPrefs.browserAlertsEnabled
          ? "Enabled"
          : "Ready"
        : browserNotificationPermission === "denied"
          ? "Blocked"
          : "Permission needed";
  const masterAlertStatusLabel = productPrefs.alertsEnabled ? "On" : "Off";
  const executeAlertStatusLabel = productPrefs.executeAlertsEnabled ? "On" : "Off";
  const soundStatusLabel = productPrefs.executeSoundEnabled ? "On" : "Off";

  const handleHeaderRefresh = async () => {
    if (actusModeSelection) {
      clearDatabentoFuturesHistoryCache();
      clearActusGammaOverlayCache();
      clearActusDeltaSignalCache();
      setActusReplayHistory({
        loading: false,
        candles: null,
        resolved: false,
      });
      setActusModeLiveChart((current) => ({
        ...current,
        connected: false,
        historyResolved: false,
      }));
      setActusModeRefreshTick((tick) => tick + 1);
    }

    await refresh({ force: true });
  };

  return (
    <div style={{ minHeight: "100vh", background: "radial-gradient(circle at top left, rgba(69,255,181,0.08), transparent 18%), radial-gradient(circle at 85% 0%, rgba(103,183,255,0.08), transparent 18%), linear-gradient(180deg, #000000 0%, #010101 46%, #020202 100%)", color: "#f4f7fb", padding: 22, fontFamily: '"Segoe UI", "Aptos", sans-serif' }}>
      <div style={{ width: "min(1480px, 100%)", margin: "0 auto", background: "linear-gradient(180deg, rgba(5,7,11,0.96), rgba(2,3,7,0.99))", border: "1px solid rgba(118,138,176,0.14)", borderRadius: 28, overflow: "hidden", boxShadow: "0 28px 90px rgba(0,0,0,0.56), inset 0 1px 0 rgba(255,255,255,0.03)", position: "relative" }}>
        <div style={{ position: "absolute", inset: 0, pointerEvents: "none", background: "linear-gradient(90deg, rgba(69,255,181,0.03), transparent 12%, transparent 88%, rgba(103,183,255,0.03)), linear-gradient(180deg, rgba(255,255,255,0.012), transparent 22%)" }} />

        <header style={{ padding: "18px 22px", borderBottom: "1px solid rgba(132,151,186,0.12)", display: "flex", alignItems: "center", justifyContent: "space-between", gap: 16, flexWrap: "wrap", background: "linear-gradient(180deg, rgba(255,255,255,0.025), rgba(255,255,255,0.01))", position: "relative", zIndex: 1 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
            <div style={{ display: "flex", alignItems: "center" }}>
              <img src="/actus-logo.png" alt="ACTUS OS" style={{ width: 186, height: 68, objectFit: "contain", display: "block", filter: "drop-shadow(0 12px 26px rgba(98,255,164,0.14))" }} />
            </div>
            <div>
              <div style={{ fontSize: 11, color: "#8ea0bf", letterSpacing: "0.22em", textTransform: "uppercase" }}>{ACTUS_PRODUCT_LANGUAGE.brand}</div>
              <div style={{ marginTop: 4, fontSize: 18, fontWeight: 600, letterSpacing: "-0.01em" }}>{ACTUS_PRODUCT_LANGUAGE.topBar}</div>
            </div>
            {badge(topStatus.label, topStatus.color, topStatus.background, topStatus.border)}
          </div>

          <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap", justifyContent: "flex-end" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 6, padding: 4, borderRadius: 999, background: "rgba(255,255,255,0.025)", border: "1px solid rgba(142,160,191,0.12)", boxShadow: "inset 0 1px 0 rgba(255,255,255,0.03)" }}>
              <button
                type="button"
                onClick={() => (actusModeDisplayAsset ? setActusModeSelection(null) : hero ? openActusMode(hero.symbol) : undefined)}
                style={{
                  border: actusModeDisplayAsset ? "1px solid rgba(69,255,181,0.34)" : "1px solid rgba(142,160,191,0.12)",
                  background: actusModeDisplayAsset
                    ? "linear-gradient(180deg, rgba(69,255,181,0.24), rgba(18,123,84,0.14))"
                    : "transparent",
                  color: actusModeDisplayAsset ? "#f4f7fb" : "#8ea0bf",
                  borderRadius: 999,
                  padding: "8px 14px",
                  cursor: hero || actusModeDisplayAsset ? "pointer" : "default",
                  fontSize: 11,
                  letterSpacing: "0.1em",
                  textTransform: "uppercase",
                  fontWeight: 700,
                  boxShadow: actusModeDisplayAsset ? "inset 0 1px 0 rgba(255,255,255,0.06), 0 0 24px rgba(69,255,181,0.2)" : "none",
                }}
              >
                ACTUS Mode
              </button>
              {VIEW_MODES.map((mode) => {
                const active = !actusModeDisplayAsset && viewMode === mode;

                return (
                  <button
                    key={mode}
                    type="button"
                    onClick={() => {
                      setActusModeSelection(null);
                      setViewMode(mode);
                    }}
                    style={{
                      border: active ? "1px solid rgba(130,168,255,0.24)" : "1px solid rgba(142,160,191,0.12)",
                      background: active ? "linear-gradient(180deg, rgba(90,140,255,0.26), rgba(90,140,255,0.1))" : "transparent",
                      color: active ? "#f4f7fb" : "#8ea0bf",
                      borderRadius: 999,
                      padding: "8px 14px",
                      cursor: "pointer",
                      fontSize: 11,
                      letterSpacing: "0.1em",
                      textTransform: "uppercase",
                      fontWeight: 700,
                      boxShadow: active ? "inset 0 1px 0 rgba(255,255,255,0.05), 0 0 18px rgba(90,140,255,0.12)" : "none",
                      transition: "background 140ms ease, border-color 140ms ease, box-shadow 140ms ease, color 140ms ease",
                    }}
                  >
                    {displayViewMode(mode)}
                  </button>
                );
              })}
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 6, padding: 4, borderRadius: 999, background: "rgba(255,255,255,0.025)", border: "1px solid rgba(142,160,191,0.12)" }}>
              {TIMEFRAME_OPTIONS.map((option) => {
                const active = selectedTimeframe === option;

                return (
                  <button
                    key={option}
                    type="button"
                    onClick={() => setSelectedTimeframe(option)}
                    style={{
                      border: "1px solid rgba(142,160,191,0.12)",
                      background: active ? "linear-gradient(180deg, rgba(62,240,166,0.18), rgba(62,240,166,0.08))" : "transparent",
                      color: active ? "#f4f7fb" : "#8ea0bf",
                      borderRadius: 999,
                      padding: "8px 12px",
                      cursor: "pointer",
                      fontSize: 11,
                      letterSpacing: "0.08em",
                      textTransform: "uppercase",
                      boxShadow: active ? "inset 0 1px 0 rgba(255,255,255,0.04)" : "none",
                    }}
                  >
                    {option}
                  </button>
                );
              })}
            </div>
            {badge("Decision Engine", "#d7e1f4", "rgba(255,255,255,0.03)", "rgba(142,160,191,0.14)")}
            {badge(lastUpdatedText, snapshot.status.health === "healthy" ? "#9ecdb6" : "#8ea0bf", "rgba(255,255,255,0.03)", "rgba(142,160,191,0.14)")}
            <button type="button" onClick={() => void handleHeaderRefresh()} style={{ border: "1px solid rgba(142,160,191,0.12)", background: "linear-gradient(180deg, rgba(255,255,255,0.035), rgba(255,255,255,0.015))", color: "#b8c6de", borderRadius: 999, padding: "9px 14px", cursor: "pointer", fontSize: 11, letterSpacing: "0.06em", textTransform: "uppercase", boxShadow: "inset 0 1px 0 rgba(255,255,255,0.02)" }}>
              Refresh
            </button>
          </div>
        </header>

        <div style={{ padding: 22, display: "grid", gap: 20, position: "relative", zIndex: 1 }}>
          {showFirstLoadSkeleton ? loadingCardGrid() : null}
          {!showFirstLoadSkeleton && actusModeDisplayAsset
            ? actusModePanel(
              actusModeDisplayAsset,
              actusModeChartCandles,
              actusModeGammaOverlay,
              actusModeEffectiveDeltaSignal,
              (() => {
                const flowAsset = mapSymbolToNyOpenFlowAsset(actusModeDisplayAsset.symbol);
                return flowAsset ? nyOpenFlowByAsset[flowAsset] ?? null : null;
              })(),
              actusReplayState,
              nowTick,
              () => setActusModeSelection(null),
              toggleActusReplayMode,
              toggleActusReplayPlayback,
              stepActusReplayBack,
              stepActusReplayForward,
              cycleActusReplaySpeed,
              actusModePosition,
              actusModeClosedPosition,
              fillPriceDrafts[setupKey(actusModeDisplayAsset)] ?? "",
              updateFillPriceDraft,
              markOrderFilled,
              closePosition,
              ACTUS_MODE_ASSET_UNIVERSE,
              openActusMode,
              actusModeSolView,
              handleSolActusViewChange,
              )
            : null}
          {!showFirstLoadSkeleton && !actusModeDisplayAsset && hero ? heroSignalCard(hero, nowTick, openActusMode) : null}
          {!showFirstLoadSkeleton && !actusModeDisplayAsset ? (
            <section
              style={{
                background: "linear-gradient(145deg, rgba(10,17,31,0.98), rgba(7,12,22,0.96))",
                border: "1px solid rgba(132,151,186,0.16)",
                borderRadius: 24,
                padding: 18,
                boxShadow: "inset 0 1px 0 rgba(255,255,255,0.03)",
                display: "grid",
                gap: 14,
              }}
            >
              <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "center", flexWrap: "wrap" }}>
                <div>
                  <div style={{ fontSize: 11, color: "#7f8da8", letterSpacing: "0.12em", textTransform: "uppercase" }}>Alert Controls</div>
                  <div style={{ marginTop: 6, fontSize: 18, fontWeight: 700, color: "#f4f7fb" }}>Core alert visibility and delivery</div>
                </div>
                {badge(productPrefs.alertsEnabled ? "Alerts Enabled" : "Alerts Muted", productPrefs.alertsEnabled ? "#45ffb5" : "#ff8ea8", productPrefs.alertsEnabled ? "rgba(69,255,181,0.08)" : "rgba(255,111,145,0.08)", productPrefs.alertsEnabled ? "rgba(69,255,181,0.28)" : "rgba(255,111,145,0.24)")}
              </div>

              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 12 }}>
                <div style={{ padding: "12px 14px", borderRadius: 14, background: "rgba(255,255,255,0.018)", border: "1px solid rgba(132,151,186,0.1)" }}>
                  <div style={{ display: "flex", justifyContent: "space-between", gap: 10, alignItems: "center" }}>
                    <div style={{ fontSize: 11, color: "#7f8da8", letterSpacing: "0.1em", textTransform: "uppercase" }}>Alerts</div>
                    {badge(masterAlertStatusLabel, productPrefs.alertsEnabled ? "#45ffb5" : "#ff8ea8", productPrefs.alertsEnabled ? "rgba(69,255,181,0.08)" : "rgba(255,111,145,0.08)", productPrefs.alertsEnabled ? "rgba(69,255,181,0.28)" : "rgba(255,111,145,0.24)")}
                  </div>
                  <div style={{ marginTop: 8, fontSize: 13, color: "#d7e1f4", lineHeight: 1.45 }}>
                    Master control for in-app execution and management alerts.
                  </div>
                  <button
                    type="button"
                    onClick={toggleAlertsEnabled}
                    style={{
                      marginTop: 12,
                      border: productPrefs.alertsEnabled ? "1px solid rgba(69,255,181,0.3)" : "1px solid rgba(142,160,191,0.16)",
                      background: productPrefs.alertsEnabled ? "rgba(69,255,181,0.08)" : "rgba(255,255,255,0.02)",
                      color: productPrefs.alertsEnabled ? "#45ffb5" : "#d7e1f4",
                      borderRadius: 999,
                      padding: "8px 12px",
                      cursor: "pointer",
                      fontSize: 11,
                      fontWeight: 700,
                      letterSpacing: "0.08em",
                      textTransform: "uppercase",
                    }}
                  >
                    {productPrefs.alertsEnabled ? "Turn Alerts Off" : "Turn Alerts On"}
                  </button>
                </div>

                <div style={{ padding: "12px 14px", borderRadius: 14, background: "rgba(255,255,255,0.018)", border: "1px solid rgba(132,151,186,0.1)" }}>
                  <div style={{ display: "flex", justifyContent: "space-between", gap: 10, alignItems: "center" }}>
                    <div style={{ fontSize: 11, color: "#7f8da8", letterSpacing: "0.1em", textTransform: "uppercase" }}>Execute Alerts</div>
                    {badge(executeAlertStatusLabel, productPrefs.executeAlertsEnabled ? "#45ffb5" : "#ff8ea8", productPrefs.executeAlertsEnabled ? "rgba(69,255,181,0.08)" : "rgba(255,111,145,0.08)", productPrefs.executeAlertsEnabled ? "rgba(69,255,181,0.28)" : "rgba(255,111,145,0.24)")}
                  </div>
                  <div style={{ marginTop: 8, fontSize: 13, color: "#d7e1f4", lineHeight: 1.45 }}>
                    Controls first-entry EXECUTE appearance alerts without changing the execute logic itself.
                  </div>
                  <button
                    type="button"
                    onClick={toggleExecuteAlertsEnabled}
                    style={{
                      marginTop: 12,
                      border: productPrefs.executeAlertsEnabled ? "1px solid rgba(69,255,181,0.3)" : "1px solid rgba(142,160,191,0.16)",
                      background: productPrefs.executeAlertsEnabled ? "rgba(69,255,181,0.08)" : "rgba(255,255,255,0.02)",
                      color: productPrefs.executeAlertsEnabled ? "#45ffb5" : "#d7e1f4",
                      borderRadius: 999,
                      padding: "8px 12px",
                      cursor: "pointer",
                      fontSize: 11,
                      fontWeight: 700,
                      letterSpacing: "0.08em",
                      textTransform: "uppercase",
                    }}
                  >
                    {productPrefs.executeAlertsEnabled ? "Turn Execute Alerts Off" : "Turn Execute Alerts On"}
                  </button>
                </div>

                <div style={{ padding: "12px 14px", borderRadius: 14, background: "rgba(255,255,255,0.018)", border: "1px solid rgba(132,151,186,0.1)" }}>
                  <div style={{ display: "flex", justifyContent: "space-between", gap: 10, alignItems: "center" }}>
                    <div style={{ fontSize: 11, color: "#7f8da8", letterSpacing: "0.1em", textTransform: "uppercase" }}>Sound</div>
                    {badge(soundStatusLabel, productPrefs.executeSoundEnabled ? "#45ffb5" : "#d7e1f4", productPrefs.executeSoundEnabled ? "rgba(69,255,181,0.08)" : "rgba(255,255,255,0.03)", productPrefs.executeSoundEnabled ? "rgba(69,255,181,0.28)" : "rgba(142,160,191,0.14)")}
                  </div>
                  <div style={{ marginTop: 8, fontSize: 13, color: "#d7e1f4", lineHeight: 1.45 }}>
                    Premium single-tone cue for execute appearance only.
                  </div>
                  <button
                    type="button"
                    onClick={toggleExecuteSound}
                    style={{
                      marginTop: 12,
                      border: productPrefs.executeSoundEnabled ? "1px solid rgba(69,255,181,0.3)" : "1px solid rgba(142,160,191,0.16)",
                      background: productPrefs.executeSoundEnabled ? "rgba(69,255,181,0.08)" : "rgba(255,255,255,0.02)",
                      color: productPrefs.executeSoundEnabled ? "#45ffb5" : "#d7e1f4",
                      borderRadius: 999,
                      padding: "8px 12px",
                      cursor: "pointer",
                      fontSize: 11,
                      fontWeight: 700,
                      letterSpacing: "0.08em",
                      textTransform: "uppercase",
                    }}
                  >
                    {productPrefs.executeSoundEnabled ? "Turn Sound Off" : "Turn Sound On"}
                  </button>
                </div>

                <div style={{ padding: "12px 14px", borderRadius: 14, background: "rgba(255,255,255,0.018)", border: "1px solid rgba(132,151,186,0.1)" }}>
                  <div style={{ display: "flex", justifyContent: "space-between", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
                    <div style={{ fontSize: 11, color: "#7f8da8", letterSpacing: "0.1em", textTransform: "uppercase" }}>Notifications</div>
                    {badge(browserAlertStatusLabel.toUpperCase(), browserNotificationPermission === "denied" ? "#ff8ea8" : browserNotificationPermission === "granted" && productPrefs.browserAlertsEnabled ? "#45ffb5" : "#d7e1f4", browserNotificationPermission === "denied" ? "rgba(255,111,145,0.08)" : browserNotificationPermission === "granted" && productPrefs.browserAlertsEnabled ? "rgba(69,255,181,0.08)" : "rgba(255,255,255,0.03)", browserNotificationPermission === "denied" ? "rgba(255,111,145,0.24)" : browserNotificationPermission === "granted" && productPrefs.browserAlertsEnabled ? "rgba(69,255,181,0.28)" : "rgba(142,160,191,0.14)")}
                  </div>
                  <div style={{ marginTop: 8, fontSize: 13, color: "#d7e1f4", lineHeight: 1.45 }}>
                    {browserNotificationPermission === "denied"
                      ? "Browser permission is blocked. Re-enable notifications in the browser first."
                      : browserNotificationPermission === "unsupported"
                        ? "This browser does not support system notifications."
                        : productPrefs.browserAlertsEnabled
                          ? "External notifications are enabled for off-screen ACTUS alerts."
                          : "Enable notifications to receive alerts when ACTUS is in the background."}
                  </div>
                  <div style={{ marginTop: 12, display: "flex", gap: 8, flexWrap: "wrap" }}>
                    {browserNotificationPermission !== "granted" ? (
                      <button
                        type="button"
                        onClick={() => void requestBrowserNotifications()}
                        disabled={browserNotificationPermission === "unsupported"}
                        style={{
                          border: "1px solid rgba(103,183,255,0.24)",
                          background: "rgba(103,183,255,0.08)",
                          color: "#67b7ff",
                          borderRadius: 999,
                          padding: "8px 12px",
                          cursor: browserNotificationPermission === "unsupported" ? "default" : "pointer",
                          fontSize: 11,
                          fontWeight: 700,
                          letterSpacing: "0.08em",
                          textTransform: "uppercase",
                          opacity: browserNotificationPermission === "unsupported" ? 0.55 : 1,
                        }}
                      >
                        Enable Notifications
                      </button>
                    ) : (
                      <button
                        type="button"
                        onClick={() => void toggleBrowserAlerts()}
                        style={{
                          border: productPrefs.browserAlertsEnabled ? "1px solid rgba(69,255,181,0.3)" : "1px solid rgba(142,160,191,0.16)",
                          background: productPrefs.browserAlertsEnabled ? "rgba(69,255,181,0.08)" : "rgba(255,255,255,0.02)",
                          color: productPrefs.browserAlertsEnabled ? "#45ffb5" : "#d7e1f4",
                          borderRadius: 999,
                          padding: "8px 12px",
                          cursor: "pointer",
                          fontSize: 11,
                          fontWeight: 700,
                          letterSpacing: "0.08em",
                          textTransform: "uppercase",
                        }}
                      >
                        {productPrefs.browserAlertsEnabled ? "Turn Notifications Off" : "Turn Notifications On"}
                      </button>
                    )}
                  </div>
                </div>
              </div>
            </section>
          ) : null}

          {!showFirstLoadSkeleton && !actusModeDisplayAsset && viewMode === "deep" ? (
            <section style={{ display: "grid", gridTemplateColumns: "minmax(320px, 0.82fr) minmax(0, 1.18fr)", gap: 18 }}>
              {!productPrefs.onboardingDismissed ? (
                <section style={{ background: "linear-gradient(145deg, rgba(10,17,31,0.98), rgba(7,12,22,0.96))", border: "1px solid rgba(132,151,186,0.16)", borderRadius: 24, padding: 18, boxShadow: "inset 0 1px 0 rgba(255,255,255,0.03)", display: "grid", gap: 12 }}>
                  <div style={{ display: "flex", justifyContent: "space-between", gap: 10, alignItems: "center" }}>
                    <div>
                      <div style={{ fontSize: 11, color: "#7f8da8", letterSpacing: "0.12em", textTransform: "uppercase" }}>Start Here</div>
                      <div style={{ marginTop: 8, fontSize: 22, fontWeight: 700, color: "#f4f7fb" }}>ACTUS in 30 seconds</div>
                    </div>
                    {ghostButton("Dismiss", () => setProductPrefs((current) => ({ ...current, onboardingDismissed: true })))}
                  </div>
                  <div style={{ display: "grid", gap: 10 }}>
                    {[
                      { step: "1", title: "Board = what matters", body: "Scan the lead setup, then ignore weak lanes." },
                      { step: "2", title: "ACTUS Mode = execution", body: "Open one asset only when it earns focus." },
                      { step: "3", title: "Follow the command", body: "DO NOT TRADE, READY, IN TRADE, EXIT." },
                    ].map((item) => (
                      <div key={item.step} style={{ display: "grid", gridTemplateColumns: "28px minmax(0, 1fr)", gap: 10, alignItems: "start", padding: "10px 12px", borderRadius: 14, background: "rgba(255,255,255,0.018)", border: "1px solid rgba(132,151,186,0.1)" }}>
                        <div style={{ width: 28, height: 28, borderRadius: 999, display: "grid", placeItems: "center", background: "rgba(69,255,181,0.08)", color: "#45ffb5", fontSize: 12, fontWeight: 700 }}>{item.step}</div>
                        <div>
                          <div style={{ fontSize: 13, color: "#f4f7fb", fontWeight: 700 }}>{item.title}</div>
                          <div style={{ marginTop: 4, fontSize: 13, color: "#9aabc8", lineHeight: 1.5 }}>{item.body}</div>
                        </div>
                      </div>
                    ))}
                  </div>
                </section>
              ) : (
                <section style={{ background: "linear-gradient(145deg, rgba(10,17,31,0.98), rgba(7,12,22,0.96))", border: "1px solid rgba(132,151,186,0.16)", borderRadius: 24, padding: 18, boxShadow: "inset 0 1px 0 rgba(255,255,255,0.03)" }}>
                  <div style={{ fontSize: 11, color: "#7f8da8", letterSpacing: "0.12em", textTransform: "uppercase" }}>Daily Loop</div>
                  <div style={{ marginTop: 10, fontSize: 22, fontWeight: 700, color: grouped.execute[0] ? "#45ffb5" : "#d7e1f4" }}>{dailyLoopTitle}</div>
                  <div style={{ marginTop: 8, fontSize: 14, color: "#c8d5ee", lineHeight: 1.55 }}>{dailyLoopBody}</div>
                  <div style={{ marginTop: 14, display: "grid", gap: 8 }}>
                    {behaviorMessages.slice(0, 3).map((message) => (
                      <div key={message} style={{ padding: "10px 12px", borderRadius: 12, background: "rgba(255,255,255,0.018)", border: "1px solid rgba(132,151,186,0.1)", fontSize: 13, color: "#d7e1f4", lineHeight: 1.45 }}>
                        {message}
                      </div>
                    ))}
                  </div>
                </section>
              )}

              <section style={{ background: "linear-gradient(145deg, rgba(10,17,31,0.98), rgba(7,12,22,0.96))", border: "1px solid rgba(132,151,186,0.16)", borderRadius: 24, padding: 18, boxShadow: "inset 0 1px 0 rgba(255,255,255,0.03)", display: "grid", gap: 16 }}>
                <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "center", flexWrap: "wrap" }}>
                  <div>
                    <div style={{ fontSize: 11, color: "#7f8da8", letterSpacing: "0.12em", textTransform: "uppercase" }}>Workflow</div>
                    <div style={{ marginTop: 6, fontSize: 18, fontWeight: 700, color: "#f4f7fb" }}>Saved assets and alert control</div>
                  </div>
                  {badge(`Pref TF ${productPrefs.preferredTimeframe}`, "#d7e1f4", "rgba(255,255,255,0.03)", "rgba(142,160,191,0.14)")}
                </div>

                <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                  {workflowAssets.map((symbol) => {
                    const favorite = productPrefs.favorites.includes(symbol);
                    return (
                      <button
                        key={symbol}
                        type="button"
                        onClick={() => toggleFavorite(symbol)}
                        style={{
                          border: favorite ? "1px solid rgba(69,255,181,0.3)" : "1px solid rgba(142,160,191,0.14)",
                          background: favorite ? "rgba(69,255,181,0.08)" : "rgba(255,255,255,0.02)",
                          color: favorite ? "#45ffb5" : "#d7e1f4",
                          borderRadius: 999,
                          padding: "8px 12px",
                          cursor: "pointer",
                          fontSize: 12,
                          fontWeight: 700,
                          letterSpacing: "0.05em",
                          textTransform: "uppercase",
                        }}
                      >
                        {favorite ? "Saved" : "Save"} {symbol}
                      </button>
                    );
                  })}
                </div>

                <div style={{ display: "grid", gridTemplateColumns: "minmax(220px, 0.8fr) minmax(0, 1.2fr)", gap: 14 }}>
                  <div style={{ display: "grid", gap: 10 }}>
                    <div style={{ padding: "12px 14px", borderRadius: 14, background: "rgba(255,255,255,0.018)", border: "1px solid rgba(132,151,186,0.1)" }}>
                      <div style={{ fontSize: 11, color: "#7f8da8", letterSpacing: "0.1em", textTransform: "uppercase" }}>Asset alerts</div>
                      <div style={{ marginTop: 10, display: "grid", gap: 8 }}>
                        {workflowAssets.map((symbol) => {
                          const enabled = isAlertEnabledForAsset(productPrefs, symbol);
                          return (
                            <label key={symbol} style={{ display: "flex", justifyContent: "space-between", gap: 10, alignItems: "center", fontSize: 13, color: "#d7e1f4" }}>
                              <span>{symbol}</span>
                              <button
                                type="button"
                                onClick={() => toggleAssetAlert(symbol)}
                                style={{
                                  border: enabled ? "1px solid rgba(69,255,181,0.3)" : "1px solid rgba(255,111,145,0.22)",
                                  background: enabled ? "rgba(69,255,181,0.08)" : "rgba(255,111,145,0.06)",
                                  color: enabled ? "#45ffb5" : "#ff8ea8",
                                  borderRadius: 999,
                                  padding: "5px 10px",
                                  cursor: "pointer",
                                  fontSize: 11,
                                  fontWeight: 700,
                                  letterSpacing: "0.08em",
                                  textTransform: "uppercase",
                                }}
                              >
                                {enabled ? "On" : "Off"}
                              </button>
                            </label>
                          );
                        })}
                      </div>
                    </div>
                    <div style={{ padding: "12px 14px", borderRadius: 14, background: "rgba(255,255,255,0.018)", border: "1px solid rgba(132,151,186,0.1)" }}>
                      <div style={{ fontSize: 11, color: "#7f8da8", letterSpacing: "0.1em", textTransform: "uppercase" }}>Behavior reinforcement</div>
                      <div style={{ marginTop: 10, display: "grid", gap: 8 }}>
                        {behaviorMessages.map((message) => (
                          <div key={message} style={{ fontSize: 13, color: "#d7e1f4", lineHeight: 1.45 }}>
                            {message}
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>

                  <div style={{ padding: "12px 14px", borderRadius: 14, background: "rgba(255,255,255,0.018)", border: "1px solid rgba(132,151,186,0.1)", display: "grid", gap: 10 }}>
                    <div style={{ display: "flex", justifyContent: "space-between", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
                      <div>
                        <div style={{ fontSize: 11, color: "#7f8da8", letterSpacing: "0.1em", textTransform: "uppercase" }}>Trading notes</div>
                        <div style={{ marginTop: 6, fontSize: 15, color: "#f4f7fb", fontWeight: 700 }}>{selectedWorkflowAsset ? `${selectedWorkflowAsset} workflow note` : "No asset selected"}</div>
                      </div>
                      <select
                        value={selectedWorkflowAsset ?? "all"}
                        onChange={(event) => setWorkflowAsset(event.target.value)}
                        style={{ borderRadius: 12, border: "1px solid rgba(132,151,186,0.14)", background: "rgba(5,9,16,0.94)", color: "#f4f7fb", padding: "8px 10px", fontSize: 12 }}
                      >
                        {workflowAssets.map((symbol) => (
                          <option key={symbol} value={symbol}>
                            {symbol}
                          </option>
                        ))}
                      </select>
                    </div>
                    <textarea
                      value={selectedWorkflowNote}
                      onChange={(event) => selectedWorkflowAsset ? updateWorkflowNote(selectedWorkflowAsset, event.target.value) : undefined}
                      placeholder="Keep quick notes: bias, plan, execution mistakes to avoid."
                      style={{ minHeight: 96, resize: "vertical", borderRadius: 14, border: "1px solid rgba(132,151,186,0.12)", background: "rgba(5,9,16,0.96)", color: "#f4f7fb", padding: 12, fontSize: 13, lineHeight: 1.5 }}
                    />
                    {selectedWorkflowOpportunity ? (
                      <div style={{ display: "grid", gridTemplateColumns: "repeat(3, minmax(0, 1fr))", gap: 8 }}>
                        {compactMetricCard("Asset", selectedWorkflowOpportunity.symbol, selectedWorkflowOpportunity.actionLine)}
                        {compactMetricCard("Setup", displaySetupType(selectedWorkflowOpportunity.setupType), selectedWorkflowOpportunity.summary)}
                        {compactMetricCard("Alerts", isAlertEnabledForAsset(productPrefs, selectedWorkflowOpportunity.symbol) ? "Enabled" : "Muted", selectedWorkflowOpportunity.invalidationLine)}
                      </div>
                    ) : null}
                  </div>
                </div>
              </section>
            </section>
          ) : null}

          {!showFirstLoadSkeleton && !actusModeDisplayAsset && viewMode === "deep" ? (
            <section style={{ display: "grid", gridTemplateColumns: "minmax(0, 1.8fr) minmax(320px, 1fr)", gap: 18 }}>
              <div style={{ background: "linear-gradient(145deg, rgba(10,17,31,0.98), rgba(7,12,22,0.96))", border: "1px solid rgba(132,151,186,0.16)", borderRadius: 26, padding: 18, boxShadow: "inset 0 1px 0 rgba(255,255,255,0.03)" }}>
                <div style={{ fontSize: 11, color: "#7f8da8", letterSpacing: "0.12em", textTransform: "uppercase" }}>What Matters Now</div>
                <div style={{ marginTop: 14, display: "grid", gap: 12 }}>
                  {commandPanel.topActionable ? (
                    topOpportunityPanel(commandPanel.topActionable)
                  ) : (
                    commandSection(
                      "NO TRADE",
                      "#8ea0bf",
                      <div style={{ display: "grid", gap: 10 }}>
                        <div style={{ fontSize: 14, color: "#d7e1f4", lineHeight: 1.55, fontWeight: 700 }}>DO NOT TRADE right now.</div>
                        {commandPanel.bestCurrentSetup ? (
                          <div
                            style={{
                              padding: "12px 14px",
                              borderRadius: 14,
                              background: "rgba(255,255,255,0.018)",
                              border: "1px solid rgba(132,151,186,0.1)",
                              display: "grid",
                              gap: 8,
                            }}
                          >
                            <div style={{ display: "flex", justifyContent: "space-between", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
                              <div style={{ fontSize: 11, color: "#7f8da8", letterSpacing: "0.08em", textTransform: "uppercase" }}>Closest to Actionable</div>
                              <div style={{ display: "flex", gap: 6, alignItems: "center", flexWrap: "wrap" }}>
                                {badge(displayDirection(commandPanel.bestCurrentSetup.direction), directionTone(commandPanel.bestCurrentSetup.direction).text, directionTone(commandPanel.bestCurrentSetup.direction).bg, directionTone(commandPanel.bestCurrentSetup.direction).border)}
                                <div style={{ fontSize: 11, color: stateTone(commandPanel.bestCurrentSetup.state).text, letterSpacing: "0.06em", textTransform: "uppercase", fontWeight: 700 }}>
                                  {displayState(commandPanel.bestCurrentSetup.state)}
                                </div>
                              </div>
                            </div>
                            <div style={{ fontSize: 16, fontWeight: 700, color: "#f4f7fb" }}>{commandPanel.bestCurrentSetup.symbol}</div>
                            <div style={{ fontSize: 13, color: "#c6d4ef", fontWeight: 600 }}>{displaySetupType(commandPanel.bestCurrentSetup.setupType)}</div>
                            <div style={{ fontSize: 13, color: "#e6edf9", lineHeight: 1.5 }}>{commandPanel.bestCurrentSetup.actionLine}</div>
                          </div>
                        ) : null}
                      </div>,
                      snapshot.whatMattersNow[0] ?? "Wait for cleaner alignment before pressing risk.",
                    )
                  )}

                  <div style={{ display: "grid", gridTemplateColumns: "repeat(3, minmax(0, 1fr))", gap: 12 }}>
                    {commandSection(
                      "Next Best",
                      "#67b7ff",
                      commandPanel.nextBest.length ? (
                        <div style={{ display: "grid", gap: 6 }}>
                          {commandPanel.nextBest.map((item, index) => commandRow(item, index))}
                        </div>
                      ) : (
                        <div style={{ fontSize: 13, color: "#9aabc8", lineHeight: 1.5 }}>No secondary setups are close enough to matter.</div>
                      ),
                      "Best follow-on opportunities after the lead setup.",
                    )}
                    {commandSection(
                      "Watch List",
                      "#f5c86a",
                      commandPanel.watchList.length ? (
                        <div style={{ display: "grid", gap: 6 }}>
                          {commandPanel.watchList.map((item, index) => commandRow(item, index))}
                        </div>
                      ) : (
                        <div style={{ fontSize: 13, color: "#9aabc8", lineHeight: 1.5 }}>Nothing is building cleanly right now.</div>
                      ),
                      "Building setups that still need confirmation.",
                    )}
                    {commandSection(
                      "No Trade",
                      "#ff7b7b",
                      commandPanel.noEdge.length ? (
                        <div style={{ display: "grid", gap: 6 }}>
                          {commandPanel.noEdge.map((item, index) => commandRow(item, index))}
                        </div>
                      ) : (
                        <div style={{ fontSize: 13, color: "#9aabc8", lineHeight: 1.5 }}>No obvious non-trades are crowding the tape.</div>
                      ),
                      "Late, weak, or conflicted conditions to leave alone.",
                    )}
                  </div>
                </div>
              </div>

              <div style={{ display: "grid", gap: 18 }}>
                <section style={{ background: "radial-gradient(circle at top right, rgba(90,140,255,0.06), transparent 28%), linear-gradient(145deg, rgba(10,17,31,0.98), rgba(7,12,22,0.96))", border: "1px solid rgba(132,151,186,0.16)", borderRadius: 26, padding: 18, boxShadow: "inset 0 1px 0 rgba(255,255,255,0.03)" }}>
                  <div style={{ fontSize: 11, color: "#7f8da8", letterSpacing: "0.12em", textTransform: "uppercase" }}>Macro Overlay</div>
                  <div style={{ marginTop: 12, fontSize: 24, fontWeight: 650 }}>{snapshot.macro.command}</div>
                  <div style={{ marginTop: 8, fontSize: 14, color: "#9aabc8", lineHeight: 1.55 }}>{snapshot.macro.summary}</div>
                  <div style={{ marginTop: 14, display: "grid", gap: 10 }}>
                    {metricCard("Risk Tone", snapshot.macro.riskTone.toUpperCase())}
                    {metricCard("Volatility", snapshot.macro.volatility.toUpperCase())}
                    {metricCard("Breadth", snapshot.macro.breadth.toUpperCase())}
                    {metricCard("Headline Risk", snapshot.macro.headlineRisk.toUpperCase())}
                  </div>
                </section>

                <section style={{ background: "linear-gradient(145deg, rgba(10,17,31,0.98), rgba(7,12,22,0.96))", border: "1px solid rgba(132,151,186,0.16)", borderRadius: 26, padding: 18, boxShadow: "inset 0 1px 0 rgba(255,255,255,0.03)" }}>
                  <div style={{ fontSize: 11, color: "#7f8da8", letterSpacing: "0.12em", textTransform: "uppercase" }}>System Status</div>
                  <div style={{ marginTop: 12, fontSize: 14, color: "#d7e1f4", lineHeight: 1.6 }}>{snapshot.status.message}</div>
                </section>
              </div>
            </section>
          ) : null}

          {!showFirstLoadSkeleton && !actusModeDisplayAsset && viewMode === "deep"
            ? deepNyOpenFlowSection(filteredOpportunities, nyOpenFlowByAsset, nyOpenFlowHistoryByAsset)
            : null}

          {!showFirstLoadSkeleton && !actusModeDisplayAsset && viewMode === "focus" ? (
          <section style={{ background: "linear-gradient(145deg, rgba(4,6,10,0.995), rgba(1,2,5,0.995))", border: "1px solid rgba(98,116,148,0.16)", borderRadius: 26, padding: 18, boxShadow: "inset 0 1px 0 rgba(255,255,255,0.03), 0 24px 60px rgba(0,0,0,0.34)" }}>
            <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "center", flexWrap: "wrap" }}>
              <div>
                <div style={{ fontSize: 11, color: "#7f8da8", letterSpacing: "0.12em", textTransform: "uppercase" }}>{ACTUS_PRODUCT_LANGUAGE.boardLabel}</div>
                <div style={{ marginTop: 6, fontSize: 14, color: "#9aabc8" }}>
                  The engine is arranged in action order now: wait first, execute second, avoid third, with each lane ranked by confidence for the chosen timeframe.
                </div>
              </div>
              {badge(`${filteredOpportunities.length} assets`, "#d7e1f4", "rgba(255,255,255,0.03)", "rgba(142,160,191,0.14)")}
            </div>

            <div style={{ marginTop: 16, display: "grid", gridTemplateColumns: "repeat(3, minmax(0, 1fr))", gap: 12 }}>
              <div>{laneSummaryCard("Wait", `${focusGrouped.wait.length}`, "Needs more confirmation", "wait")}</div>
              <div>{laneSummaryCard("Execute", `${focusGrouped.execute.length}`, "Highest conviction only", "execute")}</div>
              <div>{laneSummaryCard("Avoid", `${focusGrouped.avoid.length}`, "Weak or conflicted structure", "avoid")}</div>
            </div>

            <div style={{ marginTop: 18, display: "grid", gridTemplateColumns: "repeat(3, minmax(0, 1fr))", gap: 16, alignItems: "start" }}>
              {laneCard("Wait", "wait", focusGrouped.wait, "All waiting assets are listed from highest confidence down.", nowTick, openActusMode)}
              {laneCard("Execute", "execute", focusGrouped.execute, "Only the cleanest opportunities belong in the middle strike lane.", nowTick, openActusMode)}
              {laneCard("Avoid", "avoid", focusGrouped.avoid, "This lane collects late, conflicted, stretched, or weak conditions.", nowTick, openActusMode)}
            </div>
          </section>
          ) : null}

          {!showFirstLoadSkeleton && !actusModeDisplayAsset && viewMode === "deep" ? (
            <section style={{ display: "grid", gridTemplateColumns: viewMode === "deep" ? "minmax(0, 1fr) minmax(320px, 0.8fr)" : "minmax(0, 1fr)", gap: 18 }}>
              {viewMode === "deep" ? (
              <section style={{ background: "linear-gradient(145deg, rgba(10,17,31,0.98), rgba(7,12,22,0.96))", border: "1px solid rgba(132,151,186,0.16)", borderRadius: 26, padding: 18, boxShadow: "inset 0 1px 0 rgba(255,255,255,0.03)" }}>
                <div style={{ fontSize: 11, color: "#7f8da8", letterSpacing: "0.12em", textTransform: "uppercase" }}>{ACTUS_PRODUCT_LANGUAGE.rankingLabel}</div>
                <div style={{ marginTop: 14, display: "grid", gap: 10 }}>
                  {filteredRanked.map((item) => (
                    <div key={item.symbol} style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "center", padding: "12px 14px", borderRadius: 16, background: "rgba(255,255,255,0.02)", border: "1px solid rgba(142,160,191,0.1)" }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                        <div style={{ width: 30, height: 30, borderRadius: 999, display: "grid", placeItems: "center", background: "rgba(255,255,255,0.04)", color: "#d7e1f4", fontSize: 12 }}>{item.rank}</div>
                        <div>
                          <div style={{ fontSize: 13, fontWeight: 600 }}>{item.symbol}</div>
                          <div style={{ marginTop: 3, fontSize: 12, color: "#8ea0bf" }}>{item.displayName}</div>
                        </div>
                      </div>
                      <div style={{ display: "grid", justifyItems: "end", gap: 6 }}>
                        {badge(item.action.toUpperCase(), tone(item.action).text, tone(item.action).bg, tone(item.action).border)}
                        <div style={{ fontSize: 13, color: "#d7e1f4" }}>{item.opportunityScore}</div>
                      </div>
                    </div>
                  ))}
                </div>
              </section>
              ) : null}

                <section style={{ background: "linear-gradient(145deg, rgba(10,17,31,0.98), rgba(7,12,22,0.96))", border: "1px solid rgba(132,151,186,0.16)", borderRadius: 26, padding: 18, boxShadow: "inset 0 1px 0 rgba(255,255,255,0.03)" }}>
                  <div style={{ fontSize: 11, color: "#7f8da8", letterSpacing: "0.12em", textTransform: "uppercase" }}>Alert Center</div>
                  <div style={{ marginTop: 14, display: "grid", gap: 10 }}>
                  {inAppAlert ? (
                    <div style={{ padding: 14, borderRadius: 16, background: "rgba(255,255,255,0.02)", border: `1px solid ${tone(inAppAlert.tone === "active" ? "execute" : inAppAlert.tone === "ready" ? "wait" : "avoid").border}` }}>
                      <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "center" }}>
                        <div style={{ fontSize: 11, color: "#7f8da8", letterSpacing: "0.08em", textTransform: "uppercase" }}>In-App Alert</div>
                        <div style={{ fontSize: 11, color: "#8ea0bf" }}>now</div>
                      </div>
                      <div style={{ marginTop: 8, fontSize: 14, fontWeight: 700, color: "#f4f7fb" }}>{inAppAlert.title}</div>
                      <div style={{ marginTop: 6, fontSize: 13, color: "#d7e1f4", lineHeight: 1.5 }}>{inAppAlert.body}</div>
                    </div>
                  ) : null}
                  {internalAlertEvents.length ? (
                    <div
                      style={{
                        padding: 14,
                        borderRadius: 16,
                        background: "rgba(255,255,255,0.018)",
                        border: "1px solid rgba(142,160,191,0.1)",
                        display: "grid",
                        gap: 10,
                      }}
                    >
                      <div style={{ display: "flex", justifyContent: "space-between", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
                        <div style={{ fontSize: 11, color: "#7f8da8", letterSpacing: "0.08em", textTransform: "uppercase" }}>ACTUS Transitions</div>
                        {badge(`${Math.min(internalAlertEvents.length, 4)} recent`, "#d7e1f4", "rgba(255,255,255,0.03)", "rgba(142,160,191,0.14)")}
                      </div>
                      <div style={{ display: "grid", gap: 8 }}>
                        {internalAlertEvents.slice(0, 4).map((event) => {
                          const colors = internalAlertEventTone(event.eventType);
                          return (
                            <div
                              key={event.id}
                              style={{
                                padding: "10px 12px",
                                borderRadius: 14,
                                background: "rgba(255,255,255,0.018)",
                                border: `1px solid ${colors.border}`,
                                display: "grid",
                                gap: 5,
                              }}
                            >
                              <div style={{ display: "flex", justifyContent: "space-between", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
                                <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                                  <div style={{ fontSize: 12, color: "#f4f7fb", fontWeight: 700 }}>{event.asset}</div>
                                  {badge(internalAlertEventLabel(event.eventType), colors.text, colors.bg, colors.border)}
                                </div>
                                <div style={{ fontSize: 11, color: "#8ea0bf" }}>{internalAlertRecencyLabel(event.timestamp, Date.now())}</div>
                              </div>
                              <div style={{ fontSize: 12, color: "#d7e1f4", lineHeight: 1.45 }}>
                                {internalAlertSummary(event)}
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  ) : null}
                  {snapshot.alerts.length ? (
                    snapshot.alerts.map((alert) => (
                      <div key={alert.id} style={{ padding: 14, borderRadius: 16, background: "rgba(255,255,255,0.02)", border: `1px solid ${tone(alert.severity === "high" ? "execute" : alert.severity === "medium" ? "wait" : "avoid").border}` }}>
                        <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "center" }}>
                          <div style={{ fontSize: 11, color: "#7f8da8", letterSpacing: "0.08em", textTransform: "uppercase" }}>{alert.title}</div>
                          <div style={{ fontSize: 11, color: "#8ea0bf" }}>{alert.ageLabel}</div>
                        </div>
                        <div style={{ marginTop: 8, fontSize: 14, fontWeight: 600 }}>{alert.asset}</div>
                        <div style={{ marginTop: 6, fontSize: 13, color: "#d7e1f4", lineHeight: 1.5 }}>{alert.body}</div>
                      </div>
                    ))
                  ) : !inAppAlert && !internalAlertEvents.length ? (
                    <div style={{ fontSize: 14, color: "#9aabc8", lineHeight: 1.55 }}>No active alerts right now. The system is waiting for a clearer condition shift.</div>
                  ) : null}
                </div>
              </section>
            </section>
          ) : null}

          {!showFirstLoadSkeleton && !actusModeDisplayAsset && viewMode === "deep" ? (
            <section style={{ display: "grid", gridTemplateColumns: "minmax(320px, 0.9fr) minmax(0, 1.1fr)", gap: 18 }}>
              <section style={{ background: "linear-gradient(145deg, rgba(10,17,31,0.98), rgba(7,12,22,0.96))", border: "1px solid rgba(132,151,186,0.16)", borderRadius: 26, padding: 18, boxShadow: "inset 0 1px 0 rgba(255,255,255,0.03)" }}>
                <div style={{ fontSize: 11, color: "#7f8da8", letterSpacing: "0.12em", textTransform: "uppercase" }}>Setup Review</div>
                <div style={{ marginTop: 14, display: "grid", gap: 10 }}>
                  {setupHistory.length ? (
                    setupHistory.map((entry) => {
                      const colors = replayOutcomeTone(entry.outcome);
                      return (
                        <button
                          key={entry.id}
                          type="button"
                          onClick={() =>
                            setActusModeSelection({
                              symbol: entry.symbol,
                              timeframe: entry.timeframe,
                              snapshot: entry.snapshot,
                              solView: isSolActusSymbol(entry.symbol) ? "binance-execution" : undefined,
                            })
                          }
                          style={{ display: "grid", gridTemplateColumns: "minmax(0, 1fr) auto", gap: 12, alignItems: "center", padding: "12px 14px", borderRadius: 16, background: "rgba(255,255,255,0.02)", border: `1px solid ${colors.border}`, textAlign: "left", cursor: "pointer" }}
                        >
                          <div style={{ minWidth: 0 }}>
                            <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                              <div style={{ fontSize: 13, fontWeight: 700, color: "#f4f7fb" }}>{entry.symbol}</div>
                              {badge(entry.direction.toUpperCase(), directionTone(entry.direction).text, directionTone(entry.direction).bg, directionTone(entry.direction).border)}
                              {badge(replayOutcomeLabel(entry.outcome), colors.text, colors.bg, colors.border)}
                            </div>
                            <div style={{ marginTop: 6, fontSize: 12, color: "#d7e1f4", lineHeight: 1.5 }}>{entry.command}</div>
                            <div style={{ marginTop: 4, fontSize: 12, color: "#8ea0bf" }}>
                              Entry {entry.entry.toLocaleString()} • Invalid {entry.invalidation.toLocaleString()}
                            </div>
                          </div>
                          <div style={{ textAlign: "right", display: "grid", gap: 6 }}>
                            <div style={{ fontSize: 11, color: "#9aabc8" }}>{Math.max(0, Math.floor((Date.now() - entry.endedAt) / 60000))}m ago</div>
                            <div style={{ fontSize: 11, color: "#d7e1f4", letterSpacing: "0.08em", textTransform: "uppercase", fontWeight: 700 }}>Replay</div>
                          </div>
                        </button>
                      );
                    })
                  ) : (
                    <div style={{ fontSize: 14, color: "#9aabc8", lineHeight: 1.55 }}>Recent setups will populate here once ACTUS sees ready, active, invalidated, or expired trades.</div>
                  )}
                </div>
              </section>

              <section style={{ background: "linear-gradient(145deg, rgba(10,17,31,0.98), rgba(7,12,22,0.96))", border: "1px solid rgba(132,151,186,0.16)", borderRadius: 26, padding: 18, boxShadow: "inset 0 1px 0 rgba(255,255,255,0.03)" }}>
                <div style={{ fontSize: 11, color: "#7f8da8", letterSpacing: "0.12em", textTransform: "uppercase" }}>Trust Layer</div>
                <div style={{ marginTop: 12, fontSize: 14, color: "#d7e1f4", lineHeight: 1.6 }}>
                  ACTUS keeps the last setup outcomes visible so users can review what it called, what invalidated, and what expired without relying on fake performance stats.
                </div>
                <div style={{ marginTop: 14, display: "grid", gridTemplateColumns: "repeat(3, minmax(0, 1fr))", gap: 8 }}>
                  {metricCard("Completed", `${todayCompleted}`)}
                  {metricCard("Invalidated", `${todayInvalidated}`)}
                  {metricCard("Not Triggered", `${todayExpired}`)}
                </div>
                <div style={{ marginTop: 12, display: "grid", gap: 8 }}>
                  {commandHistory.length ? (
                    commandHistory.slice(0, 3).map((entry) => (
                      <div key={entry.id} style={{ padding: "10px 12px", borderRadius: 14, background: "rgba(255,255,255,0.018)", border: "1px solid rgba(142,160,191,0.1)" }}>
                        <div style={{ fontSize: 12, color: "#f4f7fb", fontWeight: 700 }}>{entry.symbol}</div>
                        <div style={{ marginTop: 4, fontSize: 12, color: "#8ea0bf" }}>
                          {entry.action} • {entry.timeframe} • score {entry.score}
                        </div>
                      </div>
                    ))
                  ) : (
                    <div style={{ fontSize: 13, color: "#9aabc8", lineHeight: 1.5 }}>{snapshot.status.message}</div>
                  )}
                </div>
              </section>
            </section>
          ) : null}
        </div>
      </div>
      {inAppAlert ? (
        <AlertToast
          title={inAppAlert.title}
          body={inAppAlert.body}
          tone={inAppAlert.tone}
          onClose={() => setInAppAlert((current) => (current?.id === inAppAlert.id ? null : current))}
        />
      ) : null}
    </div>
  );
}
