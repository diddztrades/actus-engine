$ErrorActionPreference = "Stop"

function Write-Utf8File {
    param(
        [string]$Path,
        [string]$Content
    )

    $dir = Split-Path $Path -Parent
    if ($dir -and -not (Test-Path $dir)) {
        New-Item -ItemType Directory -Path $dir -Force | Out-Null
    }

    $utf8NoBom = New-Object System.Text.UTF8Encoding($false)
    [System.IO.File]::WriteAllText((Join-Path (Get-Location) $Path), $Content.TrimStart(), $utf8NoBom)
    Write-Host "Wrote $Path"
}

Write-Utf8File "package.json" @'
{
  "name": "actus-os",
  "private": true,
  "version": "0.0.0",
  "type": "module",
  "scripts": {
    "dev": "vite",
    "build": "tsc -b && vite build",
    "preview": "vite preview"
  },
  "dependencies": {
    "@supabase/supabase-js": "^2.49.8",
    "lucide-react": "^0.511.0",
    "react": "^19.1.0",
    "react-dom": "^19.1.0"
  },
  "devDependencies": {
    "@eslint/js": "^9.25.0",
    "@types/react": "^19.1.2",
    "@types/react-dom": "^19.1.2",
    "@vitejs/plugin-react": "^4.4.1",
    "eslint": "^9.25.0",
    "eslint-plugin-react-hooks": "^5.2.0",
    "eslint-plugin-react-refresh": "^0.4.19",
    "globals": "^16.0.0",
    "typescript": "~5.8.3",
    "typescript-eslint": "^8.30.1",
    "vite": "^6.3.5"
  }
}
'@

Write-Utf8File "tsconfig.json" @'
{
  "files": [],
  "references": [
    { "path": "./tsconfig.app.json" },
    { "path": "./tsconfig.node.json" }
  ]
}
'@

Write-Utf8File "tsconfig.app.json" @'
{
  "compilerOptions": {
    "tsBuildInfoFile": "./node_modules/.tmp/tsconfig.app.tsbuildinfo",
    "target": "ES2020",
    "useDefineForClassFields": true,
    "lib": ["ES2020", "DOM", "DOM.Iterable"],
    "module": "ESNext",
    "skipLibCheck": true,
    "moduleResolution": "Bundler",
    "allowImportingTsExtensions": false,
    "resolveJsonModule": true,
    "isolatedModules": true,
    "moduleDetection": "force",
    "noEmit": true,
    "jsx": "react-jsx",
    "strict": true,
    "noUnusedLocals": true,
    "noUnusedParameters": true,
    "noFallthroughCasesInSwitch": true
  },
  "include": ["src"]
}
'@

Write-Utf8File "tsconfig.node.json" @'
{
  "compilerOptions": {
    "tsBuildInfoFile": "./node_modules/.tmp/tsconfig.node.tsbuildinfo",
    "target": "ES2022",
    "lib": ["ES2023"],
    "module": "ESNext",
    "skipLibCheck": true,
    "moduleResolution": "Bundler",
    "allowSyntheticDefaultImports": true,
    "noEmit": true,
    "strict": true
  },
  "include": ["vite.config.ts"]
}
'@

Write-Utf8File "vite.config.ts" @'
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()]
});
'@

Write-Utf8File ".env.example" @'
VITE_SUPABASE_URL=
VITE_SUPABASE_ANON_KEY=
'@

Write-Utf8File "src/main.tsx" @'
import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import "./styles/index.css";

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
'@

Write-Utf8File "src/App.tsx" @'
import { useEffect, useMemo, useState } from "react";
import {
  Activity,
  Database,
  Focus,
  LayoutGrid,
  Moon,
  Radar,
  Shield,
  Sun,
  Wifi,
  Zap
} from "lucide-react";
import { AssetCard } from "./components/AssetCard";
import { AlertsPanel } from "./components/AlertsPanel";
import { DecisionBoard } from "./components/DecisionBoard";
import { MacroPanel } from "./components/MacroPanel";
import { RankingPanel } from "./components/RankingPanel";
import { Shell } from "./components/Shell";
import type { AssetState, ThemeMode } from "./types/engine";
import type { EngineAlert } from "./types/alerts";
import type { MacroSnapshot } from "./types/macro";
import type { RankingItem } from "./types/ranking";
import {
  buildInitialAssets,
  getUpdateInterval,
  hydrateInitialLiveState,
  runEngineCycle
} from "./lib/actusEngine";
import { buildAlerts } from "./lib/alertEngine";
import { normalizeMacroSnapshot } from "./lib/macroEngine";
import { buildDecisionBoard } from "./lib/decisionBoard";
import { rankAssets } from "./lib/rankingEngine";
import { getMacroSnapshot } from "./services/macroService";
import { getSystemStatus } from "./services/systemStatusService";

export default function App() {
  const [theme, setTheme] = useState<ThemeMode>("dark");
  const [assets, setAssets] = useState<AssetState[]>(() => hydrateInitialLiveState(buildInitialAssets()));
  const [macro, setMacro] = useState<MacroSnapshot>(() => normalizeMacroSnapshot(undefined));
  const [alerts, setAlerts] = useState<EngineAlert[]>([]);
  const [ranking, setRanking] = useState<RankingItem[]>([]);
  const [lastUpdated, setLastUpdated] = useState<string>(new Date().toLocaleTimeString());
  const [engineMode] = useState<"live" | "sim">("live");
  const [connection, setConnection] = useState<"online" | "offline">("online");
  const [dataSource, setDataSource] = useState<"supabase" | "local">("local");

  useEffect(() => {
    const root = document.documentElement;
    root.dataset.theme = theme;
  }, [theme]);

  useEffect(() => {
    let mounted = true;

    async function boot() {
      try {
        const status = await getSystemStatus();
        if (!mounted) return;
        setConnection(status.connection);
        setDataSource(status.dataSource);
      } catch {
        if (!mounted) return;
        setConnection("offline");
        setDataSource("local");
      }
    }

    boot();
    return () => {
      mounted = false;
    };
  }, []);

  useEffect(() => {
    let cancelled = false;

    async function refreshMacro() {
      const snapshot = await getMacroSnapshot();
      if (cancelled) return;
      setMacro(normalizeMacroSnapshot(snapshot));
    }

    refreshMacro();
    const macroTimer = window.setInterval(refreshMacro, 60000);

    return () => {
      cancelled = true;
      window.clearInterval(macroTimer);
    };
  }, []);

  useEffect(() => {
    const interval = window.setInterval(() => {
      setAssets((current) => {
        const next = runEngineCycle(current, macro);
        setAlerts(buildAlerts(next, macro));
        setRanking(rankAssets(next, macro));
        setLastUpdated(new Date().toLocaleTimeString());
        return next;
      });
    }, getUpdateInterval(engineMode));

    return () => window.clearInterval(interval);
  }, [engineMode, macro]);

  useEffect(() => {
    setAlerts(buildAlerts(assets, macro));
    setRanking(rankAssets(assets, macro));
  }, [assets, macro]);

  const decisionBoard = useMemo(() => buildDecisionBoard(assets), [assets]);

  return (
    <Shell>
      <header className="topbar">
        <div className="brand-wrap">
          <div className="brand-badge">A</div>
          <div>
            <p className="eyebrow">ACTUS OS</p>
            <h1>Market intelligence command layer</h1>
          </div>
        </div>

        <div className="topbar-actions">
          <button
            className="theme-toggle"
            onClick={() => setTheme((current) => (current === "dark" ? "light" : "dark"))}
            type="button"
          >
            {theme === "dark" ? <Sun size={16} /> : <Moon size={16} />}
            {theme === "dark" ? "Light" : "Dark"}
          </button>
        </div>
      </header>

      <section className="status-strip">
        <div className="status-pill">
          <Activity size={15} />
          Engine: {engineMode.toUpperCase()}
        </div>
        <div className="status-pill">
          <Radar size={15} />
          Assets: {assets.length}
        </div>
        <div className="status-pill">
          <Database size={15} />
          Data: {dataSource}
        </div>
        <div className="status-pill">
          <Wifi size={15} />
          Connection: {connection}
        </div>
        <div className="status-pill">
          <LayoutGrid size={15} />
          Alerts: {alerts.length}
        </div>
        <div className="status-pill">
          <Focus size={15} />
          Updated: {lastUpdated}
        </div>
      </section>

      <section className="hero-grid">
        <div className="hero-card">
          <div className="hero-card-header">
            <span className="hero-icon"><Zap size={16} /></span>
            <h2>Priority board</h2>
          </div>
          <p className="hero-main">{macro.primaryRead}</p>
          <p className="hero-sub">{macro.summary}</p>
        </div>

        <div className="hero-card">
          <div className="hero-card-header">
            <span className="hero-icon"><Shield size={16} /></span>
            <h2>Discipline</h2>
          </div>
          <p className="hero-main">{macro.disciplineTitle}</p>
          <p className="hero-sub">{macro.disciplineText}</p>
        </div>

        <div className="hero-card">
          <div className="hero-card-header">
            <span className="hero-icon"><Activity size={16} /></span>
            <h2>Session</h2>
          </div>
          <p className="hero-main">{macro.session}</p>
          <p className="hero-sub">{macro.sessionSummary}</p>
        </div>
      </section>

      <section className="main-grid">
        <div className="left-rail">
          <DecisionBoard board={decisionBoard} />
          <div className="asset-grid">
            {assets.map((asset) => (
              <AssetCard key={asset.symbol} asset={asset} />
            ))}
          </div>
        </div>

        <aside className="right-rail">
          <MacroPanel macro={macro} />
          <RankingPanel ranking={ranking} />
          <AlertsPanel alerts={alerts} />
        </aside>
      </section>
    </Shell>
  );
}
'@

Write-Utf8File "src/types/engine.ts" @'
export type ThemeMode = "dark" | "light";
export type ViewMode = "dashboard" | "replay";
export type SignalState = "execute" | "wait" | "avoid";
export type MarketBias = "bullish" | "bearish" | "neutral";
export type TimeFrame = "1m" | "5m" | "15m" | "1h";

export type AssetState = {
  symbol: string;
  name: string;
  price: number;
  changePct: number;
  bias: MarketBias;
  state: SignalState;
  confidence: number;
  riskScore: number;
  momentumScore: number;
  session: string;
  timeframe: TimeFrame;
  reason: string;
  note: string;
  updatedAt: number;
  stateEnteredAt: number;
};
'@

Write-Utf8File "src/types/macro.ts" @'
export type MacroSnapshot = {
  session: string;
  primaryRead: string;
  summary: string;
  sessionSummary: string;
  disciplineTitle: string;
  disciplineText: string;
  volatilityRegime: "low" | "normal" | "high";
  usdBias: "bullish" | "bearish" | "neutral";
  energyPressure: "low" | "normal" | "high";
  equityTone: "risk-on" | "risk-off" | "mixed";
  cryptoTone: "risk-on" | "risk-off" | "mixed";
};
'@

Write-Utf8File "src/types/alerts.ts" @'
export type EngineAlertLevel = "high" | "medium" | "low";

export type EngineAlert = {
  id: string;
  title: string;
  detail: string;
  level: EngineAlertLevel;
  symbol?: string;
  createdAt: number;
};
'@

Write-Utf8File "src/types/ranking.ts" @'
export type RankingItem = {
  symbol: string;
  name: string;
  score: number;
  state: "execute" | "wait" | "avoid";
  note: string;
};
'@

Write-Utf8File "src/types/decision.ts" @'
export type DecisionCard = {
  symbol: string;
  name: string;
  note: string;
  durationLabel: string;
};

export type DecisionColumn = {
  title: "EXECUTE" | "WAIT" | "AVOID";
  items: DecisionCard[];
};

export type DecisionBoardState = {
  execute: DecisionColumn;
  wait: DecisionColumn;
  avoid: DecisionColumn;
};
'@

Write-Utf8File "src/components/Shell.tsx" @'
import type { PropsWithChildren } from "react";

export function Shell({ children }: PropsWithChildren) {
  return <div className="app-shell">{children}</div>;
}
'@

Write-Utf8File "src/components/AssetCard.tsx" @'
import type { AssetState } from "../types/engine";
import { ArrowDownRight, ArrowUpRight, Minus } from "lucide-react";

type AssetCardProps = {
  asset: AssetState;
};

function changeTone(changePct: number) {
  if (changePct > 0) return "positive";
  if (changePct < 0) return "negative";
  return "neutral";
}

function biasTone(bias: AssetState["bias"]) {
  if (bias === "bullish") return "positive";
  if (bias === "bearish") return "negative";
  return "neutral";
}

function stateTone(state: AssetState["state"]) {
  return state;
}

function formatAge(timestamp: number) {
  const diffMs = Date.now() - timestamp;
  const totalSeconds = Math.max(0, Math.floor(diffMs / 1000));
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;

  if (hours > 0) return hours + "h " + minutes + "m";
  if (minutes > 0) return minutes + "m " + seconds + "s";
  return seconds + "s";
}

export function AssetCard({ asset }: AssetCardProps) {
  const tone = changeTone(asset.changePct);

  return (
    <article className="panel asset-card">
      <div className="asset-header">
        <div>
          <p className="asset-symbol">{asset.symbol}</p>
          <h3>{asset.name}</h3>
        </div>
        <span className={`badge state-${stateTone(asset.state)}`}>{asset.state.toUpperCase()}</span>
      </div>

      <div className="asset-price-row">
        <div className="asset-price">{asset.price.toFixed(2)}</div>
        <div className={`asset-change ${tone}`}>
          {asset.changePct > 0 ? <ArrowUpRight size={15} /> : asset.changePct < 0 ? <ArrowDownRight size={15} /> : <Minus size={15} />}
          {asset.changePct.toFixed(2)}%
        </div>
      </div>

      <div className="asset-meta-grid">
        <div className="metric">
          <span>Bias</span>
          <strong className={biasTone(asset.bias)}>{asset.bias}</strong>
        </div>
        <div className="metric">
          <span>Confidence</span>
          <strong>{asset.confidence}</strong>
        </div>
        <div className="metric">
          <span>Momentum</span>
          <strong>{asset.momentumScore}</strong>
        </div>
        <div className="metric">
          <span>Risk</span>
          <strong>{asset.riskScore}</strong>
        </div>
      </div>

      <div className="asset-copy">
        <p className="asset-reason">{asset.reason}</p>
        <p className="asset-note">{asset.note}</p>
      </div>

      <div className="asset-footer">
        <span>{asset.timeframe} · {asset.session}</span>
        <span>In state: {formatAge(asset.stateEnteredAt)}</span>
      </div>
    </article>
  );
}
'@

Write-Utf8File "src/components/AlertsPanel.tsx" @'
import type { EngineAlert } from "../types/alerts";

type AlertsPanelProps = {
  alerts: EngineAlert[];
};

export function AlertsPanel({ alerts }: AlertsPanelProps) {
  return (
    <section className="panel">
      <div className="panel-header">
        <h2>Alerts</h2>
        <span className="panel-count">{alerts.length}</span>
      </div>

      <div className="stack">
        {alerts.length === 0 ? (
          <p className="empty-copy">No active alerts.</p>
        ) : (
          alerts.map((alert) => (
            <article className={`alert-card level-${alert.level}`} key={alert.id}>
              <div className="alert-card-header">
                <strong>{alert.title}</strong>
                {alert.symbol ? <span>{alert.symbol}</span> : null}
              </div>
              <p>{alert.detail}</p>
            </article>
          ))
        )}
      </div>
    </section>
  );
}
'@

Write-Utf8File "src/components/MacroPanel.tsx" @'
import type { MacroSnapshot } from "../types/macro";

type MacroPanelProps = {
  macro: MacroSnapshot;
};

export function MacroPanel({ macro }: MacroPanelProps) {
  return (
    <section className="panel">
      <div className="panel-header">
        <h2>Macro regime</h2>
      </div>

      <div className="stack">
        <div className="macro-line">
          <span>Volatility</span>
          <strong>{macro.volatilityRegime}</strong>
        </div>
        <div className="macro-line">
          <span>USD bias</span>
          <strong>{macro.usdBias}</strong>
        </div>
        <div className="macro-line">
          <span>Energy pressure</span>
          <strong>{macro.energyPressure}</strong>
        </div>
        <div className="macro-line">
          <span>Equities</span>
          <strong>{macro.equityTone}</strong>
        </div>
        <div className="macro-line">
          <span>Crypto</span>
          <strong>{macro.cryptoTone}</strong>
        </div>
      </div>
    </section>
  );
}
'@

Write-Utf8File "src/components/RankingPanel.tsx" @'
import type { RankingItem } from "../types/ranking";

type RankingPanelProps = {
  ranking: RankingItem[];
};

export function RankingPanel({ ranking }: RankingPanelProps) {
  return (
    <section className="panel">
      <div className="panel-header">
        <h2>Ranked opportunities</h2>
      </div>

      <div className="stack">
        {ranking.map((item, index) => (
          <div className="ranking-row" key={item.symbol}>
            <div className="ranking-left">
              <span className="ranking-index">{index + 1}</span>
              <div>
                <strong>{item.symbol}</strong>
                <p>{item.note}</p>
              </div>
            </div>
            <div className="ranking-right">
              <span className={`badge state-${item.state}`}>{item.state}</span>
              <strong>{item.score}</strong>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}
'@

Write-Utf8File "src/components/DecisionBoard.tsx" @'
import type { DecisionBoardState, DecisionColumn } from "../types/decision";

type DecisionBoardProps = {
  board: DecisionBoardState;
};

function Column({ column }: { column: DecisionColumn }) {
  return (
    <div className="decision-column">
      <div className="decision-column-header">
        <h3>{column.title}</h3>
        <span>{column.items.length}</span>
      </div>

      <div className="decision-stack">
        {column.items.length === 0 ? (
          <div className="decision-item empty">No assets</div>
        ) : (
          column.items.map((item) => (
            <article className="decision-item" key={item.symbol}>
              <div className="decision-item-top">
                <strong>{item.symbol}</strong>
                <span>{item.durationLabel}</span>
              </div>
              <p>{item.name}</p>
              <small>{item.note}</small>
            </article>
          ))
        )}
      </div>
    </div>
  );
}

export function DecisionBoard({ board }: DecisionBoardProps) {
  return (
    <section className="panel">
      <div className="panel-header">
        <h2>Decision board</h2>
      </div>

      <div className="decision-grid">
        <Column column={board.execute} />
        <Column column={board.wait} />
        <Column column={board.avoid} />
      </div>
    </section>
  );
}
'@

Write-Utf8File "src/lib/actusEngine.ts" @'
import type { AssetState } from "../types/engine";
import type { MacroSnapshot } from "../types/macro";

const BASE_TIME = Date.now();

export function buildInitialAssets(): AssetState[] {
  return [
    {
      symbol: "EURUSD",
      name: "Euro",
      price: 1.0832,
      changePct: 0.21,
      bias: "bullish",
      state: "wait",
      confidence: 71,
      riskScore: 42,
      momentumScore: 64,
      session: "London",
      timeframe: "5m",
      reason: "Holding structure with moderate continuation pressure.",
      note: "Watch for cleaner alignment before escalation.",
      updatedAt: BASE_TIME,
      stateEnteredAt: BASE_TIME - 63 * 60 * 1000
    },
    {
      symbol: "XAUUSD",
      name: "Gold",
      price: 2338.5,
      changePct: 0.46,
      bias: "bullish",
      state: "execute",
      confidence: 82,
      riskScore: 37,
      momentumScore: 79,
      session: "London",
      timeframe: "5m",
      reason: "Momentum remains supported by defensive allocation.",
      note: "Currently strongest clean trend behavior.",
      updatedAt: BASE_TIME,
      stateEnteredAt: BASE_TIME - 10 * 1000
    },
    {
      symbol: "NQ",
      name: "Nasdaq",
      price: 18242.25,
      changePct: -0.38,
      bias: "bearish",
      state: "wait",
      confidence: 67,
      riskScore: 58,
      momentumScore: 55,
      session: "Pre-New York",
      timeframe: "1m",
      reason: "Volatility expanding but direction still vulnerable to reversal.",
      note: "Prefer patience until decisive break develops.",
      updatedAt: BASE_TIME,
      stateEnteredAt: BASE_TIME - 72 * 60 * 1000
    },
    {
      symbol: "BTCUSD",
      name: "Bitcoin",
      price: 70322,
      changePct: 1.24,
      bias: "bullish",
      state: "execute",
      confidence: 78,
      riskScore: 51,
      momentumScore: 81,
      session: "24H",
      timeframe: "15m",
      reason: "Risk appetite improving and expansion remains intact.",
      note: "Strong continuation profile while held above intraday support.",
      updatedAt: BASE_TIME,
      stateEnteredAt: BASE_TIME - 14 * 60 * 1000
    },
    {
      symbol: "ETHUSD",
      name: "Ethereum",
      price: 3542.4,
      changePct: 0.93,
      bias: "bullish",
      state: "wait",
      confidence: 73,
      riskScore: 49,
      momentumScore: 70,
      session: "24H",
      timeframe: "15m",
      reason: "Constructive but still lagging the strongest leaders.",
      note: "Better if follow-through improves.",
      updatedAt: BASE_TIME,
      stateEnteredAt: BASE_TIME - 24 * 60 * 1000
    },
    {
      symbol: "SOLUSD",
      name: "Solana",
      price: 188.15,
      changePct: -1.12,
      bias: "bearish",
      state: "avoid",
      confidence: 61,
      riskScore: 74,
      momentumScore: 43,
      session: "24H",
      timeframe: "15m",
      reason: "Unstable structure and weaker relative behavior.",
      note: "Avoid until pressure stabilizes.",
      updatedAt: BASE_TIME,
      stateEnteredAt: BASE_TIME - 59 * 60 * 1000
    },
    {
      symbol: "CL",
      name: "Crude Oil",
      price: 81.18,
      changePct: 0.71,
      bias: "bullish",
      state: "execute",
      confidence: 80,
      riskScore: 46,
      momentumScore: 77,
      session: "London",
      timeframe: "5m",
      reason: "Energy pressure remains supportive and trend quality is strong.",
      note: "Strong candidate while impulse remains intact.",
      updatedAt: BASE_TIME,
      stateEnteredAt: BASE_TIME - 10 * 1000
    }
  ];
}

export function hydrateInitialLiveState(assets: AssetState[]) {
  return assets.map((asset) => ({
    ...asset,
    updatedAt: Date.now()
  }));
}

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

export function runEngineCycle(current: AssetState[], macro: MacroSnapshot): AssetState[] {
  return current.map((asset) => {
    const drift = (Math.random() - 0.5) * 0.8;
    const nextChangePct = Number((asset.changePct + drift * 0.18).toFixed(2));
    const nextPrice = Number((asset.price * (1 + nextChangePct / 1000)).toFixed(2));
    const momentumShift = Math.round((Math.random() - 0.5) * 6);
    const riskShift = Math.round((Math.random() - 0.5) * 4);

    const momentumScore = clamp(asset.momentumScore + momentumShift, 20, 95);
    const riskScore = clamp(asset.riskScore + riskShift, 20, 95);
    const confidence = clamp(Math.round((momentumScore * 0.6) + ((100 - riskScore) * 0.4)), 25, 95);

    let state = asset.state;
    if (confidence >= 76 && riskScore <= 58) state = "execute";
    else if (riskScore >= 70 || confidence <= 58) state = "avoid";
    else state = "wait";

    if (macro.volatilityRegime === "high" && state === "execute" && riskScore > 52) {
      state = "wait";
    }

    const bias =
      nextChangePct > 0.18 ? "bullish" :
      nextChangePct < -0.18 ? "bearish" :
      "neutral";

    const stateEnteredAt = state === asset.state ? asset.stateEnteredAt : Date.now();

    return {
      ...asset,
      price: nextPrice,
      changePct: nextChangePct,
      momentumScore,
      riskScore,
      confidence,
      bias,
      state,
      updatedAt: Date.now(),
      stateEnteredAt
    };
  });
}

export function getUpdateInterval(mode: "live" | "sim") {
  return mode === "live" ? 4000 : 1200;
}
'@

Write-Utf8File "src/lib/alertEngine.ts" @'
import type { EngineAlert } from "../types/alerts";
import type { AssetState } from "../types/engine";
import type { MacroSnapshot } from "../types/macro";

export function buildAlerts(assets: AssetState[], macro: MacroSnapshot): EngineAlert[] {
  const alerts: EngineAlert[] = [];

  for (const asset of assets) {
    if (asset.state === "execute" && asset.confidence >= 80) {
      alerts.push({
        id: asset.symbol + "-execute",
        title: "Execute-ready behavior",
        detail: asset.reason,
        level: "high",
        symbol: asset.symbol,
        createdAt: Date.now()
      });
    }

    if (asset.state === "avoid" && asset.riskScore >= 72) {
      alerts.push({
        id: asset.symbol + "-avoid",
        title: "Risk too elevated",
        detail: asset.note,
        level: "medium",
        symbol: asset.symbol,
        createdAt: Date.now()
      });
    }
  }

  if (macro.volatilityRegime === "high") {
    alerts.unshift({
      id: "macro-volatility",
      title: "Macro volatility elevated",
      detail: "Tighter selectivity required across all active opportunities.",
      level: "high",
      createdAt: Date.now()
    });
  }

  return alerts.slice(0, 8);
}
'@

Write-Utf8File "src/lib/macroEngine.ts" @'
import type { MacroSnapshot } from "../types/macro";

export function normalizeMacroSnapshot(input?: Partial<MacroSnapshot>): MacroSnapshot {
  return {
    session: input?.session ?? "London",
    primaryRead: input?.primaryRead ?? "Selective risk deployment with stronger focus on clean momentum leaders.",
    summary: input?.summary ?? "Macro backdrop is stable enough for movement, but not broad enough for indiscriminate participation.",
    sessionSummary: input?.sessionSummary ?? "Expect rotation, fake-outs, and cleaner continuation only in the strongest names.",
    disciplineTitle: input?.disciplineTitle ?? "Fewer trades, cleaner execution",
    disciplineText: input?.disciplineText ?? "Protect quality. Let weaker structures fail without participation.",
    volatilityRegime: input?.volatilityRegime ?? "normal",
    usdBias: input?.usdBias ?? "neutral",
    energyPressure: input?.energyPressure ?? "normal",
    equityTone: input?.equityTone ?? "mixed",
    cryptoTone: input?.cryptoTone ?? "risk-on"
  };
}
'@

Write-Utf8File "src/lib/rankingEngine.ts" @'
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
'@

Write-Utf8File "src/lib/decisionBoard.ts" @'
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
'@

Write-Utf8File "src/services/supabaseClient.ts" @'
import { createClient } from "@supabase/supabase-js";

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

export const hasSupabaseEnv = Boolean(supabaseUrl && supabaseAnonKey);

export const supabase = hasSupabaseEnv
  ? createClient(supabaseUrl as string, supabaseAnonKey as string)
  : null;
'@

Write-Utf8File "src/services/macroService.ts" @'
import type { MacroSnapshot } from "../types/macro";
import { supabase } from "./supabaseClient";

export async function getMacroSnapshot(): Promise<Partial<MacroSnapshot> | undefined> {
  if (!supabase) {
    return {
      session: "London",
      primaryRead: "Momentum is tradable, but only in names showing clean continuation behavior.",
      summary: "Broad market participation is uneven. Quality matters more than quantity.",
      sessionSummary: "Be selective and avoid forcing mediocre setups.",
      disciplineTitle: "Trade the cleanest names only",
      disciplineText: "No need to distribute attention equally across weak and strong markets.",
      volatilityRegime: "normal",
      usdBias: "neutral",
      energyPressure: "normal",
      equityTone: "mixed",
      cryptoTone: "risk-on"
    };
  }

  const { data, error } = await supabase
    .from("macro_snapshots")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error || !data) {
    return undefined;
  }

  return {
    session: data.session,
    primaryRead: data.primary_read,
    summary: data.summary,
    sessionSummary: data.session_summary,
    disciplineTitle: data.discipline_title,
    disciplineText: data.discipline_text,
    volatilityRegime: data.volatility_regime,
    usdBias: data.usd_bias,
    energyPressure: data.energy_pressure,
    equityTone: data.equity_tone,
    cryptoTone: data.crypto_tone
  };
}
'@

Write-Utf8File "src/services/systemStatusService.ts" @'
import { hasSupabaseEnv, supabase } from "./supabaseClient";

export async function getSystemStatus(): Promise<{
  connection: "online" | "offline";
  dataSource: "supabase" | "local";
}> {
  if (!hasSupabaseEnv || !supabase) {
    return {
      connection: "offline",
      dataSource: "local"
    };
  }

  const { error } = await supabase.from("macro_snapshots").select("id").limit(1);

  return {
    connection: error ? "offline" : "online",
    dataSource: error ? "local" : "supabase"
  };
}
'@

Write-Utf8File "src/styles/index.css" @'
:root {
  --bg: #07111f;
  --bg-soft: #0b1728;
  --panel: rgba(12, 24, 42, 0.86);
  --panel-border: rgba(255, 255, 255, 0.08);
  --text: #edf3ff;
  --muted: #8ea3c7;
  --positive: #33d69f;
  --negative: #ff5f5f;
  --neutral: #aab7cf;
  --execute: rgba(32, 197, 121, 0.16);
  --wait: rgba(255, 194, 71, 0.16);
  --avoid: rgba(255, 95, 95, 0.14);
  --shadow: 0 20px 50px rgba(0, 0, 0, 0.24);
  color-scheme: dark;
  font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
}

:root[data-theme="light"] {
  --bg: #f3f7fc;
  --bg-soft: #ffffff;
  --panel: rgba(255, 255, 255, 0.92);
  --panel-border: rgba(17, 24, 39, 0.08);
  --text: #0b1728;
  --muted: #5d6f8d;
  --shadow: 0 18px 40px rgba(15, 23, 42, 0.08);
  color-scheme: light;
}

* {
  box-sizing: border-box;
}

html, body, #root {
  margin: 0;
  min-height: 100%;
}

body {
  background:
    radial-gradient(circle at top left, rgba(70, 120, 255, 0.12), transparent 28%),
    radial-gradient(circle at top right, rgba(255, 85, 85, 0.10), transparent 24%),
    linear-gradient(180deg, var(--bg) 0%, var(--bg-soft) 100%);
  color: var(--text);
}

button {
  font: inherit;
}

.app-shell {
  width: min(1600px, calc(100% - 32px));
  margin: 0 auto;
  padding: 24px 0 36px;
}

.topbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 18px;
  margin-bottom: 18px;
}

.brand-wrap {
  display: flex;
  align-items: center;
  gap: 14px;
}

.brand-badge {
  width: 44px;
  height: 44px;
  border-radius: 14px;
  display: grid;
  place-items: center;
  font-weight: 800;
  background: linear-gradient(135deg, #ff5252, #7a0018);
  color: white;
  box-shadow: var(--shadow);
}

.eyebrow {
  margin: 0 0 4px;
  font-size: 12px;
  letter-spacing: 0.16em;
  text-transform: uppercase;
  color: var(--muted);
}

.topbar h1 {
  margin: 0;
  font-size: 24px;
  line-height: 1.1;
}

.topbar-actions {
  display: flex;
  align-items: center;
  gap: 12px;
}

.theme-toggle {
  border: 1px solid var(--panel-border);
  background: var(--panel);
  color: var(--text);
  border-radius: 12px;
  padding: 10px 14px;
  display: inline-flex;
  align-items: center;
  gap: 8px;
  cursor: pointer;
}

.status-strip {
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
  margin-bottom: 18px;
}

.status-pill {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  border: 1px solid var(--panel-border);
  background: var(--panel);
  backdrop-filter: blur(10px);
  padding: 10px 12px;
  border-radius: 999px;
  color: var(--muted);
  box-shadow: var(--shadow);
}

.hero-grid {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 16px;
  margin-bottom: 18px;
}

.hero-card,
.panel {
  background: var(--panel);
  border: 1px solid var(--panel-border);
  border-radius: 20px;
  backdrop-filter: blur(14px);
  box-shadow: var(--shadow);
}

.hero-card {
  padding: 18px;
}

.hero-card-header,
.panel-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  margin-bottom: 12px;
}

.hero-icon {
  width: 30px;
  height: 30px;
  border-radius: 10px;
  display: inline-grid;
  place-items: center;
  background: rgba(255, 255, 255, 0.06);
}

.hero-main {
  margin: 0 0 6px;
  font-size: 18px;
  font-weight: 700;
}

.hero-sub,
.empty-copy,
.asset-note,
.ranking-row p,
.decision-item small,
.macro-line span {
  color: var(--muted);
}

.main-grid {
  display: grid;
  grid-template-columns: minmax(0, 1.75fr) minmax(320px, 0.9fr);
  gap: 18px;
}

.left-rail,
.right-rail,
.stack {
  display: grid;
  gap: 16px;
}

.panel {
  padding: 18px;
}

.asset-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 16px;
}

.asset-card {
  display: grid;
  gap: 16px;
}

.asset-header,
.asset-price-row,
.asset-footer,
.ranking-row,
.ranking-left,
.ranking-right,
.alert-card-header,
.decision-item-top,
.macro-line {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
}

.asset-symbol {
  margin: 0 0 4px;
  color: var(--muted);
  font-size: 12px;
  letter-spacing: 0.12em;
  text-transform: uppercase;
}

.asset-header h3,
.panel-header h2 {
  margin: 0;
}

.asset-price {
  font-size: 28px;
  font-weight: 700;
}

.asset-change {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  font-weight: 700;
}

.positive {
  color: var(--positive);
}

.negative {
  color: var(--negative);
}

.neutral {
  color: var(--neutral);
}

.asset-meta-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 10px;
}

.metric {
  border: 1px solid var(--panel-border);
  border-radius: 14px;
  padding: 12px;
  background: rgba(255, 255, 255, 0.03);
}

.metric span {
  display: block;
  font-size: 12px;
  color: var(--muted);
  margin-bottom: 6px;
}

.metric strong {
  font-size: 15px;
}

.asset-copy {
  display: grid;
  gap: 6px;
}

.asset-reason,
.asset-note {
  margin: 0;
}

.badge {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border-radius: 999px;
  padding: 6px 10px;
  font-size: 12px;
  font-weight: 700;
  border: 1px solid transparent;
  text-transform: uppercase;
}

.state-execute {
  background: var(--execute);
  color: #53e3ab;
  border-color: rgba(32, 197, 121, 0.24);
}

.state-wait {
  background: var(--wait);
  color: #ffd46b;
  border-color: rgba(255, 194, 71, 0.24);
}

.state-avoid {
  background: var(--avoid);
  color: #ff8d8d;
  border-color: rgba(255, 95, 95, 0.24);
}

.panel-count {
  color: var(--muted);
}

.alert-card {
  border-radius: 16px;
  padding: 14px;
  border: 1px solid var(--panel-border);
}

.alert-card.level-high {
  background: rgba(255, 82, 82, 0.10);
}

.alert-card.level-medium {
  background: rgba(255, 194, 71, 0.08);
}

.alert-card.level-low {
  background: rgba(255, 255, 255, 0.03);
}

.alert-card p,
.ranking-row p,
.decision-item p {
  margin: 6px 0 0;
}

.ranking-index {
  width: 28px;
  height: 28px;
  border-radius: 999px;
  display: inline-grid;
  place-items: center;
  background: rgba(255, 255, 255, 0.06);
  color: var(--muted);
  font-size: 12px;
  font-weight: 700;
}

.decision-grid {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 14px;
}

.decision-column {
  border: 1px solid var(--panel-border);
  border-radius: 18px;
  padding: 14px;
  background: rgba(255, 255, 255, 0.02);
}

.decision-column-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 12px;
}

.decision-column-header h3 {
  margin: 0;
  font-size: 14px;
  letter-spacing: 0.12em;
}

.decision-stack {
  display: grid;
  gap: 10px;
}

.decision-item {
  border: 1px solid var(--panel-border);
  border-radius: 14px;
  padding: 12px;
  background: rgba(255, 255, 255, 0.03);
}

.decision-item.empty {
  color: var(--muted);
  text-align: center;
}

@media (max-width: 1200px) {
  .main-grid {
    grid-template-columns: 1fr;
  }

  .asset-grid {
    grid-template-columns: 1fr;
  }

  .hero-grid,
  .decision-grid {
    grid-template-columns: 1fr;
  }
}

@media (max-width: 720px) {
  .app-shell {
    width: min(100% - 20px, 100%);
  }

  .topbar {
    flex-direction: column;
    align-items: flex-start;
  }
}
'@

Write-Utf8File "src/vite-env.d.ts" @'
/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_SUPABASE_URL?: string;
  readonly VITE_SUPABASE_ANON_KEY?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
'@

Write-Host ""
Write-Host "ACTUS OS full rebuild files written."
Write-Host "Next:"
Write-Host "1. npm install"
Write-Host "2. copy .env.example to .env and add Supabase values if needed"
Write-Host "3. npm run dev"