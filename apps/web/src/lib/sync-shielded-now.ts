import { getDefaultStore } from "jotai";

import { loadNetworkConfig } from "./config";
import { serializeNotes } from "./note-persist";
import { dropPhantomNoteIds, mergeNotes, shieldedTotal } from "./note-store";
import { scanCacheKey, BACKGROUND_POLL_MS, VISIBLE_POLL_MS } from "./scan-cache";
import { scanDebug, scanDebugWarn } from "./scan-debug";
import { filterUserSyncWarnings } from "./sync-warnings";
import { recordIncomingTransferActivity } from "./incoming-activity";
import { formatWalletError } from "./wallet-kit";
import { withTimeout } from "./utils";
import { refreshNoteSpendStatus, refreshShieldedWallet } from "./wallet-sync";
import { useShieldedStore } from "../store/use-shielded-store";
import { walletAddressAtom } from "../store/wallet-atoms";

export { BACKGROUND_POLL_MS, VISIBLE_POLL_MS };

type SyncOptions = {
  syncMerkle?: boolean;
  awaitNullifiers?: boolean;
  initial?: boolean;
  background?: boolean;
  forceFullScan?: boolean;
  bustIndexerCache?: boolean;
  /** Retry until indexer/RPC scan completes (after shield/transfer/unshield). */
  postTx?: boolean;
  /** Note that must show spent before applying scan to live balance (transfer/unshield). */
  expectSpentNoteId?: string;
  /** Dashboard refresh button — prioritized incremental scan with timeout. */
  manualRefresh?: boolean;
};

const MANUAL_REFRESH_TIMEOUT_MS = 30_000;

let applyGeneration = 0;
let syncChain: Promise<void> = Promise.resolve();

function bumpApplyGeneration(): void {
  applyGeneration += 1;
}

/** Manual dashboard refresh — indexer/RPC incremental scan; UI loading is local to the button. */
export function refreshShieldBalanceNow(): Promise<void> {
  useShieldedStore.getState().setSyncError(null);
  return syncShieldedWalletNow({
    manualRefresh: true,
    bustIndexerCache: true,
    awaitNullifiers: true,
  });
}

export function syncShieldedWalletNow(options?: SyncOptions): Promise<void> {
  const run = async () => {
    const applyGen = applyGeneration;
    const attempts = options?.postTx ? 5 : 1;
    for (let attempt = 0; attempt < attempts; attempt += 1) {
      const verified = await runFullScan(options ?? {}, applyGen);
      if (verified || !options?.postTx) return;
      if (attempt < attempts - 1) {
        scanDebug("sync:postTxRetry", { attempt: attempt + 1 });
        await new Promise((r) => setTimeout(r, 1200));
      }
    }
  };

  if (options?.manualRefresh) {
    bumpApplyGeneration();
    syncChain = run().catch((e) => {
      scanDebugWarn("sync:chainError", { error: formatWalletError(e) });
    });
    return syncChain;
  }

  syncChain = syncChain.then(run).catch((e) => {
    scanDebugWarn("sync:chainError", { error: formatWalletError(e) });
  });
  return syncChain;
}

export type BalanceSyncAfterTxOptions = {
  onStatus?: (message: string) => void;
  /** Note expected to show as spent after transfer/unshield. */
  expectSpentNoteId?: string;
  syncMerkle?: boolean;
  maxAttempts?: number;
};

function balanceSyncStatusMessage(attempt: number, max: number): string {
  if (attempt === 0) return "Updating balance from chain…";
  if (attempt < 3) return "Waiting on network provider…";
  return `Still processing… (${attempt + 1}/${max})`;
}

/** Retry indexer/RPC scan until balance reflects the confirmed tx (post shield/transfer/unshield). */
export async function syncBalanceAfterTx(
  options: BalanceSyncAfterTxOptions = {}
): Promise<boolean> {
  const maxAttempts = options.maxAttempts ?? 8;
  const applyGen = applyGeneration;
  useShieldedStore.getState().setNotesChainReady(false);

  for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
    options.onStatus?.(balanceSyncStatusMessage(attempt, maxAttempts));

    const verified = await runFullScan(
      {
        postTx: true,
        bustIndexerCache: true,
        awaitNullifiers: true,
        syncMerkle: options.syncMerkle ?? false,
        expectSpentNoteId: options.expectSpentNoteId,
      },
      applyGen
    );

    if (verified) {
      if (options.expectSpentNoteId) {
        const spent = useShieldedStore
          .getState()
          .notes.find((n) => n.id === options.expectSpentNoteId)?.spent;
        if (!spent) {
          if (attempt < maxAttempts - 1) {
            options.onStatus?.("Confirming spend in your balance…");
            await new Promise((r) => setTimeout(r, 1500));
            continue;
          }
          return false;
        }
      }
      return true;
    }

    if (attempt < maxAttempts - 1) {
      await new Promise((r) => setTimeout(r, 1500));
    }
  }

  return false;
}

export type FinishShieldedTxOptions = {
  spentNoteId?: string;
  syncMerkle?: boolean;
  onStatus: (message: string) => void;
};

/**
 * Complete UI flow after on-chain tx: sync balance with retries and user feedback.
 * Never throws — returns whether balance was fully verified.
 */
export async function finishShieldedTransaction(
  options: FinishShieldedTxOptions
): Promise<{ balanceVerified: boolean }> {
  const balanceVerified = await syncBalanceAfterTx({
    onStatus: options.onStatus,
    expectSpentNoteId: options.spentNoteId,
    syncMerkle: options.syncMerkle,
  });

  if (!balanceVerified) {
    options.onStatus(
      "Transaction confirmed on-chain — balance is still syncing. The dashboard will update shortly."
    );
  }

  return { balanceVerified };
}

/** Full chain rescan after a failed shield/transfer/unshield — restores indexer/RPC truth. */
export async function recoverBalanceFromChain(): Promise<void> {
  bumpApplyGeneration();
  const applyGen = applyGeneration;
  const state = useShieldedStore.getState();
  state.setNotesChainReady(false);
  const wallet = getDefaultStore().get(walletAddressAtom) ?? state.keyMaterialAddress;
  if (!wallet || !state.viewingPub) return;

  const config = await loadNetworkConfig(state.network);
  const cacheKey = scanCacheKey(
    state.network,
    config.contracts.shieldedPool,
    state.viewingPub,
    config.contracts.deployLedger
  );
  state.setScanCacheEntry(cacheKey, {
    viewingPub: state.viewingPub,
    lastScannedLedger: 0,
    deployLedger: config.contracts.deployLedger,
    notesChainVerified: false,
    notes: [],
  });

  await runFullScan(
    {
      forceFullScan: true,
      bustIndexerCache: true,
      awaitNullifiers: true,
    },
    applyGen
  );
}

function applyScanResult(
  applyGen: number,
  cacheKey: string,
  result: Awaited<ReturnType<typeof refreshShieldedWallet>>,
  softBackground: boolean,
  expectSpentNoteId?: string,
  wallet?: string,
  network?: ReturnType<typeof useShieldedStore.getState>["network"],
  poolId?: string
): void {
  if (applyGen !== applyGeneration) return;

  const state = useShieldedStore.getState();
  const userWarnings = filterUserSyncWarnings(result.warnings);
  const liveCount = state.notes.length;
  const chainNotes = dropPhantomNoteIds(result.notes);

  let chainVerified = result.chainVerified;
  if (chainVerified && expectSpentNoteId) {
    const spentOk = chainNotes.find((n) => n.id === expectSpentNoteId)?.spent === true;
    if (!spentOk) {
      chainVerified = false;
      scanDebug("sync:deferApply", { expectSpentNoteId, reason: "spent note not confirmed on chain" });
    }
  }

  if (chainVerified) {
    const merged = mergeNotes(state.notes, chainNotes);
    state.setNotes(merged);
    state.setNotesChainReady(true);
    state.setScanCacheEntry(cacheKey, {
      ...result.scanCacheOut,
      notesChainVerified: true,
      notes: serializeNotes(merged),
    });
    scanDebug("sync:applied", {
      prev: liveCount,
      next: merged.length,
      unspent: shieldedTotal(merged).toString(),
      chainVerified: true,
    });
    state.setSyncWarnings(userWarnings);

    if (wallet && network && poolId) {
      void recordIncomingTransferActivity({ wallet, network, poolId, notes: merged }).catch((e) => {
        scanDebugWarn("activity:incomingFailed", { error: formatWalletError(e) });
      });
    }
  } else if (result.noteScanComplete) {
    state.setScanCacheEntry(cacheKey, {
      ...result.scanCacheOut,
      notesChainVerified: false,
      notes: undefined,
    });
    state.setSyncWarnings(userWarnings);
  } else if (result.lastScannedLedger > 0) {
    const cache = state.getScanCacheEntry(cacheKey);
    state.setScanCacheEntry(cacheKey, {
      viewingPub: result.scanCacheOut.viewingPub,
      lastScannedLedger: result.lastScannedLedger,
      lastFullScanAt: result.scanCacheOut.lastFullScanAt,
      deployLedger: result.scanCacheOut.deployLedger,
      notesChainVerified: cache?.notesChainVerified === true,
      notes: cache?.notesChainVerified === true ? cache.notes : undefined,
    });
    if (!softBackground || liveCount === 0) {
      state.setSyncWarnings(userWarnings);
    }
    scanDebug("sync:partial", {
      chainVerified: false,
      liveCount,
      scannedCount: chainNotes.length,
    });
  } else if (!softBackground || liveCount === 0) {
    state.setSyncWarnings(userWarnings);
  }

  if (result.merkleLeaves.length > 0) {
    state.setMerkleLeaves(result.merkleLeaves);
  }
}

async function runFullScan(options: SyncOptions, applyGen: number): Promise<boolean> {
  const state = useShieldedStore.getState();
  const wallet = getDefaultStore().get(walletAddressAtom) ?? state.keyMaterialAddress;
  if (!wallet || !state.viewingPub || !state.viewingKey || !state.spendingKey) return false;
  if (state.keyMaterialAddress && wallet !== state.keyMaterialAddress) return false;

  const background = options.background ?? false;
  const manualRefresh = options.manualRefresh ?? false;
  const softBackground = background || manualRefresh;
  const initial = options.initial ?? false;
  const syncMerkle = options.syncMerkle ?? false;
  /** Background polls must confirm nullifiers — otherwise a stale incremental scan can re-add spent notes. */
  const awaitNullifiers =
    options.awaitNullifiers ?? syncMerkle ?? options.postTx ?? background;

  scanDebug("sync:start", {
    initial,
    background,
    manualRefresh,
    syncMerkle,
    awaitNullifiers,
    postTx: options.postTx ?? false,
    storeNotes: state.notes.length,
  });

  if (manualRefresh) {
    console.info("[veilum] balance refresh started");
  }

  const showGlobalRefreshing = Boolean(options.postTx);
  if (showGlobalRefreshing) {
    state.setScanRefreshing(true);
  } else if (initial) {
    state.setSyncError(null);
  }

  let chainVerified = false;

  try {
    const config = await loadNetworkConfig(state.network);
    const poolId = config.contracts.shieldedPool;
    const deployLedger = config.contracts.deployLedger;
    const cacheKey = scanCacheKey(state.network, poolId, state.viewingPub, deployLedger);
    const priorCache = state.getScanCacheEntry(cacheKey);

    const metadataNotes = useShieldedStore.getState().notes;

    const showInitialLoading = initial && metadataNotes.length === 0;
    if (showInitialLoading) state.setScanLoading(true);

    const refreshWork = refreshShieldedWallet({
      network: state.network,
      wallet,
      viewingKey: state.viewingKey,
      viewingPub: state.viewingPub,
      spendingKey: state.spendingKey,
      existingNotes: metadataNotes,
      priorScanCache: priorCache,
      routeCursor: state.routeCursor,
      syncMerkle,
      awaitNullifiers,
      background: softBackground,
      forceFullScan: options.forceFullScan,
      bustIndexerCache: options.bustIndexerCache,
      postTx: options.postTx,
      manualRefresh,
      forceSpendCheckNoteIds: options.expectSpentNoteId ? [options.expectSpentNoteId] : undefined,
    });

    const result = manualRefresh
      ? await withTimeout(
          refreshWork,
          MANUAL_REFRESH_TIMEOUT_MS,
          "Balance refresh timed out — try again in a moment"
        )
      : await refreshWork;

    if (applyGen !== applyGeneration) {
      scanDebug("sync:stale", { applyGen, current: applyGeneration });
      return false;
    }

    chainVerified = result.chainVerified;
    if (chainVerified && options.expectSpentNoteId) {
      const spentOk = result.notes.find((n) => n.id === options.expectSpentNoteId)?.spent === true;
      if (!spentOk) chainVerified = false;
    }
    applyScanResult(
      applyGen,
      cacheKey,
      result,
      softBackground,
      options.expectSpentNoteId,
      wallet,
      state.network,
      poolId
    );

    if (!awaitNullifiers && result.chainVerified && result.notes.length > 0 && !softBackground) {
      const notesForNullifiers = useShieldedStore.getState().notes;
      void refreshNoteSpendStatus({
        network: state.network,
        wallet,
        spendingKey: state.spendingKey,
        notes: notesForNullifiers,
        priorNotes: notesForNullifiers,
      })
        .then((resolved) => {
          if (applyGen !== applyGeneration) return;
          const live = useShieldedStore.getState();
          const verified = dropPhantomNoteIds(mergeNotes(live.notes, resolved));
          live.setNotes(verified);
          live.setNotesChainReady(true);
          const cache = live.getScanCacheEntry(cacheKey);
          if (cache?.notesChainVerified && live.viewingPub) {
            live.setScanCacheEntry(cacheKey, {
              viewingPub: live.viewingPub,
              lastScannedLedger: cache.lastScannedLedger,
              lastFullScanAt: Date.now(),
              deployLedger: cache.deployLedger,
              notesChainVerified: true,
              notes: serializeNotes(verified),
            });
          }
          scanDebug("sync:nullifiersApplied", { count: verified.length });
        })
        .catch((e) => {
          scanDebugWarn("sync:nullifiersFailed", { error: formatWalletError(e) });
        });
    }
  } catch (e) {
    if (applyGen === applyGeneration) {
      state.setSyncError(formatWalletError(e));
      scanDebugWarn("sync:error", { error: formatWalletError(e) });
      if (manualRefresh) {
        console.warn("[veilum] balance refresh failed:", formatWalletError(e));
      }
    }
  } finally {
    if (applyGen === applyGeneration) {
      state.setScanLoading(false);
      if (showGlobalRefreshing) {
        state.setScanRefreshing(false);
      }
    }
    if (manualRefresh) {
      console.info("[veilum] balance refresh finished");
    }
  }

  return chainVerified;
}

export function invalidateShieldedSync(): void {
  bumpApplyGeneration();
}

export { bumpApplyGeneration };
