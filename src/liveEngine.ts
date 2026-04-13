import { buildLeadFromBoard, stabiliseBoard } from "./signalEngine";

export function tickDashboard(data: any) {
  const evolveItem = (item: any) => {
    const drift = (Math.random() - 0.5) * 0.32;
    const nextPrice = Number((item.price * (1 + drift / 100)).toFixed(item.price < 10 ? 4 : 2));
    const nextChange = Number((item.changePct + drift * 0.28).toFixed(2));

    const lastPoint = item.sparkline[item.sparkline.length - 1] ?? 24;
    const nextPoint = Math.max(8, Math.min(42, lastPoint + Math.round((Math.random() - 0.5) * 4)));

    const nextSparkline = [...item.sparkline, nextPoint].slice(-16);

    return {
      ...item,
      price: nextPrice,
      changePct: nextChange,
      minutesInState: item.minutesInState + 1,
      sparkline: nextSparkline
    };
  };

  const rawBoard = {
    wait: data.board.wait.map(evolveItem),
    execute: data.board.execute.map(evolveItem),
    avoid: data.board.avoid.map(evolveItem)
  };

  const nextBoard = stabiliseBoard(rawBoard);
  const nextHero = buildLeadFromBoard(data.hero, nextBoard);

  const nextHeroChart = [
    ...data.hero.chart,
    Math.max(
      16,
      Math.min(
        44,
        data.hero.chart[data.hero.chart.length - 1] + Math.round((Math.random() - 0.5) * 3)
      )
    )
  ].slice(-24);

  const allBoardItems = [...nextBoard.wait, ...nextBoard.execute, ...nextBoard.avoid];

  const nextLower = data.lowerGrid.map((item: any) => {
    const found = allBoardItems.find((x: any) => x.symbol === item.symbol || x.name === item.name);
    return found
      ? {
          ...item,
          ...found
        }
      : evolveItem(item);
  });

  const nextRanked = [...allBoardItems]
    .sort((a: any, b: any) => (b.quality ?? b.confidence) - (a.quality ?? a.confidence))
    .slice(0, 5)
    .map((item: any, index: number) => ({
      rank: index + 1,
      label: item.name,
      state: item.state,
      score: item.quality ?? item.confidence
    }));

  return {
    ...data,
    updatedAt: new Date().toLocaleTimeString([], {
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit"
    }),
    hero: {
      ...nextHero,
      chart: nextHeroChart
    },
    board: nextBoard,
    lowerGrid: nextLower,
    ranked: nextRanked
  };
}