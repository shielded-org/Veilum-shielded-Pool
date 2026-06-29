import { loadNetworkConfig } from "./config";
import { getBrowserPoseidonHasher, nullifier } from "./hasher";
import { routeForRecipient } from "./keys";
import { attachLeafIndices } from "./merkle-sync";
import { deserializeNotes, mergePriorSpendFlags, serializeNotes } from "./note-persist";
import { reconcileChainNotes, mergeIncrementalWalletNotes, shieldedTotal, dropPhantomNoteIds } from "./note-store";
import { fetchIndexerPoolStatus, tryFetchIndexerRouteEvents, clearIndexerEventsCache } from "./pool-indexer";
import type { ScanCachePayload } from "./scan-cache";
import {
  pickRefreshMode,
  sanitizeScanCache,
  POST_TX_RESCAN_LEDGERS,
} from "./scan-cache";
import { resolveNoteSpendStatus, scanPrefetchedIndexerEvents, scanRouteEvents } from "./scan";
import { scanDebug, scanDebugWarn } from "./scan-debug";
import { fetchMerkleLeaves } from "./shield-ops";
import { createRpc } from "./soroban";
import {
  pickEventsRpc,
  resolveScanLedgerRange,
  isLedgerRangeError,
  type RpcLedgerWindow,
} from "./rpc-events";
import type { DecryptedNote, Hex32, NetworkName } from "./types";
import { bytes32Arg } from "./utils";

export type WalletRefreshResult = {
  notes: DecryptedNote[];
  merkleLeaves: Hex32[];
  shieldedBalance: bigint;
  scanStartLedger: number;
  lastScannedLedger: number;
  routeEventsScanned: number;
  channelMatched: number;
  warnings: string[];
  scanCacheOut: ScanCachePayload;
  noteScanComplete: boolean;
  /** Notes were fully resolved from indexer/RPC — safe to render and persist. */
  chainVerified: boolean;
};

export async function refreshShieldedWallet(params: {
  network: NetworkName;
  wallet: string;
  viewingKey: string;
  viewingPub: Hex32;
  spendingKey: string;
  existingNotes?: DecryptedNote[];
  priorScanCache?: ScanCachePayload | null;
  routeCursor?: number;
  /** Blocking merkle rebuild — only for transfer/unshield prep. */
  syncMerkle?: boolean;
  /** When false, return notes immediately with cached spent flags (dashboard path). */
  awaitNullifiers?: boolean;
  background?: boolean;
  forceFullScan?: boolean;
  /** Skip indexer cache — use after transfers / focus refresh for fresh tail. */
  bustIndexerCache?: boolean;
  /** After shield/transfer/unshield — widen scan window and always RPC-tail. */
  postTx?: boolean;
  /** Re-check nullifier on-chain for these notes even if cached (post spend). */
  forceSpendCheckNoteIds?: string[];
  onScanProgress?: (found: number, eventsScanned: number) => void;
}): Promise<WalletRefreshResult> {
  const warnings: string[] = [];
  const config = await loadNetworkConfig(params.network);
  const rpc = createRpc(config);
  const viewingPriv = BigInt(params.viewingKey);
  const spending = BigInt(params.spendingKey);
  const poolId = config.contracts.shieldedPool;
  const indexedRouteEvents = config.contracts.indexedRouteEvents === true;
  const deployLedger = config.contracts.deployLedger;
  const cachedNotes =
    params.priorScanCache?.notesChainVerified === true
      ? deserializeNotes(params.priorScanCache.notes)
      : [];
  const liveNotes = params.existingNotes ?? [];
  /** Live wallet wins over cache — cache can lag behind a just-finished post-tx apply. */
  const metadataNotes = liveNotes.length > 0 ? liveNotes : cachedNotes;
  const requireFreshScan = Boolean(params.postTx || params.bustIndexerCache);
  const viewingChannelHex = bytes32Arg(routeForRecipient(params.viewingPub, 0).channel).toLowerCase();

  if (params.bustIndexerCache) {
    clearIndexerEventsCache(poolId);
  }

  scanDebug("refresh:start", {
    network: params.network,
    poolId,
    deployLedger: deployLedger ?? null,
    metadataNoteCount: metadataNotes.length,
    cachedNoteCount: cachedNotes.length,
    priorCacheLedger: params.priorScanCache?.lastScannedLedger ?? null,
  });

  let poolDeployLedger: number | null = deployLedger && deployLedger > 0 ? deployLedger : null;
  let ledgerWindow: RpcLedgerWindow | undefined;
  let eventsRpc = rpc;
  let indexerEvents: Awaited<ReturnType<typeof tryFetchIndexerRouteEvents>>["events"] | undefined;
  let indexerTailFrom: number | undefined;
  let indexerChannelFiltered = false;
  let indexerReachable = false;
  let archivedIndexerEvents: Awaited<ReturnType<typeof tryFetchIndexerRouteEvents>>["events"] = [];

  const indexerStatus = await fetchIndexerPoolStatus(poolId);
  const latestSeq = (await rpc.getLatestLedger()).sequence;

  if (indexerStatus) {
    ledgerWindow = {
      oldest: indexerStatus.oldestStoredLedger ?? deployLedger ?? 1,
      latest: latestSeq,
      rpcUrl: config.rpcUrl,
    };
    poolDeployLedger =
      poolDeployLedger ?? indexerStatus.deployLedger ?? deployLedger ?? ledgerWindow.oldest;
  }

  const sanitizedCache = sanitizeScanCache(params.priorScanCache, ledgerWindow, deployLedger);
  const refreshMode = pickRefreshMode(sanitizedCache, {
    deployLedger,
    forceFull: params.forceFullScan,
    hasNotes: metadataNotes.length > 0,
  });

  const historyFrom =
    poolDeployLedger ??
    indexerStatus?.oldestStoredLedger ??
    deployLedger ??
    ledgerWindow?.oldest ??
    1;

  let eventScanFrom = historyFrom;
  if (refreshMode === "incremental" && sanitizedCache?.lastScannedLedger != null) {
    eventScanFrom = Math.max(
      sanitizedCache.lastScannedLedger + 1,
      indexerStatus?.oldestStoredLedger ?? 0,
      historyFrom
    );
    if (params.postTx) {
      eventScanFrom = Math.max(
        historyFrom,
        sanitizedCache.lastScannedLedger - POST_TX_RESCAN_LEDGERS + 1
      );
    }
  }

  let lastScannedLedger = Math.max(eventScanFrom - 1, sanitizedCache?.lastScannedLedger ?? 0);

  async function attachRpcTail(fromLedger: number): Promise<void> {
    if (!ledgerWindow || !indexerStatus?.lastIndexedLedger) return;
    if (fromLedger > ledgerWindow.latest) return;
    try {
      const eventsHandle = await pickEventsRpc(config, poolId, deployLedger, { force: true });
      ledgerWindow = eventsHandle.window;
      eventsRpc = eventsHandle.rpc;
      const tailFrom = Math.max(ledgerWindow.oldest, fromLedger);
      if (tailFrom <= ledgerWindow.latest) {
        indexerTailFrom = tailFrom;
      }
    } catch (e) {
      scanDebugWarn("refresh:rpcTailProbeFailed", { error: errMsg(e) });
    }
  }

  const indexerAtHead =
    indexerStatus?.lastIndexedLedger != null && indexerStatus.lastIndexedLedger >= latestSeq - 1;

  if (indexerStatus?.lastIndexedLedger != null && ledgerWindow) {
    const indexerTo = Math.min(indexerStatus.lastIndexedLedger, ledgerWindow.latest);
    if (eventScanFrom <= indexerTo) {
      const fetched = await tryFetchIndexerRouteEvents(
        poolId,
        eventScanFrom,
        indexerTo,
        viewingChannelHex
      );
      indexerReachable = fetched.reachable;
      if (fetched.reachable) {
        indexerEvents = fetched.events;
        archivedIndexerEvents = fetched.events;
        indexerChannelFiltered = fetched.channelFiltered;
      }
    }

    const indexerLagsHead =
      indexerStatus.lastIndexedLedger < latestSeq || eventScanFrom > indexerTo;
    if (indexerLagsHead || requireFreshScan) {
      let tailStart = Math.max(
        eventScanFrom,
        indexerStatus.lastIndexedLedger + 1,
        sanitizedCache?.lastScannedLedger != null ? sanitizedCache.lastScannedLedger + 1 : eventScanFrom
      );
      if (params.postTx && sanitizedCache?.lastScannedLedger != null) {
        tailStart = Math.max(
          ledgerWindow.oldest,
          sanitizedCache.lastScannedLedger - POST_TX_RESCAN_LEDGERS + 1,
          eventScanFrom
        );
      }
      await attachRpcTail(tailStart);
    }

    scanDebug("refresh:indexerChannel", {
      from: eventScanFrom,
      to: indexerTo,
      count: indexerEvents?.length ?? 0,
      tailFrom: indexerTailFrom ?? null,
      indexerAtHead,
      indexerLagsHead,
      refreshMode,
    });
  }

  if (!indexerReachable) {
    try {
      const eventsHandle = await pickEventsRpc(config, poolId, deployLedger, { force: true });
      ledgerWindow = eventsHandle.window;
      eventsRpc = eventsHandle.rpc;
      poolDeployLedger =
        poolDeployLedger ?? indexerStatus?.deployLedger ?? deployLedger ?? ledgerWindow.oldest;
    } catch (e) {
      warnings.push(`Could not resolve RPC event window: ${errMsg(e)}`);
    }
  }

  scanDebug("refresh:scanPlan", {
    deployLedger: deployLedger ?? null,
    eventScanFrom,
    historyFrom,
    refreshMode,
    endLedger: ledgerWindow?.latest ?? null,
    indexerReachable,
    indexerPrimary: indexerEvents !== undefined,
    indexerChannelFiltered,
    indexerTailFrom: indexerTailFrom ?? null,
  });

  let routeEventsScanned = 0;
  let channelMatched = 0;
  let chainNotes: DecryptedNote[] = metadataNotes;
  let scanSkipped = false;

  try {
    if (!ledgerWindow) {
      scanSkipped = true;
      warnings.push("Note scan skipped: RPC event window unavailable");
    } else {
      const range = resolveScanLedgerRange(eventScanFrom, ledgerWindow);
      if (range.scanFrom > range.endLedger && indexerEvents === undefined) {
        scanSkipped = true;
        lastScannedLedger = Math.max(lastScannedLedger, range.endLedger);
      } else if (
        !requireFreshScan &&
        indexerEvents !== undefined &&
        indexerTailFrom === undefined &&
        refreshMode === "incremental" &&
        indexerEvents.length === 0 &&
        metadataNotes.length > 0 &&
        indexerAtHead
      ) {
        scanSkipped = false;
        lastScannedLedger = Math.max(lastScannedLedger, indexerStatus?.lastIndexedLedger ?? range.endLedger);
        chainNotes = metadataNotes;
        routeEventsScanned = 0;
        channelMatched = 0;
      } else {
        const delta = await scanRouteEvents(eventsRpc, poolId, eventScanFrom, viewingPriv, params.viewingPub, {
          indexedRouteEvents,
          routeCursor: params.routeCursor ?? 0,
          ledgerWindow,
          ...(indexerEvents !== undefined
            ? { indexerEvents, indexerTailFrom, indexerChannelFiltered }
            : { archivedEvents: archivedIndexerEvents }),
          scanAllSubchannels: true,
          knownNoteCount: metadataNotes.filter((n) => !n.spent).length,
          onProgress: (p) => {
            routeEventsScanned = p.eventsScanned;
            channelMatched = p.channelMatched;
            params.onScanProgress?.(p.notesFound, p.eventsScanned);
          },
        });
        routeEventsScanned = delta.eventsScanned;
        channelMatched = delta.channelMatched;
        lastScannedLedger = Math.max(lastScannedLedger, delta.lastScannedLedger);
        chainNotes =
          refreshMode === "incremental"
            ? mergeIncrementalWalletNotes(metadataNotes, delta.notes)
            : reconcileChainNotes(delta.notes, metadataNotes);
      }
    }
  } catch (e) {
    const msg = errMsg(e);
    if (isLedgerRangeError(e)) {
      scanDebugWarn("refresh:scanLedgerRange", { error: msg });
      if (indexerEvents !== undefined && indexerEvents.length >= 0 && ledgerWindow) {
        try {
          const recovered = await scanPrefetchedIndexerEvents(
            indexerEvents,
            eventScanFrom,
            ledgerWindow.latest,
            viewingPriv,
            {
              onProgress: (p) => {
                routeEventsScanned = p.eventsScanned;
                channelMatched = p.channelMatched;
                params.onScanProgress?.(p.notesFound, p.eventsScanned);
              },
            }
          );
          routeEventsScanned = recovered.eventsScanned;
          channelMatched = recovered.channelMatched;
          lastScannedLedger = Math.max(lastScannedLedger, recovered.lastScannedLedger);
          chainNotes =
            refreshMode === "incremental"
              ? mergeIncrementalWalletNotes(metadataNotes, recovered.notes)
              : reconcileChainNotes(recovered.notes, metadataNotes);
        } catch (recoverErr) {
          scanDebugWarn("refresh:indexerRecoverFailed", { error: errMsg(recoverErr) });
        }
      }
    } else {
      warnings.push(`Note scan failed: ${msg}`);
    }
    scanDebugWarn("refresh:scanFailed", { error: msg });
  }

  const noteScanComplete = noteScanSucceeded({
    scanSkipped,
    routeEventsScanned,
    channelMatched,
    notesFound: chainNotes.length,
  });

  const notesWithSpend =
    params.awaitNullifiers === true
      ? await resolveAllNoteSpendStatus(
          rpc,
          config,
          poolId,
          params.wallet,
          chainNotes,
          spending,
          metadataNotes,
          params.forceSpendCheckNoteIds
        )
      : mergePriorSpendFlags(chainNotes, metadataNotes);

  let merkleLeaves: Hex32[] = [];
  if (params.syncMerkle) {
    try {
      merkleLeaves = await fetchMerkleLeaves(config, params.wallet, poolDeployLedger ?? undefined, undefined, {
        archivedEvents: archivedIndexerEvents,
      });
      const notesWithLeaves = attachLeafIndices(notesWithSpend, merkleLeaves);
      return buildRefreshResult({
        notes: dropPhantomNoteIds(notesWithLeaves),
        merkleLeaves,
        warnings,
        noteScanComplete,
        lastScannedLedger,
        routeEventsScanned,
        channelMatched,
        chainNotes,
        channelMatchedForWarn: channelMatched,
        params,
        poolDeployLedger,
        ledgerWindow,
      });
    } catch (e) {
      warnings.push(`Merkle sync failed: ${errMsg(e)}`);
    }
  }

  const notesWithLeaves = attachLeafIndices(notesWithSpend, merkleLeaves);
  return buildRefreshResult({
    notes: dropPhantomNoteIds(notesWithLeaves),
    merkleLeaves,
    warnings,
    noteScanComplete,
    lastScannedLedger,
    routeEventsScanned,
    channelMatched,
    chainNotes,
    channelMatchedForWarn: channelMatched,
    params,
    poolDeployLedger,
    ledgerWindow,
  });
}

/** Background nullifier refresh — patches spent flags after instant balance display. */
export async function refreshNoteSpendStatus(params: {
  network: NetworkName;
  wallet: string;
  spendingKey: string;
  notes: DecryptedNote[];
  priorNotes?: DecryptedNote[];
}): Promise<DecryptedNote[]> {
  const config = await loadNetworkConfig(params.network);
  const rpc = createRpc(config);
  const poolId = config.contracts.shieldedPool;
  return resolveAllNoteSpendStatus(
    rpc,
    config,
    poolId,
    params.wallet,
    params.notes,
    BigInt(params.spendingKey),
    params.priorNotes ?? params.notes
  );
}

function buildRefreshResult(ctx: {
  notes: DecryptedNote[];
  merkleLeaves: Hex32[];
  warnings: string[];
  noteScanComplete: boolean;
  lastScannedLedger: number;
  routeEventsScanned: number;
  channelMatched: number;
  chainNotes: DecryptedNote[];
  channelMatchedForWarn: number;
  params: { viewingPub: Hex32; deployLedger?: number };
  poolDeployLedger: number | null;
  ledgerWindow?: RpcLedgerWindow;
}): WalletRefreshResult {
  const {
    notes,
    merkleLeaves,
    warnings,
    noteScanComplete,
    lastScannedLedger,
    routeEventsScanned,
    channelMatched,
    chainNotes,
    channelMatchedForWarn,
    params,
    poolDeployLedger,
    ledgerWindow,
  } = ctx;

  if (channelMatchedForWarn > 0 && chainNotes.length === 0) {
    warnings.push(
      "Found route events for your channel but none decrypted — use Sync keys if you switched wallets or browsers."
    );
  }

  if (channelMatchedForWarn > 0 && chainNotes.length > 0 && channelMatchedForWarn > chainNotes.length) {
    warnings.push(
      `Recovered ${chainNotes.length} of ${channelMatchedForWarn} route events for your channel — some notes may use different keys or subchannels.`
    );
  }

  const now = Date.now();
  const chainVerified = noteScanComplete;
  return {
    notes,
    merkleLeaves,
    shieldedBalance: shieldedTotal(notes),
    scanStartLedger: poolDeployLedger ?? ledgerWindow?.oldest ?? 0,
    lastScannedLedger,
    routeEventsScanned,
    channelMatched,
    warnings,
    noteScanComplete,
    chainVerified,
    scanCacheOut: {
      viewingPub: params.viewingPub,
      lastScannedLedger,
      lastFullScanAt: now,
      deployLedger: params.deployLedger,
      notesChainVerified: chainVerified,
      notes: chainVerified ? serializeNotes(notes) : undefined,
    },
  };
}

function noteScanSucceeded(params: {
  scanSkipped: boolean;
  routeEventsScanned: number;
  channelMatched: number;
  notesFound: number;
}): boolean {
  if (params.notesFound > 0) return true;
  if (params.scanSkipped) return false;
  if (params.routeEventsScanned > 0) return true;
  return params.channelMatched > 0;
}

async function resolveAllNoteSpendStatus(
  rpc: ReturnType<typeof createRpc>,
  config: Awaited<ReturnType<typeof loadNetworkConfig>>,
  poolId: string,
  wallet: string,
  notes: DecryptedNote[],
  spending: bigint,
  priorNotes: DecryptedNote[],
  forceSpendCheckNoteIds?: string[]
): Promise<DecryptedNote[]> {
  if (notes.length === 0) return [];

  const forceSet = new Set(forceSpendCheckNoteIds ?? []);
  const priorById = new Map(priorNotes.map((n) => [n.id, n]));
  const needsCheck = notes.filter((n) => {
    if (forceSet.has(n.id)) return true;
    const prior = priorById.get(n.id);
    return !prior || prior.nullifier == null;
  });

  if (needsCheck.length === 0) {
    return notes.map((n) => priorById.get(n.id) ?? n);
  }

  try {
    const hasher = await getBrowserPoseidonHasher();
    const checked = await resolveNoteSpendStatus(
      rpc,
      config,
      poolId,
      wallet,
      needsCheck,
      spending,
      (sk, c) => nullifier(hasher, sk, c)
    );
    const checkedById = new Map(checked.map((n) => [n.id, n]));
    return notes.map((n) => checkedById.get(n.id) ?? priorById.get(n.id) ?? n);
  } catch {
    return notes.map((n) => ({ ...n, spent: priorById.get(n.id)?.spent ?? n.spent ?? false }));
  }
}

function errMsg(e: unknown): string {
  if (e instanceof Error) return e.message;
  if (typeof e === "string") return e;
  if (e && typeof e === "object") {
    const o = e as Record<string, unknown>;
    if (typeof o.message === "string") return o.message;
    if (typeof o.error === "string") return o.error;
    if (o.error && typeof o.error === "object" && typeof (o.error as { message?: string }).message === "string") {
      return (o.error as { message: string }).message;
    }
    try {
      return JSON.stringify(e);
    } catch {
      return String(e);
    }
  }
  return String(e);
}
