export function Paywall({ locked, onUpgrade }: any) {
  if (!locked) return null;

  return (
    <div style={{
      position: "fixed",
      inset: 0,
      background: "rgba(5,10,15,0.88)",
      backdropFilter: "blur(6px)",
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      zIndex: 900
    }}>
      <div style={{
        padding: 28,
        borderRadius: 16,
        border: "1px solid rgba(255,255,255,0.08)",
        background: "#0e1622",
        textAlign: "center",
        maxWidth: 420
      }}>
        <h2 style={{ marginBottom: 10 }}>Unlock Full Access</h2>
        <p style={{ color: "#aaa", marginBottom: 20 }}>
          See all EXECUTE signals, real-time alerts and performance stats.
        </p>
        <button
          onClick={onUpgrade}
          style={{
            padding: "12px 18px",
            borderRadius: 10,
            border: "none",
            background: "#3ddc97",
            color: "#08111d",
            fontWeight: 800,
            cursor: "pointer"
          }}
        >
          Upgrade
        </button>
      </div>
    </div>
  );
}