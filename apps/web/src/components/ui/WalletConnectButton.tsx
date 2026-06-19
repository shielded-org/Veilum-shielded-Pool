import { useEffect, useId, useRef, useState } from "react";

import { IconChevronDown, IconSpinner } from "./icons";
import { shortenAddress } from "../../lib/utils";

type WalletConnectButtonProps = {
  address: string | null;
  busy: boolean;
  onConnect: () => void;
  onDisconnect: () => void;
  onSyncKeys?: () => void;
  showSyncKeys?: boolean;
};

export function WalletConnectButton({
  address,
  busy,
  onConnect,
  onDisconnect,
  onSyncKeys,
  showSyncKeys,
}: WalletConnectButtonProps) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const menuId = useId();

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (e: PointerEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  useEffect(() => {
    if (!address) setOpen(false);
  }, [address]);

  if (!address) {
    return (
      <button type="button" className="btn btn-primary btn-sm" onClick={onConnect} disabled={busy}>
        {busy ? (
          <>
            <IconSpinner size={14} /> Connecting…
          </>
        ) : (
          "Connect Wallet"
        )}
      </button>
    );
  }

  return (
    <div className={`wallet-connect${open ? " wallet-connect--open" : ""}`} ref={rootRef}>
      {showSyncKeys && onSyncKeys && (
        <button type="button" className="btn btn-primary btn-sm" onClick={onSyncKeys} disabled={busy}>
          Sync keys
        </button>
      )}
      <div className="wallet-connect__menu-wrap">
        <button
          type="button"
          className="wallet-connect__connected"
          onClick={() => setOpen((v) => !v)}
          disabled={busy}
          aria-expanded={open}
          aria-haspopup="menu"
          aria-controls={menuId}
        >
          <span className="wallet-connect__dot" aria-hidden />
          <span className="wallet-connect__addr">{shortenAddress(address, 4)}</span>
          <IconChevronDown className="wallet-connect__chevron" />
        </button>
        {open ? (
          <div id={menuId} className="wallet-connect__menu" role="menu">
            <div className="wallet-connect__menu-addr" title={address}>
              {shortenAddress(address, 6)}
            </div>
            <button
              type="button"
              className="wallet-connect__menu-item wallet-connect__menu-item--danger"
              role="menuitem"
              onClick={() => {
                setOpen(false);
                onDisconnect();
              }}
            >
              Disconnect
            </button>
          </div>
        ) : null}
      </div>
    </div>
  );
}
