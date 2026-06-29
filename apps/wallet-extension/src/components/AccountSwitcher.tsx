import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

import { shortAddress } from "../lib/wallet-session";
import type { VaultAccountSummary } from "../vault/storage";
import { IconChevronDown, IconSpinner, IconX } from "./ui/icons";

type AccountSwitcherProps = {
  accounts: VaultAccountSummary[];
  activeAccountId: string;
  canAddAccount: boolean;
  busy?: boolean;
  onSelect: (accountId: string) => void;
  onAddAccount: () => void;
};

function getPortalRoot(): HTMLElement | null {
  if (typeof document === "undefined") return null;
  return document.getElementById("root");
}

export function AccountSwitcher({
  accounts,
  activeAccountId,
  canAddAccount,
  busy,
  onSelect,
  onAddAccount,
}: AccountSwitcherProps) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const active = accounts.find((a) => a.id === activeAccountId) ?? accounts[0];

  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open]);

  if (!active) return null;

  const overlay = open ? (
    <div
      className="account-switcher__overlay"
      role="dialog"
      aria-modal="true"
      aria-label="Select account"
    >
      <div className="account-switcher__panel">
        <header className="account-switcher__header">
          <h2 className="account-switcher__title">Accounts</h2>
          <button
            type="button"
            className="account-switcher__close"
            onClick={() => setOpen(false)}
            aria-label="Close"
          >
            <IconX size={18} />
          </button>
        </header>

        <div className="account-switcher__list" role="listbox" aria-label="Accounts">
          {accounts.map((account) => (
            <button
              key={account.id}
              type="button"
              role="option"
              aria-selected={account.id === activeAccountId}
              disabled={busy}
              className={`account-switcher__option${account.id === activeAccountId ? " account-switcher__option--active" : ""}`}
              onClick={() => {
                setOpen(false);
                if (account.id !== activeAccountId) onSelect(account.id);
              }}
            >
              <span className="account-switcher__avatar account-switcher__avatar--lg" aria-hidden>
                {(account.derivationIndex ?? 0) + 1}
              </span>
              <span className="account-switcher__option-text">
                <span className="account-switcher__name">{account.name}</span>
                <span className="account-switcher__address">{shortAddress(account.publicKey)}</span>
              </span>
              {account.id === activeAccountId ? (
                <span className="account-switcher__check" aria-hidden>
                  ✓
                </span>
              ) : null}
            </button>
          ))}
        </div>

        {canAddAccount ? (
          <footer className="account-switcher__footer">
            <button
              type="button"
              className="account-switcher__add"
              disabled={busy}
              onClick={() => {
                setOpen(false);
                onAddAccount();
              }}
            >
              {busy ? <IconSpinner size={16} aria-hidden /> : "+ Add account"}
            </button>
          </footer>
        ) : null}
      </div>
    </div>
  ) : null;

  return (
    <div className="account-switcher" ref={rootRef}>
      <button
        type="button"
        className="account-switcher__trigger"
        onClick={() => setOpen((value) => !value)}
        aria-expanded={open}
        aria-haspopup="dialog"
        disabled={busy && !open}
      >
        <span className="account-switcher__avatar" aria-hidden>
          {(active.derivationIndex ?? 0) + 1}
        </span>
        <span className="account-switcher__label">
          <span className="account-switcher__name">{active.name}</span>
        </span>
        {busy ? (
          <IconSpinner size={14} className="account-switcher__chevron" aria-hidden />
        ) : (
          <IconChevronDown size={14} className="account-switcher__chevron" />
        )}
      </button>

      {overlay && getPortalRoot() ? createPortal(overlay, getPortalRoot()!) : null}
    </div>
  );
}
