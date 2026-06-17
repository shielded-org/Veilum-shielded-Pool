import type { ReactNode } from "react";

import { IconLock } from "./icons";

type PrivacyCalloutProps = {
  variant: "public" | "private";
  children?: ReactNode;
};

export function PrivacyCallout({ variant, children }: PrivacyCalloutProps) {
  const isPublic = variant === "public";
  return (
    <div className={`privacy-callout privacy-callout--${variant}`} role="note">
      <span className={`privacy-callout__pill privacy-callout__pill--${variant}`}>
        {isPublic ? "Public" : "Private"}
      </span>
      <div className="privacy-callout__body">
        <span className="privacy-callout__icon" aria-hidden>
          {isPublic ? (
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <circle cx="12" cy="12" r="9" />
              <circle cx="12" cy="12" r="3" fill="currentColor" stroke="none" />
            </svg>
          ) : (
            <IconLock size={18} />
          )}
        </span>
        <div>
          <strong>{isPublic ? "Visible on-chain" : "Amount and recipient stay private"}</strong>
          {children && <p className="privacy-callout__detail">{children}</p>}
        </div>
      </div>
    </div>
  );
}
