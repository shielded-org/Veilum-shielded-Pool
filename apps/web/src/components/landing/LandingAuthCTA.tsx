import { Link } from "react-router-dom";

import { useLandingAuth } from "../../hooks/use-landing-auth";
import { IconSpinner } from "../ui/icons";
import { MovingBorderButton } from "./ui/MovingBorderButton";
import { cn } from "../../lib/cn";

type LandingAuthCTAProps = {
  variant?: "hero" | "nav" | "cta";
  className?: string;
  onAction?: () => void;
};

export function LandingAuthCTA({ variant = "hero", className, onAction }: LandingAuthCTAProps) {
  const {
    wallet,
    busy,
    hasShieldKeys,
    marketingBrowse,
    connectWallet,
    openKeySign,
    returnToDashboard,
  } = useLandingAuth();

  const wrap = (node: React.ReactNode) => {
    if (!className) return node;
    return <div className={className}>{node}</div>;
  };

  if (hasShieldKeys) {
    if (variant === "nav") {
      return wrap(
        <Link to="/dashboard" className="lp-btn-primary ml-2 !py-2" onClick={onAction}>
          {marketingBrowse ? "Return to dashboard" : "Open dashboard"}
        </Link>
      );
    }
    return wrap(<MovingBorderButton to="/dashboard">{returnToDashboard.label}</MovingBorderButton>);
  }

  if (wallet) {
    const label = "Continue in wallet";
    if (variant === "nav") {
      return wrap(
        <button
          type="button"
          className={cn("lp-btn-primary ml-2 !py-2", className)}
          onClick={() => {
            openKeySign();
            onAction?.();
          }}
          disabled={busy}
        >
          {busy ? "…" : label}
        </button>
      );
    }
    return wrap(
      <button
        type="button"
        className={cn(
          "group relative inline-flex overflow-hidden rounded-full p-[1px] transition",
          "bg-gradient-to-r from-veilum-accent/80 via-teal-300/50 to-veilum-accent/80",
          className
        )}
        onClick={() => {
          openKeySign();
          onAction?.();
        }}
        disabled={busy}
      >
        <span className="relative inline-flex items-center justify-center rounded-full bg-veilum-accent px-7 py-3 text-sm font-medium text-veilum-bg transition group-hover:brightness-110">
          {busy ? (
            <>
              <IconSpinner size={16} /> Connecting…
            </>
          ) : (
            label
          )}
        </span>
      </button>
    );
  }

  const connectLabel = variant === "nav" ? "Connect wallet" : "Connect wallet";

  if (variant === "nav") {
    return wrap(
      <button
        type="button"
        className="lp-btn-primary ml-2 !py-2"
        onClick={() => {
          void connectWallet();
          onAction?.();
        }}
        disabled={busy}
      >
        {busy ? "…" : connectLabel}
      </button>
    );
  }

  return wrap(
    <button
      type="button"
      className={cn(
        "group relative inline-flex overflow-hidden rounded-full p-[1px] transition",
        "bg-gradient-to-r from-veilum-accent/80 via-teal-300/50 to-veilum-accent/80",
        className
      )}
      onClick={() => {
        void connectWallet();
        onAction?.();
      }}
      disabled={busy}
    >
      <span className="relative inline-flex items-center justify-center rounded-full bg-veilum-accent px-7 py-3 text-sm font-medium text-veilum-bg transition group-hover:brightness-110">
        {busy ? (
          <>
            <IconSpinner size={16} /> Connecting…
          </>
        ) : (
          connectLabel
        )}
      </span>
    </button>
  );
}
