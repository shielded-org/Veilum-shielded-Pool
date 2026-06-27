import { Link } from "react-router-dom";

import { cn } from "../../../lib/cn";

export function MovingBorderButton({
  children,
  to,
  className,
  variant = "primary",
}: {
  children: React.ReactNode;
  to: string;
  className?: string;
  variant?: "primary" | "secondary";
}) {
  return (
    <Link
      to={to}
      className={cn(
        "group relative inline-flex overflow-hidden rounded-full p-[1px] transition",
        variant === "primary" && "bg-gradient-to-r from-veilum-accent/80 via-teal-300/50 to-veilum-accent/80",
        variant === "secondary" && "bg-veilum-border",
        className
      )}
    >
      <span
        className={cn(
          "relative inline-flex items-center justify-center rounded-full px-7 py-3 text-sm font-medium transition group-hover:bg-veilum-elevated/90",
          variant === "primary" ? "bg-veilum-accent text-veilum-bg" : "bg-veilum-elevated text-veilum-text"
        )}
      >
        {children}
      </span>
    </Link>
  );
}
