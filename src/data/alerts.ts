import type { AlertItem } from "../types/alert";

export const alerts: AlertItem[] = [
  {
    time: "09:28",
    asset: "NQ",
    title: "Expansion confirmed above opening range",
    body: "Price held above the NY opening range high with accelerating speed. Best posture remains buy pullbacks, not breakout chasing.",
    severity: "high",
  },
  {
    time: "09:24",
    asset: "BTC",
    title: "Compression under resistance",
    body: "Bitcoin remains pinned below the Asia high. Wait for acceptance above resistance or a sweep-and-reclaim pattern.",
    severity: "medium",
  },
  {
    time: "09:19",
    asset: "XAU",
    title: "Exhaustion risk rising",
    body: "Gold is still elevated versus session mean, but the move has lost speed. Avoid aggressive chasing into highs.",
    severity: "low",
  },
  {
    time: "09:12",
    asset: "OIL",
    title: "Disorder state triggered",
    body: "Headline sensitivity remains extreme. Stand aside until directional structure becomes cleaner.",
    severity: "high",
  },
];