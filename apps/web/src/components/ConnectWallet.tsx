import { useCallback, useEffect, useRef, useState } from "react";
import { getDefaultStore } from "jotai";

import { WalletConnectButton } from "./ui/WalletConnectButton";
import { loadNetworkConfig } from "../lib/config";
import { deriveOwnerPk, getBrowserPoseidonHasher } from "../lib/hasher";
import {
  deriveUserKeys,
  keySeedFromWalletSignature,
  SHIELD_KEY_DERIVATION_CONSENT_MESSAGE,
  viewingPrivToPub,
} from "../lib/keys";
import { fetchRelayerHealth } from "../lib/relayer";
import {
  connectWallet,
  disconnectWalletKit,
  ensureWalletNetwork,
  initWalletKit,
  signWalletMessage,
} from "../lib/wallet-kit";
import { refreshShieldedWallet, type WalletRefreshMode } from "../lib/wallet-sync";
import { BACKGROUND_POLL_MS, pickRefreshMode, scanCacheKey } from "../lib/scan-cache";
import { useWallet } from "../hooks/use-wallet";
import { useShieldedStore } from "../store/use-shielded-store";
import { walletAddressAtom } from "../store/wallet-atoms";

function applyRefreshResult(
  result: Awaited<ReturnType<typeof refreshShieldedWallet>>,
  cacheKey?: string
) {
  const state = useShieldedStore.getState();
  state.setNotes(result.notes);
  state.setMerkleLeaves(result.merkleLeaves);
  state.setShieldedBalance(result.shieldedBalance);
  state.setSyncWarnings(result.warnings);
  state.setSyncError(result.warnings.length ? result.warnings.join(" · ") : null);
  if (cacheKey) {
    state.setScanCacheEntry(cacheKey, result.scanCacheOut);
  }
}

export function ConnectWallet() {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { address: wallet, connect: setWallet, disconnect } = useWallet();
  const network = useShieldedStore((s) => s.network);
  const setKeys = useShieldedStore((s) => s.setKeys);
  const keyMaterialAddress = useShieldedStore((s) => s.keyMaterialAddress);
  const clearKeys = useShieldedStore((s) => s.clearKeys);

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
        await syncShieldedWalletNow({ mode: "full" });
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }, [network, keyMaterialAddress, setKeys, setWallet]);

  const handleDisconnect = useCallback(() => {
    void disconnectWalletKit();
    disconnect();
    clearKeys();
    useShieldedStore.getState().setSyncError(null);
    useShieldedStore.getState().setSyncWarnings([]);
  }, [disconnect, clearKeys]);

  const showSyncKeys = !!(keyMaterialAddress && wallet && wallet !== keyMaterialAddress);

  return (
    <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
      <WalletConnectButton
        address={wallet}
        busy={busy}
        onConnect={() => void connect()}
        onDisconnect={handleDisconnect}
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

export function useShieldedSync() {
  const syncGen = useRef(0);
  const syncInFlight = useRef(false);
  const [hydrated, setHydrated] = useState(() => useShieldedStore.persist.hasHydrated());
  const { address: wallet } = useWallet();
  const network = useShieldedStore((s) => s.network);
  const viewingKey = useShieldedStore((s) => s.viewingKey);
  const viewingPub = useShieldedStore((s) => s.viewingPub);
  const spendingKey = useShieldedStore((s) => s.spendingKey);
  const keyMaterialAddress = useShieldedStore((s) => s.keyMaterialAddress);
  const setScanLoading = useShieldedStore((s) => s.setScanLoading);
  const setScanRefreshing = useShieldedStore((s) => s.setScanRefreshing);
  const setRelayerOk = useShieldedStore((s) => s.setRelayerOk);
  const setSyncError = useShieldedStore((s) => s.setSyncError);
  const routeCursor = useShieldedStore((s) => s.routeCursor);

  useEffect(() => {
    if (hydrated) return;
    return useShieldedStore.persist.onFinishHydration(() => setHydrated(true));
  }, [hydrated]);

  useEffect(() => {
    void fetchRelayerHealth().then((h) => setRelayerOk(h.ok));
  }, [setRelayerOk]);

  const runRefresh = useCallback(
    async (opts: { mode?: WalletRefreshMode; background?: boolean }) => {
      if (!wallet || !viewingPub || !viewingKey || !spendingKey) return;
      if (keyMaterialAddress && wallet !== keyMaterialAddress) return;
      if (syncInFlight.current) return;

      syncInFlight.current = true;
      const generation = ++syncGen.current;
      const background = opts.background ?? false;

      if (background) {
        setScanRefreshing(true);
      } else {
        setSyncError(null);
        const hasNotes = useShieldedStore.getState().notes.length > 0;
        setScanLoading(!hasNotes);
      }

      try {
        const config = await loadNetworkConfig(network);
        const poolId = config.contracts.shieldedPool;
        const cacheKey = scanCacheKey(network, poolId, viewingPub);
        const priorCache = useShieldedStore.getState().getScanCacheEntry(cacheKey);
        const mode = opts.mode ?? pickRefreshMode(priorCache);
        const metadataNotes = useShieldedStore.getState().notes;

        const result = await refreshShieldedWallet({
          network,
          wallet,
          viewingKey,
          viewingPub,
          spendingKey,
          existingNotes: metadataNotes,
          priorScanCache: priorCache,
          routeCursor,
          mode,
          onNotesReady: (notes, balance) => {
            if (generation !== syncGen.current) return;
            const state = useShieldedStore.getState();
            state.setNotes(notes);
            state.setShieldedBalance(balance);
            setScanLoading(false);
          },
        });
        if (generation !== syncGen.current) return;
        applyRefreshResult(result, cacheKey);
      } catch (e) {
        if (generation !== syncGen.current) return;
        const msg = e instanceof Error ? e.message : String(e);
        setSyncError(msg);
      } finally {
        syncInFlight.current = false;
        if (generation === syncGen.current) {
          setScanLoading(false);
          setScanRefreshing(false);
        }
      }
    },
    [
      wallet,
      viewingPub,
      viewingKey,
      spendingKey,
      keyMaterialAddress,
      network,
      routeCursor,
      setScanLoading,
      setScanRefreshing,
      setSyncError,
    ]
  );

  useEffect(() => {
    if (!hydrated || !wallet || !viewingPub || !viewingKey || !spendingKey) return;
    if (keyMaterialAddress && wallet !== keyMaterialAddress) {
      setSyncError("Wallet address changed — click Sync keys to re-derive shield keys for this account.");
      return;
    }

    void runRefresh({ mode: "full" });

    const poll = window.setInterval(() => {
      void runRefresh({ mode: "incremental", background: true });
    }, BACKGROUND_POLL_MS);

    const onVisible = () => {
      if (document.visibilityState === "visible") {
        void runRefresh({ mode: "incremental", background: true });
      }
    };
    document.addEventListener("visibilitychange", onVisible);

    return () => {
      syncGen.current += 1;
      window.clearInterval(poll);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [
    hydrated,
    wallet,
    viewingPub,
    viewingKey,
    spendingKey,
    keyMaterialAddress,
    routeCursor,
    runRefresh,
    setSyncError,
  ]);
}

export async function syncShieldedWalletNow(options?: {
  syncMerkle?: boolean;
  mode?: WalletRefreshMode;
}): Promise<void> {
  const state = useShieldedStore.getState();
  const wallet = getDefaultStore().get(walletAddressAtom) ?? state.keyMaterialAddress;
  if (!wallet || !state.viewingPub || !state.viewingKey || !state.spendingKey) return;
  if (state.keyMaterialAddress && wallet !== state.keyMaterialAddress) return;

  state.setScanRefreshing(true);
  state.setSyncError(null);
  try {
    const config = await loadNetworkConfig(state.network);
    const poolId = config.contracts.shieldedPool;
    const cacheKey = scanCacheKey(state.network, poolId, state.viewingPub);
    const priorCache = state.getScanCacheEntry(cacheKey);
    const result = await refreshShieldedWallet({
      network: state.network,
      wallet,
      viewingKey: state.viewingKey,
      viewingPub: state.viewingPub,
      spendingKey: state.spendingKey,
      existingNotes: state.notes,
      priorScanCache: priorCache,
      routeCursor: state.routeCursor,
      mode: options?.mode ?? "incremental",
      syncMerkle: options?.syncMerkle ?? false,
      onNotesReady: (notes, balance) => {
        state.setNotes(notes);
        state.setShieldedBalance(balance);
        state.setScanLoading(false);
      },
    });
    applyRefreshResult(result, cacheKey);
  } catch (e) {
    state.setSyncError(e instanceof Error ? e.message : String(e));
  } finally {
    state.setScanRefreshing(false);
    state.setScanLoading(false);
  }
}
