import { getDefaultStore } from "jotai";

import { loadNetworkConfig } from "./config";
import { mergeNotes, shieldedTotal } from "./note-store";
import { BACKGROUND_POLL_MS, pickRefreshMode, scanCacheKey } from "./scan-cache";
import { refreshShieldedWallet, type WalletRefreshMode } from "./wallet-sync";
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
  } else {
    const merged = mergeNotes(state.notes, result.notes);
    state.setNotes(merged);
    state.setShieldedBalance(shieldedTotal(merged));
  }
  state.setMerkleLeaves(result.merkleLeaves);
  state.setSyncWarnings(result.warnings);
  // syncError is for thrown failures only — warnings render as non-blocking banners
  if (cacheKey) {
    state.setScanCacheEntry(cacheKey, result.scanCacheOut);
  }
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
        } else {
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

export { applyRefreshResult, BACKGROUND_POLL_MS };
