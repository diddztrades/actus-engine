type ConfidenceMeterProps = {
  value: number;
};

function getTone(value: number) {
  if (value >= 85) return "elite";
  if (value >= 70) return "valid";
  if (value >= 50) return "developing";
  return "weak";
}

export function ConfidenceMeter({ value }: ConfidenceMeterProps) {
  const tone = getTone(value);

  return (
    <div className="confidence-meter">
      <div className={`confidence-meter__bar confidence-meter__bar--${tone}`} style={{ width: `${value}%` }} />
    </div>
  );
}
