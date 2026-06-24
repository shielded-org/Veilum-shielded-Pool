import { createContext, useCallback, useContext, useState, type ReactNode } from "react";

import { loadNetworkConfig } from "../lib/config";
import { deriveOwnerPk, getBrowserPoseidonHasher } from "../lib/hasher";
import {
  deriveUserKeys,
  keySeedFromWalletSignature,
  SHIELD_KEY_DERIVATION_CONSENT_MESSAGE,
  viewingPrivToPub,
} from "../lib/keys";
import {
  connectWallet,
  disconnectWalletKit,
  ensureWalletNetwork,
  formatWalletError,
  grantMobileWalletSigningSession,
  initWalletKit,
  signWalletMessage,
} from "../lib/wallet-kit";
import { useWallet } from "./use-wallet";

type WalletConnectionValue = {
  wallet: string | null;
  busy: boolean;
  error: string | null;
  connect: () => Promise<void>;
  disconnect: () => void;
  showSyncKeys: boolean;
};

const WalletConnectionContext = createContext<WalletConnectionValue | null>(null);

export function WalletConnectionProvider({ children }: { children: ReactNode }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { address: wallet, connect: setWallet, disconnect } = useWallet();
  const network = useShieldedStore((s) => s.network);
  const setKeys = useShieldedStore((s) => s.setKeys);
  const keyMaterialAddress = useShieldedStore((s) => s.keyMaterialAddress);
  const resetWalletSession = useShieldedStore((s) => s.resetWalletSession);

  const connect = useCallback(async () => {
    setBusy(true);
    setError(null);
    try {
      initWalletKit(network);
      const config = await loadNetworkConfig(network);
      const address = await connectWallet();
      await ensureWalletNetwork(config);
      setWallet(address);

      if (keyMaterialAddress !== address) {
        const signature = await signWalletMessage(SHIELD_KEY_DERIVATION_CONSENT_MESSAGE, address);
        const seed = await keySeedFromWalletSignature(address, signature);
        const keys = await deriveUserKeys(seed, "owner");
        const hasher = await getBrowserPoseidonHasher();
        const ownerPk = await deriveOwnerPk(hasher, keys.spendingKey);
        const viewingPub = viewingPrivToPub(keys.viewingPriv);
        setKeys({
          spendingKey: keys.spendingKey,
          viewingPriv: keys.viewingPriv,
          viewingPub,
          ownerPk,
          address,
        });
        // useShieldedSync (DashboardLayout) runs the initial full scan — avoid parallel refresh races.
      }

      await grantMobileWalletSigningSession(address);
    } catch (e) {
      setError(formatWalletError(e));
    } finally {
      setBusy(false);
    }
  }, [network, keyMaterialAddress, setKeys, setWallet]);

  const disconnectSession = useCallback(() => {
    void disconnectWalletKit();
    disconnect();
    resetWalletSession();
    setError(null);
  }, [disconnect, resetWalletSession]);

  const showSyncKeys = !!(keyMaterialAddress && wallet && wallet !== keyMaterialAddress);

  return (
    <WalletConnectionContext.Provider
      value={{
        wallet,
        busy,
        error,
        connect,
        disconnect: disconnectSession,
        showSyncKeys,
      }}
    >
      {children}
    </WalletConnectionContext.Provider>
  );
}

export function useWalletConnection(): WalletConnectionValue {
  const ctx = useContext(WalletConnectionContext);
  if (!ctx) {
    throw new Error("useWalletConnection must be used within WalletConnectionProvider");
  }
  return ctx;
}
