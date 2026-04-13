import type { Asset } from "../../types/asset";
import type { MacroCard } from "../../types/macro";
import { SegmentTabs } from "./SegmentTabs";
import { AssetRow } from "./AssetRow";
import { MacroGrid } from "./MacroGrid";
import { Card } from "../ui/Card";
import { SectionTitle } from "../ui/SectionTitle";

type MarketStateBoardProps = {
  selectedTab: string;
  onTabChange: (value: string) => void;
  filteredAssets: Asset[];
  topOpportunities: Asset[];
  macroCards: MacroCard[];
};

export function MarketStateBoard({
  selectedTab,
  onTabChange,
  filteredAssets,
  topOpportunities,
  macroCards,
}: MarketStateBoardProps) {
  const activeCount =
    selectedTab === "live"
      ? filteredAssets.length
      : selectedTab === "watchlist"
      ? topOpportunities.length
      : macroCards.length;

  return (
    <>
      <style>
        {`
          @keyframes boardLivePulse {
            0% {
              opacity: 0.55;
              box-shadow: 0 0 0 0 rgba(16,185,129,0.35);
            }
            50% {
              opacity: 1;
              box-shadow: 0 0 0 8px rgba(16,185,129,0);
            }
            100% {
              opacity: 0.55;
              box-shadow: 0 0 0 0 rgba(16,185,129,0);
            }
          }
        `}
      </style>

      <Card>
        <div
          style={{
            display: "flex",
            alignItems: "flex-start",
            justifyContent: "space-between",
            gap: "16px",
            flexWrap: "wrap",
            marginBottom: "18px",
          }}
        >
          <div>
            <SectionTitle>Live Market State Board</SectionTitle>

            <p
              style={{
                margin: "8px 0 0 0",
                color: "#a1a1aa",
                fontSize: "14px",
              }}
            >
              Ranked by setup quality and clarity of structure.
            </p>
          </div>

          <div
            style={{
              display: "flex",
              gap: "8px",
              flexWrap: "wrap",
              alignItems: "center",
            }}
          >
            <span
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: "8px",
                padding: "8px 12px",
                borderRadius: "999px",
                border: "1px solid rgba(16,185,129,0.18)",
                background: "rgba(16,185,129,0.08)",
                color: "#86efac",
                fontSize: "12px",
                fontWeight: 600,
                letterSpacing: "0.04em",
                textTransform: "uppercase",
              }}
            >
              <span
                style={{
                  width: "8px",
                  height: "8px",
                  borderRadius: "999px",
                  background: "#34d399",
                  animation: "boardLivePulse 1.9s ease-in-out infinite",
                }}
              />
              Live board
            </span>

            <span
              style={{
                padding: "8px 12px",
                borderRadius: "999px",
                border: "1px solid rgba(255,255,255,0.1)",
                background: "rgba(255,255,255,0.03)",
                color: "#d4d4d8",
                fontSize: "12px",
                fontWeight: 600,
              }}
            >
              {activeCount} items
            </span>

            <span
              style={{
                padding: "8px 12px",
                borderRadius: "999px",
                border: "1px solid rgba(255,255,255,0.1)",
                background: "rgba(255,255,255,0.03)",
                color: "#d4d4d8",
                fontSize: "12px",
                fontWeight: 600,
                textTransform: "capitalize",
              }}
            >
              {selectedTab}
            </span>
          </div>
        </div>

        <div
          style={{
            marginBottom: "16px",
            padding: "8px",
            borderRadius: "18px",
            border: "1px solid rgba(255,255,255,0.08)",
            background: "rgba(255,255,255,0.02)",
            display: "inline-flex",
          }}
        >
          <SegmentTabs value={selectedTab} onChange={onTabChange} />
        </div>

        {selectedTab === "live" && (
          <div style={{ display: "grid", gap: "12px" }}>
            {filteredAssets.map((asset) => (
              <AssetRow key={asset.symbol} asset={asset} />
            ))}
          </div>
        )}

        {selectedTab === "watchlist" && (
          <div style={{ display: "grid", gap: "12px" }}>
            {topOpportunities.map((asset) => (
              <AssetRow key={asset.symbol} asset={asset} />
            ))}
          </div>
        )}

        {selectedTab === "macro" && <MacroGrid items={macroCards} />}
      </Card>
    </>
  );
}