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
    <div className="wallet-connect">
      {showSyncKeys && onSyncKeys && (
        <button type="button" className="btn btn-primary btn-sm" onClick={onSyncKeys} disabled={busy}>
          Sync keys
        </button>
      )}
      <button type="button" className="wallet-connect__connected" onClick={onDisconnect} disabled={busy}>
        <span className="wallet-connect__dot" aria-hidden />
        <span className="wallet-connect__addr">{shortenAddress(address, 4)}</span>
        <IconChevronDown />
      </button>
    </div>
  );
}
