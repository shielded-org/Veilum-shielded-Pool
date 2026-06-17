import type { ReactNode } from "react";

type EmptyStateProps = {
  title: string;
  body?: string;
  action?: ReactNode;
};

export function EmptyState({ title, body, action }: EmptyStateProps) {
  return (
    <div className="empty-state">
      <svg className="empty-state__illus" width="80" height="80" viewBox="0 0 80 80" fill="none" aria-hidden>
        <rect x="12" y="20" width="56" height="40" rx="8" stroke="currentColor" strokeWidth="1.5" opacity="0.25" />
        <path d="M24 36h32M24 44h20" stroke="currentColor" strokeWidth="1.5" opacity="0.2" strokeLinecap="round" />
        <circle cx="56" cy="48" r="8" stroke="currentColor" strokeWidth="1.5" opacity="0.15" />
      </svg>
      <h3 className="empty-state__title">{title}</h3>
      {body && <p className="empty-state__body">{body}</p>}
      {action && <div className="empty-state__action">{action}</div>}
    </div>
  );
}
