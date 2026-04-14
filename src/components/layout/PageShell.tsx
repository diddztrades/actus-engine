import type { ReactNode } from "react";

type PageShellProps = {
  children: ReactNode;
};

export function PageShell({ children }: PageShellProps) {
  return (
    <div
      style={{
        minHeight: "100vh",
        background: "#05070b",
        color: "white",
        padding: "24px",
        fontFamily: "Arial, Helvetica, sans-serif",
      }}
    >
      <div style={{ maxWidth: "1320px", margin: "0 auto" }}>{children}</div>
    </div>
  );
}