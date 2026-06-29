import type { ReactNode } from "react";

type Tab = "home" | "shield" | "send" | "receive" | "activity" | "keys" | "faucet";

const TABS: Array<{ id: Tab; label: string; icon: string }> = [
  { id: "home", label: "Home", icon: "⌂" },
  { id: "shield", label: "Shield", icon: "◐" },
  { id: "send", label: "Send", icon: "→" },
  { id: "receive", label: "Receive", icon: "↓" },
  { id: "activity", label: "Activity", icon: "≡" },
];

export function BottomNav({ tab, onTab }: { tab: Tab; onTab: (t: Tab) => void }) {
  return (
    <nav className="wallet-bottom-nav" aria-label="Main">
      {TABS.map((t) => (
        <button
          key={t.id}
          type="button"
          className={tab === t.id ? "active" : ""}
          onClick={() => onTab(t.id)}
          aria-current={tab === t.id ? "page" : undefined}
        >
          <span className="icon" aria-hidden>
            {t.icon}
          </span>
          {t.label}
        </button>
      ))}
    </nav>
  );
}

export function WalletHeader({
  left,
  center,
  right,
}: {
  left?: ReactNode;
  center?: ReactNode;
  right?: ReactNode;
}) {
  return (
    <header className="wallet-header">
      <div className="wallet-header__start">{left}</div>
      {center ? <div className="wallet-header__center">{center}</div> : null}
      {right ? <div className="wallet-header__end">{right}</div> : null}
    </header>
  );
}

export type { Tab };
