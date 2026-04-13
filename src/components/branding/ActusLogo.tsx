export function ActusLogo() {
  return (
    <div className="flex items-center gap-4">
      <img
        src="/actus-logo.png"
        alt="ACTUS OS"
        className="h-14 w-auto object-contain"
        draggable={false}
      />

      <div className="leading-none">
        <div className="text-[12px] font-medium tracking-[0.16em] text-slate-500">
          Decision-first engine
        </div>
      </div>
    </div>
  );
}
