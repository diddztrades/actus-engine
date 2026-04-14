import type { MacroSnapshot } from "../types/macro";

type MacroPanelProps = {
  macro: MacroSnapshot;
};

export function MacroPanel({ macro }: MacroPanelProps) {
  return (
    <section className="panel">
      <div className="panel-header">
        <h2>Macro regime</h2>
      </div>

      <div className="stack">
        <div className="macro-line">
          <span>Volatility</span>
          <strong>{macro.volatilityRegime}</strong>
        </div>
        <div className="macro-line">
          <span>USD bias</span>
          <strong>{macro.usdBias}</strong>
        </div>
        <div className="macro-line">
          <span>Energy pressure</span>
          <strong>{macro.energyPressure}</strong>
        </div>
        <div className="macro-line">
          <span>Equities</span>
          <strong>{macro.equityTone}</strong>
        </div>
        <div className="macro-line">
          <span>Crypto</span>
          <strong>{macro.cryptoTone}</strong>
        </div>
      </div>
    </section>
  );
}