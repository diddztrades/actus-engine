export function routeLabel(symbol: string) {
  const key = symbol.toUpperCase();

  if (key.includes("BTC")) return "Massive / Crypto";
  if (key.includes("ETH")) return "Massive / Crypto";
  if (key.includes("SOL")) return "Massive / Crypto";
  if (key.includes("EUR")) return "Alpha Vantage / FX";
  if (key.includes("XAU")) return "Alpha Vantage / Metals";
  if (key === "NQ" || key.includes("NAS")) return "Massive / Index";
  if (key === "CL" || key.includes("OIL")) return "Alpha Vantage / Energy";

  return "Core Feed";
}
