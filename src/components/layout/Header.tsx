import { SearchBar } from "../ui/SearchBar";
import { ActusLogo } from "../branding/ActusLogo";

type HeaderProps = {
  query: string;
  onSearch: (value: string) => void;
};

export function Header({ query, onSearch }: HeaderProps) {
  return (
    <>
      <style>
        {`
          @keyframes actusLiveDot {
            0% {
              opacity: 0.55;
              box-shadow: 0 0 0 0 rgba(16,185,129,0.45);
            }
            50% {
              opacity: 1;
              box-shadow: 0 0 0 8px rgba(16,185,129,0.0);
            }
            100% {
              opacity: 0.55;
              box-shadow: 0 0 0 0 rgba(16,185,129,0.0);
            }
          }
        `}
      </style>

      <div
        style={{
          marginBottom: "22px",
          display: "grid",
          gap: "14px",
        }}
      >
        {/* Top Row */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: "16px",
            flexWrap: "wrap",
          }}
        >
          <ActusLogo />

          <div
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: "10px",
              padding: "8px 12px",
              borderRadius: "999px",
              border: "1px solid rgba(52,211,153,0.18)",
              background: "rgba(16,185,129,0.06)",
              color: "#bbf7d0",
              fontSize: "12px",
              fontWeight: 700,
              letterSpacing: "0.06em",
              textTransform: "uppercase",
            }}
          >
            <span
              style={{
                width: "8px",
                height: "8px",
                borderRadius: "999px",
                background: "#34d399",
                animation: "actusLiveDot 1.9s ease-in-out infinite",
              }}
            />
            Live Feed Active
          </div>
        </div>

        {/* Tagline */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: "16px",
            flexWrap: "wrap",
          }}
        >
          <p
            style={{
              margin: 0,
              color: "#a1a1aa",
              fontSize: "13.5px",
              maxWidth: "560px",
              lineHeight: 1.5,
            }}
          >
            Real-time market structure, opportunity ranking, and decision clarity.
          </p>

          <div
            style={{
              fontSize: "11px",
              fontWeight: 700,
              letterSpacing: "0.10em",
              textTransform: "uppercase",
              color: "#71717a",
            }}
          >
            Actus OS · Decision Layer
          </div>
        </div>

        {/* Search */}
        <div>
          <SearchBar value={query} onChange={onSearch} />
        </div>
      </div>
    </>
  );
}