type HistoryItem = {
  symbol: string;
  state: "execute" | "wait" | "avoid";
  entryPrice: number;
  currentPrice: number;
  minutesInState: number;
  outcome: "open" | "win" | "loss";
  startedAt: number;
};

let history: HistoryItem[] = [];

export function seedHistory(assets: any[]) {
  if (history.length > 0) return;

  history = assets.slice(0, 5).map((asset: any, index: number) => ({
    symbol: asset.symbol,
    state: asset.state,
    entryPrice: asset.price * (index % 2 === 0 ? 0.997 : 1.003),
    currentPrice: asset.price,
    minutesInState: asset.minutesInState,
    outcome: index === 0 ? "win" : index === 1 ? "open" : index === 2 ? "loss" : "open",
    startedAt: Date.now() - asset.minutesInState * 60 * 1000
  }));
}

export function trackAssets(assets: any[]) {
  assets.forEach((asset: any) => {
    let existing = history.find((x) => x.symbol === asset.symbol);

    if (!existing) {
      history.unshift({
        symbol: asset.symbol,
        state: asset.state,
        entryPrice: asset.price,
        currentPrice: asset.price,
        minutesInState: asset.minutesInState,
        outcome: "open",
        startedAt: Date.now()
      });
      return;
    }

    if (existing.state !== asset.state) {
      history.unshift({
        symbol: asset.symbol,
        state: asset.state,
        entryPrice: asset.price,
        currentPrice: asset.price,
        minutesInState: asset.minutesInState,
        outcome: "open",
        startedAt: Date.now()
      });
      existing = history[0];
    } else {
      existing.currentPrice = asset.price;
      existing.minutesInState = asset.minutesInState;
    }

    if (existing.outcome === "open") {
      const move = (existing.currentPrice - existing.entryPrice) / existing.entryPrice;

      if (Math.abs(move) >= 0.0035) {
        if (existing.state === "execute") {
          existing.outcome = move > 0 ? "win" : "loss";
        } else if (existing.state === "avoid") {
          existing.outcome = move < 0 ? "win" : "loss";
        } else {
          existing.outcome = move > 0 ? "win" : "loss";
        }
      }
    }
  });

  history = history.slice(0, 24);
  return history;
}

export function getStats() {
  const closed = history.filter((x) => x.outcome !== "open");
  const wins = closed.filter((x) => x.outcome === "win").length;

  return {
    total: closed.length,
    wins,
    winRate: closed.length ? Math.round((wins / closed.length) * 100) : 0
  };
}

export function getReplay() {
  return history.slice(0, 6).map((item) => ({
    symbol: item.symbol,
    state: item.state,
    outcome: item.outcome,
    minutesAgo: Math.max(1, Math.floor((Date.now() - item.startedAt) / 60000))
  }));
}
