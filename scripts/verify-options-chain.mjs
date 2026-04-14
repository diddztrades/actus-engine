const response = await fetch("http://localhost:3002/api/databento/options/chain?asset=NQ");

if (!response.ok) {
  throw new Error(`Option chain verification failed: ${response.status}`);
}

const payload = await response.json();

console.log(
  JSON.stringify(
    {
      underlyingAsset: payload.snapshot.underlyingAsset,
      underlyingSymbol: payload.snapshot.underlyingSymbol,
      underlyingPrice: payload.snapshot.underlyingPrice,
      expiry: payload.snapshot.expiry,
      contractCount: payload.snapshot.contracts.length,
      sample: payload.snapshot.contracts.slice(0, 5),
    },
    null,
    2,
  ),
);
