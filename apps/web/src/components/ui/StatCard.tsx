import type { ReactNode } from "react";

import { IconEye, IconEyeOff } from "./icons";

type StatCardProps = {
  label: string;
  value: ReactNode;
  subLabel?: string;
  variant?: "default" | "shielded";
  masked?: boolean;
  onToggleReveal?: () => void;
  reveal?: boolean;
  flash?: boolean;
};

export function StatCard({
  label,
  value,
  subLabel,
  variant = "default",
  masked,
  onToggleReveal,
  reveal,
  flash,
}: StatCardProps) {
  const showToggle = variant === "shielded" && onToggleReveal;

  return (
    <div className={`stat-card stat-card--${variant}${flash ? " stat-card--flash" : ""}`}>
      <div className="stat-card__header">
        <span className="stat-card__label">{label}</span>
        {showToggle && (
          <button
            type="button"
            className="stat-card__eye"
            onClick={onToggleReveal}
            aria-label={reveal ? "Hide balance" : "Show balance"}
            aria-pressed={reveal}
          >
            {reveal ? <IconEye size={16} /> : <IconEyeOff size={16} />}
          </button>
        )}
      </div>
      <p className={`stat-card__value${masked ? " stat-card__value--masked" : ""}`}>{value}</p>
      {subLabel && <p className="stat-card__sub">{subLabel}</p>}
    </div>
  );
}
