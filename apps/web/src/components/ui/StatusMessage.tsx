import type { ReactNode } from "react";

type StatusMessageProps = {
  variant?: "info" | "success" | "error";
  children: ReactNode;
};

export function StatusMessage({ variant = "info", children }: StatusMessageProps) {
  return (
    <p className={`status-message status-message--${variant}`} role="status" aria-live="polite">
      {children}
    </p>
  );
}
