type SectionTitleProps = {
  children: string;
};

export function SectionTitle({ children }: SectionTitleProps) {
  return (
    <h2
      style={{
        margin: 0,
        fontSize: "24px",
        fontWeight: 600,
        color: "white",
      }}
    >
      {children}
    </h2>
  );
}