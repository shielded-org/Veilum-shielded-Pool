import { getDefaultStore } from "jotai";

import { loadNetworkConfig } from "./config";
import { scanCacheKey } from "./scan-cache";
import { scanDebug, scanDebugWarn } from "./scan-debug";
import { formatWalletError } from "./wallet-kit";
import { refreshShieldedWallet } from "./wallet-sync";
import { useShieldedStore } from "../store/use-shielded-store";
import { walletAddressAtom } from "../store/wallet-atoms";

/** Poll interval for background re-scan (always full chain scan). */
export const BACKGROUND_POLL_MS = 60_000;

let syncRunning = false;
let rerunWhenDone = false;
/** Bumped on wallet/key change or effect cleanup — stale scans must not apply. */
let applyGeneration = 0;

function bumpApplyGeneration(): void {
  applyGeneration += 1;
}

/**
 * Single wallet sync entry point. Always runs one full on-chain note scan.
 * Concurrent calls coalesce into a single follow-up scan after the current one.
 */
export async function syncShieldedWalletNow(options?: {
  syncMerkle?: boolean;
  /** First load — show loading UI when notes are empty. */
  initial?: boolean;
  /** Background refresh — show subtle spinner only. */
  background?: boolean;
}): Promise<void> {
  if (syncRunning) {
    rerunWhenDone = true;
    scanDebug("sync:coalesced", {});
    return;
  }

  syncRunning = true;
  const applyGen = applyGeneration;

  try {
    do {
      rerunWhenDone = false;
      await runFullScan(options ?? {}, applyGen);
    } while (rerunWhenDone && applyGen === applyGeneration);
  } finally {
    syncRunning = false;
  }
}

async function runFullScan(
  options: { syncMerkle?: boolean; initial?: boolean; background?: boolean },
  applyGen: number
): Promise<void> {
  const state = useShieldedStore.getState();
  const wallet = getDefaultStore().get(walletAddressAtom) ?? state.keyMaterialAddress;
  if (!wallet || !state.viewingPub || !state.viewingKey || !state.spendingKey) return;
  if (state.keyMaterialAddress && wallet !== state.keyMaterialAddress) return;

  const background = options.background ?? false;
  const initial = options.initial ?? false;

  scanDebug("sync:start", {
    initial,
    background,
    applyGen,
    storeNotes: state.notes.length,
    walletPrefix: `${wallet.slice(0, 8)}…`,
  });

  if (background) {
    state.setScanRefreshing(true);
  } else if (initial) {
    state.setSyncError(null);
    if (state.notes.length === 0) state.setScanLoading(true);
  }

  try {
    const config = await loadNetworkConfig(state.network);
    const poolId = config.contracts.shieldedPool;
    const deployLedger = config.contracts.deployLedger;
    const cacheKey = scanCacheKey(state.network, poolId, state.viewingPub, deployLedger);
    const priorCache = state.getScanCacheEntry(cacheKey);
    const metadataNotes = state.notes;

    const result = await refreshShieldedWallet({
      network: state.network,
      wallet,
      viewingKey: state.viewingKey,
      viewingPub: state.viewingPub,
      spendingKey: state.spendingKey,
      existingNotes: metadataNotes,
      priorScanCache: priorCache,
      routeCursor: state.routeCursor,
      syncMerkle: options.syncMerkle ?? false,
    });

    if (applyGen !== applyGeneration) {
      scanDebug("sync:stale", { applyGen, current: applyGeneration });
      return;
    }

    if (result.noteScanComplete) {
      const prev = state.notes.length;
      if (result.notes.length > 0 || prev === 0) {
        state.setNotes(result.notes);
      }
      scanDebug("sync:applied", {
        prev,
        next: result.notes.length,
        storeAfter: useShieldedStore.getState().notes.length,
        channelMatched: result.channelMatched,
        routeEventsScanned: result.routeEventsScanned,
      });
      state.setSyncWarnings(result.warnings);
    } else {
      scanDebugWarn("sync:skippedApply", {
        warnings: result.warnings,
        routeEventsScanned: result.routeEventsScanned,
      });
      if (!background || state.notes.length === 0) {
        state.setSyncWarnings(result.warnings);
      }
    }

    state.setMerkleLeaves(result.merkleLeaves);
    state.setScanCacheEntry(cacheKey, result.scanCacheOut);
  } catch (e) {
    if (applyGen === applyGeneration) {
      state.setSyncError(formatWalletError(e));
      scanDebugWarn("sync:error", { error: formatWalletError(e) });
    }
  } finally {
    if (applyGen === applyGeneration) {
      state.setScanLoading(false);
      state.setScanRefreshing(false);
    }
  }
}

/** Invalidate in-flight scan apply (e.g. wallet disconnect or key change). */
export function invalidateShieldedSync(): void {
  bumpApplyGeneration();
}

export { bumpApplyGeneration };
