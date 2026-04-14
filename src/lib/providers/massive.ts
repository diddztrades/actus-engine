export async function fetchMassivePrevious(symbol: string, apiKey: string, apiUrl = "https://api.massive.com") {
  const res = await fetch(
    `${apiUrl}/v2/aggs/ticker/${encodeURIComponent(symbol)}/prev?adjusted=true&apiKey=${encodeURIComponent(apiKey)}`,
  );

  if (!res.ok) {
    throw new Error("Massive request failed");
  }

  const json = await res.json();
  return json.results?.[0];
}
