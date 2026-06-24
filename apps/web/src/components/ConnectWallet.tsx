import { useEffect, useState } from "react";

import { fetchRelayerHealth } from "../lib/relayer";
import {
  BACKGROUND_POLL_MS,
  invalidateShieldedSync,
  syncShieldedWalletNow,
} from "../lib/sync-shielded-now";
import { scanDebug } from "../lib/scan-debug";
import { useWalletConnection } from "../hooks/use-wallet-connection";
import { useWallet } from "../hooks/use-wallet";
import { useShieldedStore } from "../store/use-shielded-store";
import { WalletConnectButton } from "./ui/WalletConnectButton";

export function ConnectWallet() {
  const { wallet, busy, error, connect, disconnect, showSyncKeys } = useWalletConnection();

  return (
    <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
      <WalletConnectButton
        address={wallet}
        busy={busy}
        onConnect={() => void connect()}
        onDisconnect={disconnect}
        onSyncKeys={() => void connect()}
        showSyncKeys={showSyncKeys}
      />
      {error && (
        <p className="badge err" style={{ marginTop: 8 }}>
          {error}
        </p>
      )}
    </div>
  );
}

/** One sync loop: initial full scan + periodic full re-scan. No incremental / no parallel paths. */
export function useShieldedSync() {
  const [hydrated, setHydrated] = useState(() => useShieldedStore.persist.hasHydrated());
  const { address: wallet } = useWallet();
  const viewingKey = useShieldedStore((s) => s.viewingKey);
  const viewingPub = useShieldedStore((s) => s.viewingPub);
  const spendingKey = useShieldedStore((s) => s.spendingKey);
  const keyMaterialAddress = useShieldedStore((s) => s.keyMaterialAddress);
  const setRelayerOk = useShieldedStore((s) => s.setRelayerOk);
  const setSyncError = useShieldedStore((s) => s.setSyncError);

  useEffect(() => {
    if (hydrated) return;
    return useShieldedStore.persist.onFinishHydration(() => setHydrated(true));
  }, [hydrated]);

  useEffect(() => {
    let cancelled = false;

    async function pollRelayerHealth() {
      for (let attempt = 0; attempt < 4; attempt += 1) {
        const h = await fetchRelayerHealth();
        if (cancelled) return;
        if (h.ok) {
          setRelayerOk(true);
          return;
        }
        if (attempt < 3) {
          await new Promise((r) => setTimeout(r, 1500 * (attempt + 1)));
        }
      }
      if (!cancelled) setRelayerOk(false);
    }

    void pollRelayerHealth();
    const interval = window.setInterval(() => void pollRelayerHealth(), 60_000);
    return () => {
      cancelled = true;
      window.clearInterval(interval);
    };
  }, [setRelayerOk]);

  useEffect(() => {
    if (!hydrated) return;
    if (!wallet || !viewingPub || !viewingKey || !spendingKey) return;
    if (keyMaterialAddress && wallet !== keyMaterialAddress) {
      setSyncError("Wallet address changed — click Sync keys to re-derive shield keys for this account.");
      return;
    }

    scanDebug("sync:mount", { walletPrefix: `${wallet.slice(0, 8)}…` });
    void syncShieldedWalletNow({ initial: true });

    const poll = window.setInterval(() => {
      void syncShieldedWalletNow({ background: true });
    }, BACKGROUND_POLL_MS);

    const onVisible = () => {
      if (document.visibilityState === "visible") {
        void syncShieldedWalletNow({ background: true });
      }
    };
    document.addEventListener("visibilitychange", onVisible);

    return () => {
      invalidateShieldedSync();
      window.clearInterval(poll);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [hydrated, wallet, viewingPub, viewingKey, spendingKey, keyMaterialAddress, setSyncError]);
}

export { syncShieldedWalletNow } from "../lib/sync-shielded-now";
