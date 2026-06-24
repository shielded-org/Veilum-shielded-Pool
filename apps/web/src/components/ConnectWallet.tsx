import { useCallback, useEffect, useState } from "react";

import { applyNotesPreview } from "../lib/apply-notes-refresh";
import { loadNetworkConfig } from "../lib/config";
import { viewingPrivToPub } from "../lib/keys";
import { fetchRelayerHealth } from "../lib/relayer";
import { applyRefreshResult, BACKGROUND_POLL_MS } from "../lib/sync-shielded-now";
import { pickRefreshMode, scanCacheKey } from "../lib/scan-cache";
import { scanDebug, scanDebugWarn } from "../lib/scan-debug";
import { refreshShieldedWallet, type WalletRefreshMode } from "../lib/wallet-sync";
import { beginWalletSync, endWalletSync, invalidateWalletSync } from "../lib/wallet-sync-coordinator";
import { useWalletConnection } from "../hooks/use-wallet-connection";
import { formatWalletError } from "../lib/wallet-kit";
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

export function useShieldedSync() {
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

      const handle = beginWalletSync({ background: opts.background });
      if (!handle) {
        scanDebug("sync:skippedInFlight", { background: opts.background ?? false });
        return;
      }

      const background = opts.background ?? false;

      scanDebug("sync:start", {
        mode: opts.mode ?? "auto",
        background,
        generation: handle.generation,
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
        const mode = opts.mode ?? pickRefreshMode(priorCache, {
          hasNotes: metadataNotes.length > 0,
          hasUnspentNotes: metadataNotes.some((n) => !n.spent),
          deployLedger,
        });

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
            if (!handle.isCurrent()) return;
            applyNotesPreview(mode, notes, balance);
            setScanLoading(false);
          },
        });
        if (!handle.isCurrent()) return;
        applyRefreshResult(result, cacheKey);
        scanDebug("sync:complete", {
          mode: result.mode,
          noteCount: result.notes.length,
          noteScanComplete: result.noteScanComplete,
          balance: result.shieldedBalance.toString(),
          routeEventsScanned: result.routeEventsScanned,
          scanStartLedger: result.scanStartLedger,
          lastScannedLedger: result.lastScannedLedger,
          warnings: result.warnings,
        });
      } catch (e) {
        if (!handle.isCurrent()) return;
        const msg = formatWalletError(e);
        scanDebugWarn("sync:error", { error: msg });
        setSyncError(msg);
      } finally {
        endWalletSync(handle.generation);
        if (handle.isCurrent()) {
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
      invalidateWalletSync();
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

export { syncShieldedWalletNow } from "../lib/sync-shielded-now";
