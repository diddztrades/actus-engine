export async function fetchLiveCrypto() {
  try {
    const symbols = ["BTCUSDT", "ETHUSDT", "SOLUSDT"];
    const results = await Promise.all(
      symbols.map(async (symbol) => {
        const res = await fetch(`https://api.binance.com/api/v3/ticker/24hr?symbol=${symbol}`);
        const json = await res.json();
        return {
          symbol,
          price: Number(json.lastPrice),
          changePct: Number(json.priceChangePercent)
        };
      })
    );

    return {
      BTCUSD: results.find((x) => x.symbol === "BTCUSDT"),
      ETHUSD: results.find((x) => x.symbol === "ETHUSDT"),
      SOLUSD: results.find((x) => x.symbol === "SOLUSDT")
    };
  } catch {
    return null;
  }
}
