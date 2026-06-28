import { useEffect, useRef, useState } from "react";

import { fetchRelayerHealth } from "../lib/relayer";
import {
  BACKGROUND_POLL_MS,
  VISIBLE_POLL_MS,
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
    <div className="connect-wallet-root" style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
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

/** Sync loop: indexer scan + session cache + incremental refresh on warm cache. */
export function useShieldedSync() {
  const [hydrated, setHydrated] = useState(() => useShieldedStore.persist.hasHydrated());
  const identityRef = useRef<string | null>(null);
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

    const identity = `${wallet}:${viewingPub}:${viewingKey}:${spendingKey}`;
    if (identityRef.current && identityRef.current !== identity) {
      invalidateShieldedSync();
    }
    identityRef.current = identity;

    scanDebug("sync:mount", { walletPrefix: `${wallet.slice(0, 8)}…` });
    void syncShieldedWalletNow({ initial: true });

    const poll = window.setInterval(() => {
      void syncShieldedWalletNow({ background: true });
    }, BACKGROUND_POLL_MS);

    let visiblePoll: ReturnType<typeof window.setInterval> | undefined;
    const startVisiblePoll = () => {
      if (visiblePoll != null) return;
      visiblePoll = window.setInterval(() => {
        if (document.visibilityState === "visible") {
          void syncShieldedWalletNow({ background: true });
        }
      }, VISIBLE_POLL_MS);
    };
    const stopVisiblePoll = () => {
      if (visiblePoll != null) {
        window.clearInterval(visiblePoll);
        visiblePoll = undefined;
      }
    };

    const onResume = () => {
      void syncShieldedWalletNow({ background: true, bustIndexerCache: true });
    };

    const onVisible = () => {
      if (document.visibilityState === "visible") {
        onResume();
        startVisiblePoll();
      } else {
        stopVisiblePoll();
      }
    };
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("focus", onResume);
    if (document.visibilityState === "visible") {
      startVisiblePoll();
    }

    return () => {
      window.clearInterval(poll);
      stopVisiblePoll();
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("focus", onResume);
    };
  }, [hydrated, wallet, viewingPub, viewingKey, spendingKey, keyMaterialAddress, setSyncError]);
}

export { syncShieldedWalletNow } from "../lib/sync-shielded-now";
