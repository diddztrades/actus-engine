export async function fetchMarket() {
  try {
    const res = await fetch("http://localhost:3001/market");
    return await res.json();
  } catch {
    return null;
  }
}
