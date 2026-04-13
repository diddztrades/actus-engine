import type { ReactNode } from "react";

type ButtonProps = {
  children: ReactNode;
  onClick?: () => void;
  active?: boolean;
};

export function Button({ children, onClick, active = false }: ButtonProps) {
  return (
    <button
      onClick={onClick}
      style={{
        padding: "10px 16px",
        borderRadius: "10px",
        border: "1px solid rgba(255,255,255,0.12)",
        background: active ? "white" : "rgba(0,0,0,0.2)",
        color: active ? "black" : "white",
        cursor: "pointer",
      }}
    >
      {children}
    </button>
  );
}