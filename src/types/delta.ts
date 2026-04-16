export type DeltaAvailability =
  | "DIRECTIONAL"
  | "SOURCE_ONLY"
  | "UNAVAILABLE"
  | "UNSUPPORTED";

export type DeltaSignal = {
  deltaAvailability: DeltaAvailability;
  deltaSupportedAsset: boolean;
  deltaSourceAvailable: boolean;
  deltaDirectionalAvailable: boolean;
  deltaReferencePrice?: number | null;
  bias?: "LONG" | "SHORT" | "NEUTRAL";
  strength?: number;
  condition?: "ACCUMULATION" | "DISTRIBUTION" | "ABSORPTION" | "NEUTRAL";
  source?: string | null;
  updatedAt?: string | null;
};
