import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { useAtom, useSetAtom } from "jotai";
import { useLocation, useNavigate } from "react-router-dom";

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
import {
  marketingBrowseAtom,
  pendingDashboardRedirectAtom,
} from "../store/session-atoms";
import { useShieldedStore } from "../store/use-shielded-store";
import { useWallet } from "./use-wallet";

type SignKeysOptions = {
  fromLanding?: boolean;
};

type WalletConnectionValue = {
  wallet: string | null;
  busy: boolean;
  error: string | null;
  hasShieldKeys: boolean;
  needsKeySign: boolean;
  keySignOpen: boolean;
  connectWallet: () => Promise<void>;
  signKeys: (options?: SignKeysOptions) => Promise<void>;
  /** Full connect + sign — used on dashboard for sync / legacy one-shot. */
  connect: () => Promise<void>;
  openKeySign: () => void;
  dismissKeySign: () => void;
  disconnect: () => void;
  showSyncKeys: boolean;
  markLeftDashboardForMarketing: () => void;
  clearPendingRedirect: () => void;
};

const WalletConnectionContext = createContext<WalletConnectionValue | null>(null);

function useHasShieldKeys(wallet: string | null) {
  const viewingKey = useShieldedStore((s) => s.viewingKey);
  const spendingKey = useShieldedStore((s) => s.spendingKey);
  const viewingPub = useShieldedStore((s) => s.viewingPub);
  const keyMaterialAddress = useShieldedStore((s) => s.keyMaterialAddress);

  return useMemo(
    () =>
      !!(
        wallet &&
        viewingKey &&
        spendingKey &&
        viewingPub &&
        keyMaterialAddress === wallet
      ),
    [wallet, viewingKey, spendingKey, viewingPub, keyMaterialAddress]
  );
}

export function WalletConnectionProvider({ children }: { children: ReactNode }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [keySignOpen, setKeySignOpen] = useState(false);
  const [keySignDismissed, setKeySignDismissed] = useState(false);

  const { address: wallet, connect: setWallet, disconnect } = useWallet();
  const navigate = useNavigate();
  const location = useLocation();

  const network = useShieldedStore((s) => s.network);
  const setKeys = useShieldedStore((s) => s.setKeys);
  const keyMaterialAddress = useShieldedStore((s) => s.keyMaterialAddress);
  const resetWalletSession = useShieldedStore((s) => s.resetWalletSession);

  const [marketingBrowse, setMarketingBrowse] = useAtom(marketingBrowseAtom);
  const setPendingDashboardRedirect = useSetAtom(pendingDashboardRedirectAtom);

  const hasShieldKeys = useHasShieldKeys(wallet);
  const needsKeySign = !!(wallet && !hasShieldKeys);

  const deriveKeysForWallet = useCallback(
    async (address: string) => {
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
      await grantMobileWalletSigningSession(address);
    },
    [setKeys]
  );

  const connectWalletOnly = useCallback(async () => {
    setBusy(true);
    setError(null);
    try {
      initWalletKit(network);
      const config = await loadNetworkConfig(network);
      const address = await connectWallet();
      await ensureWalletNetwork(config);
      setWallet(address);
      setKeySignDismissed(false);

      const keysReady =
        keyMaterialAddress === address &&
        useShieldedStore.getState().viewingKey &&
        useShieldedStore.getState().spendingKey &&
        useShieldedStore.getState().viewingPub;

      if (!keysReady) {
        setKeySignOpen(true);
      }
    } catch (e) {
      setError(formatWalletError(e));
    } finally {
      setBusy(false);
    }
  }, [network, keyMaterialAddress, setWallet]);

  const signKeys = useCallback(
    async (options?: SignKeysOptions) => {
      if (!wallet) {
        setError("Connect a wallet first.");
        return;
      }
      setBusy(true);
      setError(null);
      try {
        initWalletKit(network);
        const config = await loadNetworkConfig(network);
        await ensureWalletNetwork(config);
        await deriveKeysForWallet(wallet);
        setKeySignOpen(false);
        setKeySignDismissed(false);

        if (options?.fromLanding) {
          setMarketingBrowse(false);
          setPendingDashboardRedirect(true);
        }
      } catch (e) {
        setError(formatWalletError(e));
        setKeySignOpen(true);
      } finally {
        setBusy(false);
      }
    },
    [wallet, network, deriveKeysForWallet, setMarketingBrowse, setPendingDashboardRedirect]
  );

  const connect = useCallback(async () => {
    setBusy(true);
    setError(null);
    try {
      initWalletKit(network);
      const config = await loadNetworkConfig(network);
      const address = await connectWallet();
      await ensureWalletNetwork(config);
      setWallet(address);
      setKeySignDismissed(false);

      if (keyMaterialAddress !== address || !useShieldedStore.getState().viewingKey) {
        await deriveKeysForWallet(address);
        setKeySignOpen(false);
      }
    } catch (e) {
      setError(formatWalletError(e));
    } finally {
      setBusy(false);
    }
  }, [network, keyMaterialAddress, setWallet, deriveKeysForWallet]);

  const openKeySign = useCallback(() => {
    setError(null);
    setKeySignDismissed(false);
    setKeySignOpen(true);
  }, []);

  const dismissKeySign = useCallback(() => {
    setKeySignOpen(false);
    setKeySignDismissed(true);
    setError(null);
  }, []);

  const disconnectSession = useCallback(() => {
    void disconnectWalletKit();
    disconnect();
    resetWalletSession();
    setError(null);
    setKeySignOpen(false);
    setKeySignDismissed(false);
    setPendingDashboardRedirect(false);
    setMarketingBrowse(false);

    if (location.pathname.startsWith("/dashboard")) {
      navigate("/", { replace: true });
    }
  }, [
    disconnect,
    resetWalletSession,
    location.pathname,
    navigate,
    setPendingDashboardRedirect,
    setMarketingBrowse,
  ]);

  const markLeftDashboardForMarketing = useCallback(() => {
    setMarketingBrowse(true);
    setPendingDashboardRedirect(false);
  }, [setMarketingBrowse, setPendingDashboardRedirect]);

  const clearPendingRedirect = useCallback(() => {
    setPendingDashboardRedirect(false);
  }, [setPendingDashboardRedirect]);

  const showSyncKeys = !!(keyMaterialAddress && wallet && wallet !== keyMaterialAddress);

  return (
    <WalletConnectionContext.Provider
      value={{
        wallet,
        busy,
        error,
        hasShieldKeys,
        needsKeySign,
        keySignOpen,
        connectWallet: connectWalletOnly,
        signKeys,
        connect,
        openKeySign,
        dismissKeySign,
        disconnect: disconnectSession,
        showSyncKeys,
        markLeftDashboardForMarketing,
        clearPendingRedirect,
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
