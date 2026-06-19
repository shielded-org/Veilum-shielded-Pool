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
import { scanDebug, scanDebugWarn } from "../lib/scan-debug";
import { mergeNotes, shieldedTotal } from "../lib/note-store";
import { useWallet } from "../hooks/use-wallet";
import { useShieldedStore } from "../store/use-shielded-store";
import { walletAddressAtom } from "../store/wallet-atoms";

function applyRefreshResult(
  result: Awaited<ReturnType<typeof refreshShieldedWallet>>,
  cacheKey?: string
) {
  const state = useShieldedStore.getState();
  if (result.mode === "full") {
    state.setNotes(result.notes);
    state.setShieldedBalance(result.shieldedBalance);
  } else if (result.notes.length > 0) {
    const merged = mergeNotes(state.notes, result.notes);
    state.setNotes(merged);
    state.setShieldedBalance(shieldedTotal(merged));
  }
  state.setMerkleLeaves(result.merkleLeaves);
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

  const runRefresh = useCallback(
    async (opts: { mode?: WalletRefreshMode; background?: boolean }) => {
      if (!wallet || !viewingPub || !viewingKey || !spendingKey) {
        scanDebug("sync:skippedMissingKeys", {
          wallet: Boolean(wallet),
          viewingPub: Boolean(viewingPub),
          viewingKey: Boolean(viewingKey),
          spendingKey: Boolean(spendingKey),
        });
        return;
      }
      if (keyMaterialAddress && wallet !== keyMaterialAddress) {
        scanDebugWarn("sync:skippedWalletMismatch", {
          walletPrefix: `${wallet.slice(0, 8)}…`,
          keyMaterialPrefix: `${keyMaterialAddress.slice(0, 8)}…`,
        });
        return;
      }
      if (opts.background && syncInFlight.current) {
        scanDebug("sync:skippedInFlight", { background: true });
        return;
      }

      syncInFlight.current = true;
      const generation = ++syncGen.current;
      const background = opts.background ?? false;

      scanDebug("sync:start", {
        mode: opts.mode ?? "auto",
        background,
        generation,
        walletPrefix: `${wallet.slice(0, 8)}…`,
        viewingPubPrefix: `${viewingPub.slice(0, 10)}…`,
      });

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
        const deployLedger = config.contracts.deployLedger;
        const cacheKey = scanCacheKey(network, poolId, viewingPub, deployLedger);
        const priorCache = useShieldedStore.getState().getScanCacheEntry(cacheKey);
        const metadataNotes = useShieldedStore.getState().notes;
        const mode = opts.mode ?? pickRefreshMode(priorCache, { hasNotes: metadataNotes.length > 0, deployLedger });

        const derivedPub = viewingPrivToPub(BigInt(viewingKey));
        scanDebug("sync:keyConsistency", {
          walletEqualsKeyMaterial: wallet === keyMaterialAddress,
          viewingKeyRecomputesToPub: derivedPub.toLowerCase() === viewingPub.toLowerCase(),
          deployLedger: deployLedger ?? null,
          cacheKey,
          priorCacheLedger: priorCache?.lastScannedLedger ?? null,
        });

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
            if (mode === "full") {
              state.setNotes(notes);
              state.setShieldedBalance(balance);
            } else if (notes.length > 0) {
              const merged = mergeNotes(state.notes, notes);
              state.setNotes(merged);
              state.setShieldedBalance(shieldedTotal(merged));
            }
            setScanLoading(false);
          },
        });
        if (generation !== syncGen.current) return;
        applyRefreshResult(result, cacheKey);
        scanDebug("sync:complete", {
          mode: result.mode,
          noteCount: result.notes.length,
          balance: result.shieldedBalance.toString(),
          routeEventsScanned: result.routeEventsScanned,
          scanStartLedger: result.scanStartLedger,
          lastScannedLedger: result.lastScannedLedger,
          warnings: result.warnings,
        });
      } catch (e) {
        if (generation !== syncGen.current) return;
        const msg = e instanceof Error ? e.message : String(e);
        scanDebugWarn("sync:error", { error: msg });
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
    if (!hydrated) {
      scanDebug("sync:waitingHydration", {});
      return;
    }
    if (!wallet || !viewingPub || !viewingKey || !spendingKey) {
      scanDebug("sync:effectSkipped", {
        hydrated,
        wallet: Boolean(wallet),
        viewingPub: Boolean(viewingPub),
        viewingKey: Boolean(viewingKey),
        spendingKey: Boolean(spendingKey),
      });
      return;
    }
    if (keyMaterialAddress && wallet !== keyMaterialAddress) {
      setSyncError("Wallet address changed — click Sync keys to re-derive shield keys for this account.");
      return;
    }

    scanDebug("sync:mountFullScan", { walletPrefix: `${wallet.slice(0, 8)}…` });
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
    const deployLedger = config.contracts.deployLedger;
    const cacheKey = scanCacheKey(state.network, poolId, state.viewingPub, deployLedger);
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
      mode: options?.mode ?? pickRefreshMode(priorCache, { hasNotes: state.notes.length > 0, deployLedger }),
      syncMerkle: options?.syncMerkle ?? false,
      onNotesReady: (notes, balance) => {
        const syncMode = options?.mode ?? "incremental";
        if (syncMode === "full") {
          state.setNotes(notes);
          state.setShieldedBalance(balance);
        } else if (notes.length > 0) {
          const merged = mergeNotes(state.notes, notes);
          state.setNotes(merged);
          state.setShieldedBalance(shieldedTotal(merged));
        }
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
