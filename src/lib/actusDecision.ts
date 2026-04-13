export type Bias = "LONG" | "SHORT" | "NEUTRAL";
export type Status = "BUILDING" | "CONFIRMED" | "FAILING";
export type Action = "WAIT" | "EXECUTE" | "AVOID";
export type Quality = number;
export type DecisionBucket = Action;
export type PublicBias = Bias;
export type PublicStatus = Status;

export type DecisionCard = {
  name: string;
  symbol: string;
  price: number;
  changePercent: number;
  bias: Bias;
  status: Status;
  action: Action;
  quality: Quality;
  stateAge: number;
  entry: number;
  support: number;
  rsi: number;
  momentum: number;
  priceLevel: number;
  greenLine: number;
  redLine: number;
};

export type ActusDecisionCard = DecisionCard & {
  bucket: DecisionBucket;
  bias: PublicBias;
  status: PublicStatus;
};

export function buildDecision(card: DecisionCard): DecisionCard {
  return card;
}
