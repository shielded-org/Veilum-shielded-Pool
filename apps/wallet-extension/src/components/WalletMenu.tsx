import type { ReactNode } from "react";

import type { WalletBalanceMode } from "./WalletModeToggle";
import { Button } from "./ui/Button";
import {
  IconArrowRightCircle,
  IconDroplet,
  IconDownloadCloud,
  IconHome,
  IconKey,
  IconList,
  IconLock,
  IconMenu,
  IconMoon,
  IconSun,
  IconUploadCloud,
  IconX,
} from "./ui/icons";
import type { Tab } from "./Chrome";

type MenuItem = {
  id: Tab;
  label: string;
  description?: string;
  icon: ReactNode;
};

const NAV_ITEMS: MenuItem[] = [
  { id: "home", label: "Home", description: "Balances & portfolio", icon: <IconHome size={18} /> },
  { id: "shield", label: "Shield", description: "Deposit to private balance", icon: <IconUploadCloud size={18} /> },
  { id: "send", label: "Send", description: "Private send or withdraw", icon: <IconArrowRightCircle size={18} /> },
  { id: "receive", label: "Receive", description: "Your addresses", icon: <IconDownloadCloud size={18} /> },
  { id: "activity", label: "Activity", description: "Recent transactions", icon: <IconList size={18} /> },
  { id: "keys", label: "Keys & backup", description: "Addresses and recovery", icon: <IconKey size={18} /> },
  { id: "faucet", label: "Testnet faucet", description: "Mint test stablecoins", icon: <IconDroplet size={18} /> },
];

type WalletMenuProps = {
  open: boolean;
  tab: Tab;
  balanceMode: WalletBalanceMode;
  onOpen: () => void;
  onClose: () => void;
  onNavigate: (tab: Tab) => void;
  onBalanceModeChange: (mode: WalletBalanceMode) => void;
  onLockRequest: () => void;
};

export function WalletMenuButton({ onClick }: { onClick: () => void }) {
  return (
    <button
      type="button"
      className="wallet-menu-trigger"
      onClick={onClick}
      aria-label="Open menu"
      aria-haspopup="dialog"
    >
      <IconMenu size={20} />
    </button>
  );
}

export function WalletMenu({
  open,
  tab,
  balanceMode,
  onOpen,
  onClose,
  onNavigate,
  onBalanceModeChange,
  onLockRequest,
}: WalletMenuProps) {
  const nextMode: WalletBalanceMode = balanceMode === "private" ? "public" : "private";

  return (
    <>
      <WalletMenuButton onClick={onOpen} />
      {open ? (
        <div className="wallet-menu" role="dialog" aria-modal="true" aria-label="Wallet menu">
          <button type="button" className="wallet-menu__backdrop" onClick={onClose} aria-label="Close menu" />
          <div className="wallet-menu__panel">
            <div className="wallet-menu__header">
              <strong>Menu</strong>
              <button type="button" className="wallet-menu__close" onClick={onClose} aria-label="Close">
                <IconX size={18} />
              </button>
            </div>

            <div className="wallet-menu__mode">
              <button
                type="button"
                className="wallet-menu__mode-switch"
                onClick={() => {
                  onBalanceModeChange(nextMode);
                  if (tab !== "home") onNavigate("home");
                  onClose();
                }}
              >
                <span className="wallet-menu__mode-icon" aria-hidden>
                  {balanceMode === "private" ? <IconSun size={18} /> : <IconMoon size={18} />}
                </span>
                <span className="wallet-menu__mode-label">
                  {nextMode === "public" ? "Switch to public mode" : "Switch to private mode"}
                </span>
              </button>
            </div>

            <nav className="wallet-menu__nav" aria-label="Wallet routes">
              {NAV_ITEMS.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  className={`wallet-menu__item${tab === item.id ? " wallet-menu__item--active" : ""}`}
                  onClick={() => {
                    onNavigate(item.id);
                    onClose();
                  }}
                  aria-current={tab === item.id ? "page" : undefined}
                >
                  <span className="wallet-menu__item-icon" aria-hidden>
                    {item.icon}
                  </span>
                  <span className="wallet-menu__item-text">
                    <span className="wallet-menu__item-label">{item.label}</span>
                    {item.description ? (
                      <span className="wallet-menu__item-desc">{item.description}</span>
                    ) : null}
                  </span>
                </button>
              ))}
            </nav>

            <div className="wallet-menu__footer">
              <Button
                variant="danger"
                fullWidth
                iconLeft={<IconLock size={16} />}
                onClick={() => {
                  onClose();
                  onLockRequest();
                }}
              >
                Lock wallet
              </Button>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
