import type { ReactNode } from "react";

type CardProps = {
  children: ReactNode;
};

export function Card({ children }: CardProps) {
  return (
    <div
      style={{
        border: "1px solid rgba(255,255,255,0.1)",
        borderRadius: "16px",
        padding: "16px",
        background: "rgba(0,0,0,0.2)",
      }}
    >
      {children}
    </div>
  );
}