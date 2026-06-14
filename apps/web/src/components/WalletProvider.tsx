import { useSetAtom } from "jotai";
import { useEffect, type ReactNode } from "react";

import { useShieldedStore } from "../store/use-shielded-store";
import { walletAddressAtom } from "../store/wallet-atoms";
import {
  getConnectedAddress,
  initWalletKit,
  onWalletKitDisconnect,
} from "../lib/wallet-kit";

/** Reconcile persisted wallet with the active wallet session on load. */
export function WalletProvider({ children }: { children: ReactNode }) {
  const setWallet = useSetAtom(walletAddressAtom);
  const network = useShieldedStore((s) => s.network);

  useEffect(() => {
    initWalletKit(network);
  }, [network]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const address = await getConnectedAddress();
        if (!cancelled && address) setWallet(address);
      } catch {
        /* wallet locked or unavailable — keep persisted address for display */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [setWallet]);

  useEffect(() => {
    return onWalletKitDisconnect(() => setWallet(null));
  }, [setWallet]);

  return children;
}
