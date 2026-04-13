export type NormalizedOptionContract = {
  underlyingAsset: string;
  underlyingSymbol: string;
  optionSymbol: string;
  expiry: string;
  strike: number;
  right: "C" | "P";
  bid: number | null;
  ask: number | null;
  last: number | null;
  mid: number | null;
  volume: number | null;
  openInterest: number | null;
  timeToExpiryYears: number | null;
};

export type NormalizedOptionChainSnapshot = {
  underlyingAsset: string;
  underlyingSymbol: string;
  underlyingPrice: number;
  expiry: string;
  contracts: NormalizedOptionContract[];
};
