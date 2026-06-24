import { getDefaultStore } from "jotai";

import { applyNotesFinal, applyNotesPreview } from "./apply-notes-refresh";
import { loadNetworkConfig } from "./config";
import { BACKGROUND_POLL_MS, pickRefreshMode, scanCacheKey } from "./scan-cache";
import { refreshShieldedWallet, type WalletRefreshMode } from "./wallet-sync";
import { beginWalletSync, endWalletSync } from "./wallet-sync-coordinator";
import { useShieldedStore } from "../store/use-shielded-store";
import { walletAddressAtom } from "../store/wallet-atoms";

function applyRefreshResult(
  result: Awaited<ReturnType<typeof refreshShieldedWallet>>,
  cacheKey?: string
) {
  const state = useShieldedStore.getState();
  applyNotesFinal(result.mode, result.notes, result.shieldedBalance, result.noteScanComplete);
  state.setMerkleLeaves(result.merkleLeaves);
  state.setSyncWarnings(result.warnings);
  if (cacheKey) {
    state.setScanCacheEntry(cacheKey, result.scanCacheOut);
  }
}

export async function syncShieldedWalletNow(options?: {
  syncMerkle?: boolean;
  mode?: WalletRefreshMode;
  background?: boolean;
}): Promise<void> {
  const state = useShieldedStore.getState();
  const wallet = getDefaultStore().get(walletAddressAtom) ?? state.keyMaterialAddress;
  if (!wallet || !state.viewingPub || !state.viewingKey || !state.spendingKey) return;
  if (state.keyMaterialAddress && wallet !== state.keyMaterialAddress) return;

  const handle = beginWalletSync({ background: options?.background });
  if (!handle) return;

  state.setScanRefreshing(true);
  state.setSyncError(null);
  try {
    const config = await loadNetworkConfig(state.network);
    const poolId = config.contracts.shieldedPool;
    const deployLedger = config.contracts.deployLedger;
    const cacheKey = scanCacheKey(state.network, poolId, state.viewingPub, deployLedger);
    const priorCache = state.getScanCacheEntry(cacheKey);
    const mode =
      options?.mode ??
      pickRefreshMode(priorCache, {
        hasNotes: state.notes.length > 0,
        hasUnspentNotes: state.notes.some((n) => !n.spent),
        deployLedger,
      });
    const result = await refreshShieldedWallet({
      network: state.network,
      wallet,
      viewingKey: state.viewingKey,
      viewingPub: state.viewingPub,
      spendingKey: state.spendingKey,
      existingNotes: state.notes,
      priorScanCache: priorCache,
      routeCursor: state.routeCursor,
      mode,
      syncMerkle: options?.syncMerkle ?? false,
      onNotesReady: (notes, balance) => {
        if (!handle.isCurrent()) return;
        applyNotesPreview(mode, notes, balance);
        state.setScanLoading(false);
      },
    });
    if (!handle.isCurrent()) return;
    applyRefreshResult(result, cacheKey);
  } catch (e) {
    if (handle.isCurrent()) {
      state.setSyncError(e instanceof Error ? e.message : String(e));
    }
  } finally {
    endWalletSync(handle.generation);
    if (handle.isCurrent()) {
      state.setScanRefreshing(false);
      state.setScanLoading(false);
    }
  }
}

export { applyRefreshResult, BACKGROUND_POLL_MS };
