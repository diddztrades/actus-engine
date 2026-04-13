export type ManualMacroEventSourceItem = {
  id: string;
  title: string;
  datetimeUtc: string;
  impact: "low" | "medium" | "high";
  country: string;
  eventType: string;
  markets: string[];
  tags: string[];
};

// Temporary manual macro source until a live provider such as Trading Economics is wired in.
// Keep entries explicit and editable so the adapter layer can stay unchanged later.
export const MANUAL_MACRO_EVENTS: ManualMacroEventSourceItem[] = [
  {
    id: "us-cpi-2026-04-15",
    title: "CPI",
    datetimeUtc: "2026-04-15T12:30:00Z",
    impact: "high",
    country: "US",
    eventType: "inflation",
    markets: ["USD", "NQ", "GC", "CL", "BTC", "ETH", "SOL", "EUR/USD"],
    tags: ["cpi", "inflation", "rates", "usd"],
  },
  {
    id: "ecb-rate-decision-2026-04-16",
    title: "ECB",
    datetimeUtc: "2026-04-16T12:15:00Z",
    impact: "high",
    country: "EU",
    eventType: "central-bank",
    markets: ["EUR/USD", "NQ", "GC"],
    tags: ["ecb", "rates", "eur", "central-bank"],
  },
  {
    id: "boe-rate-decision-2026-05-07",
    title: "BoE",
    datetimeUtc: "2026-05-07T11:00:00Z",
    impact: "high",
    country: "UK",
    eventType: "central-bank",
    markets: ["EUR/USD", "GC"],
    tags: ["boe", "rates", "gbp", "central-bank"],
  },
  {
    id: "us-nfp-2026-05-08",
    title: "NFP",
    datetimeUtc: "2026-05-08T12:30:00Z",
    impact: "high",
    country: "US",
    eventType: "labor",
    markets: ["USD", "NQ", "GC", "CL", "BTC", "ETH", "SOL", "EUR/USD"],
    tags: ["nfp", "labor", "usd", "rates"],
  },
  {
    id: "us-pce-2026-05-29",
    title: "PCE",
    datetimeUtc: "2026-05-29T12:30:00Z",
    impact: "high",
    country: "US",
    eventType: "inflation",
    markets: ["USD", "NQ", "GC", "BTC", "ETH", "SOL", "EUR/USD"],
    tags: ["pce", "inflation", "fed", "usd"],
  },
  {
    id: "fomc-2026-06-17",
    title: "FOMC",
    datetimeUtc: "2026-06-17T18:00:00Z",
    impact: "high",
    country: "US",
    eventType: "central-bank",
    markets: ["USD", "NQ", "GC", "CL", "BTC", "ETH", "SOL", "EUR/USD"],
    tags: ["fomc", "fed", "rates", "usd"],
  },
  {
    id: "boj-rate-decision-2026-06-18",
    title: "BoJ",
    datetimeUtc: "2026-06-18T03:00:00Z",
    impact: "medium",
    country: "JP",
    eventType: "central-bank",
    markets: ["NQ", "GC", "BTC", "ETH", "SOL"],
    tags: ["boj", "rates", "yen", "central-bank"],
  },
];

export function getManualMacroEventsSource(): ManualMacroEventSourceItem[] {
  return MANUAL_MACRO_EVENTS;
}
