import { useEffect, useRef, useState } from "react";

import { fetchRelayerHealth } from "../lib/relayer";
import {
  BACKGROUND_POLL_MS,
  VISIBLE_POLL_MS,
  invalidateShieldedSync,
  syncShieldedWalletNow,
} from "../lib/sync-shielded-now";
import { useShieldedStore } from "../store/use-shielded-store";

/**
 * Background indexer/RPC scan loop — mirrors web `useShieldedSync`.
 * While the popup is open: immediate tail scan on open, then 12s / 30s incremental polls.
 * Incoming private transfers are recorded via `recordIncomingTransferActivity` on each apply.
 */
export function useShieldedSync(wallet: string | null) {
  const [hydrated, setHydrated] = useState(() => useShieldedStore.persist.hasHydrated());
  const identityRef = useRef<string | null>(null);

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
      setSyncError("Wallet address changed — unlock again to sync keys for this account.");
      return;
    }

    const identity = `${wallet}:${viewingPub}:${viewingKey}:${spendingKey}`;
    if (identityRef.current && identityRef.current !== identity) {
      invalidateShieldedSync();
    }
    identityRef.current = identity;

    // Popup open ≈ tab focus — bust indexer cache for fresh incoming transfers.
    void syncShieldedWalletNow({ initial: true, bustIndexerCache: true });

    const poll = window.setInterval(() => {
      void syncShieldedWalletNow({ background: true });
    }, BACKGROUND_POLL_MS);

    const visiblePoll = window.setInterval(() => {
      void syncShieldedWalletNow({ background: true });
    }, VISIBLE_POLL_MS);

    return () => {
      window.clearInterval(poll);
      window.clearInterval(visiblePoll);
    };
  }, [hydrated, wallet, viewingPub, viewingKey, spendingKey, keyMaterialAddress, setSyncError]);
}
