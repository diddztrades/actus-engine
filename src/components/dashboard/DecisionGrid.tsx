import { DecisionCard } from "./DecisionCard";
import type { DecisionCard as DecisionCardModel } from "../../lib/actusDecision";

type DecisionGridProps = {
  data: DecisionCardModel[];
};

type ColumnTone = "wait" | "execute" | "avoid";

type ColumnProps = {
  title: string;
  subtitle: string;
  tone: ColumnTone;
  cards: DecisionCardModel[];
};

function toneStyles(tone: ColumnTone) {
  if (tone === "execute") {
    return {
      shell: "border-emerald-500/25 bg-[linear-gradient(180deg,rgba(0,255,148,0.08),rgba(0,0,0,0.02))]",
      title: "text-emerald-400",
      count: "text-emerald-300",
      badge: "border-emerald-500/25 bg-emerald-500/10 text-emerald-300",
    };
  }

  if (tone === "avoid") {
    return {
      shell: "border-rose-500/25 bg-[linear-gradient(180deg,rgba(255,59,59,0.08),rgba(0,0,0,0.02))]",
      title: "text-rose-400",
      count: "text-rose-300",
      badge: "border-rose-500/25 bg-rose-500/10 text-rose-300",
    };
  }

  return {
    shell: "border-amber-500/20 bg-[linear-gradient(180deg,rgba(242,183,5,0.06),rgba(0,0,0,0.02))]",
    title: "text-amber-300",
    count: "text-amber-200",
    badge: "border-amber-500/20 bg-amber-500/10 text-amber-300",
  };
}

function EmptyAvoidCard() {
  return (
    <div className="rounded-[26px] border border-rose-500/30 bg-[radial-gradient(circle_at_top,rgba(255,59,59,0.08),transparent_48%),linear-gradient(180deg,#130405_0%,#0a0202_100%)] p-4">
      <div className="flex items-start gap-4">
        <div className="flex h-12 w-12 items-center justify-center rounded-2xl border border-rose-500/25 bg-rose-500/10 text-rose-400">
          ?
        </div>

        <div>
          <div className="text-[30px] font-bold leading-none text-rose-400">NO RISK FLAGS</div>
          <div className="mt-3 text-[16px] text-slate-500">
            Risk filter is clear. No assets are currently invalidated.
          </div>
        </div>
      </div>
    </div>
  );
}

function Column({ title, subtitle, tone, cards }: ColumnProps) {
  const styles = toneStyles(tone);

  return (
    <div className={`rounded-[28px] border p-4 ${styles.shell}`}>
      <div className="mb-4 rounded-[24px] border border-white/8 bg-black/25 p-5">
        <div className="flex items-start justify-between gap-3">
          <div>
            <div className={`text-[34px] font-extrabold leading-none ${styles.title}`}>{title}</div>
            <div className="mt-2 text-[14px] text-slate-500">{subtitle}</div>
          </div>

          <div className="text-right">
            <div className={`text-[44px] font-extrabold leading-none ${styles.count}`}>{cards.length}</div>
            <div className="mt-1 text-[11px] uppercase tracking-[0.18em] text-slate-500">Assets</div>
          </div>
        </div>

        <div className="mt-5 flex items-center justify-between border-t border-white/6 pt-4">
          <div className="text-[13px] text-slate-500">
            {tone === "execute" ? "A+ setups — priority queue" : tone === "avoid" ? "Invalid / high-risk" : "Building candidates"}
          </div>

          <div className={`rounded-full border px-3 py-1 text-[11px] font-semibold ${styles.badge}`}>LIVE</div>
        </div>
      </div>

      <div className="space-y-4">
        {cards.length === 0 && tone === "avoid" ? (
          <EmptyAvoidCard />
        ) : (
          cards.map((card) => <DecisionCard key={`${card.symbol}-${card.name}`} data={card} />)
        )}
      </div>
    </div>
  );
}

export function DecisionGrid({ data }: DecisionGridProps) {
  const wait = data.filter((card) => card.action === "WAIT");
  const execute = data.filter((card) => card.action === "EXECUTE");
  const avoid = data.filter((card) => card.action === "AVOID");

  return (
    <div className="grid grid-cols-1 gap-5 px-6 pb-8 xl:grid-cols-3">
      <Column title="WAIT" subtitle="Hold position" tone="wait" cards={wait} />
      <Column title="EXECUTE" subtitle="Take the trade now" tone="execute" cards={execute} />
      <Column title="AVOID" subtitle="Stay out or exit now" tone="avoid" cards={avoid} />
    </div>
  );
}
