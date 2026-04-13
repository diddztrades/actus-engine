import { useEffect } from "react";

type AlertToastTone = "ready" | "active" | "exit" | "invalidated" | "info";

const TONE_STYLES: Record<AlertToastTone, { color: string; border: string; glow: string }> = {
  ready: { color: "#ffd84d", border: "rgba(255,216,77,0.42)", glow: "rgba(255,216,77,0.18)" },
  active: { color: "#45ffb5", border: "rgba(69,255,181,0.42)", glow: "rgba(69,255,181,0.18)" },
  exit: { color: "#ff9d66", border: "rgba(255,157,102,0.42)", glow: "rgba(255,157,102,0.18)" },
  invalidated: { color: "#ff6f91", border: "rgba(255,111,145,0.42)", glow: "rgba(255,111,145,0.18)" },
  info: { color: "#8ea0bf", border: "rgba(142,160,191,0.32)", glow: "rgba(142,160,191,0.14)" },
};

type AlertToastProps = {
  title: string;
  body?: string;
  onClose: () => void;
  tone?: AlertToastTone;
};

export function AlertToast({ title, body, onClose, tone = "info" }: AlertToastProps) {
  const style = TONE_STYLES[tone];

  useEffect(() => {
    const t = setTimeout(onClose, 3500);
    return () => clearTimeout(t);
  }, [onClose]);

  return (
    <div style={{
      position: "fixed",
      bottom: 24,
      right: "max(24px, calc((100vw - min(1480px, 100%)) / 2 + 24px))",
      minWidth: 280,
      maxWidth: 360,
      padding: "14px 16px",
      borderRadius: 14,
      background: "linear-gradient(180deg, rgba(11,16,28,0.97), rgba(6,9,17,0.99))",
      border: `1px solid ${style.border}`,
      color: style.color,
      boxShadow: `0 16px 42px rgba(0,0,0,0.45), 0 0 28px ${style.glow}`,
      zIndex: 1000,
      display: "grid",
      gap: 6,
    }}>
      <div style={{ fontSize: 11, letterSpacing: "0.08em", textTransform: "uppercase", fontWeight: 700 }}>{title}</div>
      {body ? <div style={{ fontSize: 13, color: "#f4f7fb", lineHeight: 1.45, fontWeight: 600 }}>{body}</div> : null}
    </div>
  );
}
