import type { WalletBalanceMode } from "./WalletModeToggle";
import { AddressPill } from "./AddressPill";
import { NetworkBadge } from "./ui/NetworkBadge";
import type { NetworkName } from "../lib/types";

type WalletHeaderActionsProps = {
  network: NetworkName;
  balanceMode: WalletBalanceMode;
  publicAddress: string;
  shieldedAddress: string;
  keysReady: boolean;
};

export function WalletHeaderActions({
  network,
  balanceMode,
  publicAddress,
  shieldedAddress,
  keysReady,
}: WalletHeaderActionsProps) {
  const isPrivate = balanceMode === "private";
  const address = isPrivate ? shieldedAddress : publicAddress;
  const disabled = isPrivate && !keysReady;

  return (
    <div className="wallet-header__cluster">
      <NetworkBadge network={network} />
      <AddressPill address={address} disabled={disabled} />
    </div>
  );
}
