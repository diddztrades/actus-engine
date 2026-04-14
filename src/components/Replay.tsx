export function Replay({ history }: any) {
  return (
    <div style={{
      marginTop: 30,
      padding: 20,
      border: "1px solid rgba(255,255,255,0.08)",
      borderRadius: 14
    }}>
      <h2>Recent Decisions</h2>

      {history.map((h: any, i: number) => (
        <div key={i} style={{
          marginTop: 10,
          padding: 10,
          borderBottom: "1px solid rgba(255,255,255,0.05)"
        }}>
          {h.symbol} — {h.state.toUpperCase()} — {h.outcome}
        </div>
      ))}
    </div>
  );
}