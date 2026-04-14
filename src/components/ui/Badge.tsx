import type { CSSProperties, ReactNode } from "react";

type BadgeProps = {
  children: ReactNode;
  style?: CSSProperties;
};

export function Badge({ children, style = {} }: BadgeProps) {
  return (
    <span
      style={{
        padding: "4px 8px",
        borderRadius: "8px",
        fontSize: "12px",
        display: "inline-flex",
        alignItems: "center",
        ...style,
      }}
    >
      {children}
    </span>
  );
}