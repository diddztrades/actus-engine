import type { ReactNode } from "react";

type DashboardGridProps = {
  left: ReactNode;
  right: ReactNode;
};

export function DashboardGrid({ left, right }: DashboardGridProps) {
  return (
    <div
      style={{
        display: "grid",
        gap: "16px",
        gridTemplateColumns: "1.55fr 1fr",
        alignItems: "start",
        marginBottom: "16px",
      }}
    >
      {left}
      {right}
    </div>
  );
}