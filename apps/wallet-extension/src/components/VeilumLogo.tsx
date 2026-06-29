import { IconVeilumMark } from "./ui/icons";

type VeilumLogoProps = {
  size?: "sm" | "md" | "lg";
  showWordmark?: boolean;
  centered?: boolean;
};

const MARK_PX = { sm: 18, md: 24, lg: 32 } as const;
const CHIP_PX = { sm: 36, md: 44, lg: 56 } as const;

export function VeilumLogo({
  size = "md",
  showWordmark = true,
  centered = false,
}: VeilumLogoProps) {
  return (
    <div
      className={`veilum-logo veilum-logo--${size}${centered ? " veilum-logo--centered" : ""}${showWordmark ? "" : " veilum-logo--mark-only"}`}
    >
      <span
        className="veilum-logo__mark"
        style={{ width: CHIP_PX[size], height: CHIP_PX[size] }}
        aria-hidden
      >
        <IconVeilumMark size={MARK_PX[size]} />
      </span>
      {showWordmark ? <span className="veilum-logo__wordmark">Veilum</span> : null}
    </div>
  );
}
