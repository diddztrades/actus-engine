export type RankingItem = {
  symbol: string;
  name: string;
  score: number;
  state: "execute" | "wait" | "avoid";
  note: string;
};