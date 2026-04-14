type HistoryItem = {
  symbol: string;
  state: "wait" | "execute" | "avoid";
  entryPrice: number;
  currentPrice: number;
  timestamp: number;
  minutesInState: number;
  outcome: "open" | "win" | "loss";
};

let history: HistoryItem[] = [];

export function seedHistory(items: any[]) {
  if (history.length > 0) return;

  history = items.slice(0, 5).map((item: any, index: number) => ({
    symbol: item.symbol,
    state: item.state,
    entryPrice: item.price * (index % 2 === 0 ? 0.997 : 1.003),
    currentPrice: item.price,
    timestamp: Date.now() - (item.minutesInState * 60 * 1000),
    minutesInState: item.minutesInState,
    outcome:
      index === 0 ? "win" :
      index === 1 ? "open" :
      index === 2 ? "loss" :
      index === 3 ? "win" :
      "open"
  }));
}

export function trackAssets(items: any[]) {
  items.forEach((item: any) => {
    const existing = history.find((h) => h.symbol === item.symbol);

    if (!existing) {
      history.unshift({
        symbol: item.symbol,
        state: item.state,
        entryPrice: item.price,
        currentPrice: item.price,
        timestamp: Date.now(),
        minutesInState: item.minutesInState,
        outcome: "open"
      });
      return;
    }

    existing.currentPrice = item.price;
    existing.minutesInState = item.minutesInState;

    if (existing.state !== item.state) {
      history.unshift({
        symbol: item.symbol,
        state: item.state,
        entryPrice: item.price,
        currentPrice: item.price,
        timestamp: Date.now(),
        minutesInState: item.minutesInState,
        outcome: "open"
      });
      return;
    }

    if (existing.outcome === "open") {
      const change = (existing.currentPrice - existing.entryPrice) / existing.entryPrice;

      if (Math.abs(change) >= 0.0035) {
        if (existing.state === "execute") {
          existing.outcome = change > 0 ? "win" : "loss";
        } else if (existing.state === "avoid") {
          existing.outcome = change < 0 ? "win" : "loss";
        } else {
          existing.outcome = change > 0 ? "win" : "loss";
        }
      }
    }
  });

  history = history.slice(0, 20);

  return history;
}

export function getStats() {
  const closed = history.filter((h) => h.outcome !== "open");
  const wins = closed.filter((h) => h.outcome === "win").length;

  return {
    total: closed.length,
    wins,
    winRate: closed.length ? Math.round((wins / closed.length) * 100) : 0
  };
}

export function getReplay() {
  return history
    .slice(0, 8)
    .map((item) => ({
      symbol: item.symbol,
      state: item.state,
      outcome: item.outcome,
      minutesInState: item.minutesInState
    }));
}