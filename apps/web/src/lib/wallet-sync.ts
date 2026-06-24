import { loadNetworkConfig } from "./config";
import { getBrowserPoseidonHasher, nullifier } from "./hasher";
import { attachLeafIndices } from "./merkle-sync";
import { reconcileChainNotes, shieldedTotal } from "./note-store";
import { tryFetchHistoryGapEvents } from "./pool-indexer";
import { resolvePoolStartLedger } from "./pool-ledger";
import type { ScanCachePayload } from "./scan-cache";
import { resolveNoteSpendStatus, scanRouteEvents } from "./scan";
import { scanDebug, scanDebugWarn, scanRpcLabel } from "./scan-debug";
import { fetchMerkleLeaves } from "./shield-ops";
import { createRpc } from "./soroban";
import { historyGapBeforeWindow, pickEventsRpc, resolveScanLedgerRange } from "./rpc-events";
import { useShieldedStore } from "../store/use-shielded-store";
import type { DecryptedNote, Hex32, NetworkName } from "./types";

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
};

export async function refreshShieldedWallet(params: {
  network: NetworkName;
  wallet: string;
  viewingKey: string;
  viewingPub: Hex32;
  spendingKey: string;
  /** Local notes — metadata (blinding, leaf index) only, not a balance source. */
  existingNotes?: DecryptedNote[];
  priorScanCache?: ScanCachePayload | null;
  routeCursor?: number;
  syncMerkle?: boolean;
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
  const metadataNotes = params.existingNotes ?? [];

  scanDebug("refresh:start", {
    network: params.network,
    poolId,
    deployLedger: deployLedger ?? null,
    modeRequested: "full",
    metadataNoteCount: metadataNotes.length,
    walletPrefix: params.wallet ? `${params.wallet.slice(0, 8)}…` : null,
    viewingPubPrefix: params.viewingPub ? `${params.viewingPub.slice(0, 10)}…` : null,
    priorCacheLedger: params.priorScanCache?.lastScannedLedger ?? null,
  });

  let poolDeployLedger: number | null = null;
  let ledgerWindow: Awaited<ReturnType<typeof resolvePoolStartLedger>>["window"] | undefined;
  let eventsRpc = rpc;
  let archivedGapEvents: Awaited<ReturnType<typeof tryFetchHistoryGapEvents>>["events"] = [];
  try {
    const resolved = await resolvePoolStartLedger(config, poolId, config.contracts.deployLedger);
    poolDeployLedger = resolved.startLedger;
    ledgerWindow = resolved.window;
    eventsRpc = resolved.eventsRpc;
    if (historyGapBeforeWindow(config.contracts.deployLedger, resolved.window)) {
      const gap = await tryFetchHistoryGapEvents(
        poolId,
        config.contracts.deployLedger,
        resolved.window
      );
      archivedGapEvents = gap.events;
      if (gap.events.length > 0) {
        scanDebug("refresh:indexerGap", {
          from: config.contracts.deployLedger,
          to: resolved.window.oldest - 1,
          count: gap.events.length,
        });
      }
    }
  } catch (e) {
    warnings.push(`Could not resolve scan start ledger: ${errMsg(e)}`);
    try {
      const fallback = await pickEventsRpc(config, poolId, config.contracts.deployLedger, { force: true });
      ledgerWindow = fallback.window;
      eventsRpc = fallback.rpc;
      poolDeployLedger = resolveScanLedgerRange(
        config.contracts.deployLedger ?? fallback.window.oldest,
        fallback.window
      ).scanFrom;
    } catch {
      /* note scan skipped below when window is unavailable */
    }
  }

  let scanFromLedger = poolDeployLedger ?? ledgerWindow?.oldest ?? 1;
  let lastScannedLedger = scanFromLedger - 1;

  if (ledgerWindow) {
    const range = resolveScanLedgerRange(scanFromLedger, ledgerWindow);
    scanFromLedger = range.scanFrom;
  }

  scanDebug("refresh:scanPlan", {
    deployLedger: deployLedger ?? null,
    poolDeployLedger,
    scanFromLedger,
    endLedger: ledgerWindow?.latest ?? null,
    rpcOldest: ledgerWindow?.oldest ?? null,
    eventsRpc: ledgerWindow?.rpcUrl ? scanRpcLabel(ledgerWindow.rpcUrl) : null,
    indexedRouteEvents,
    routeCursor: params.routeCursor ?? 0,
    scanAllSubchannels: true,
  });

  let routeEventsScanned = 0;
  let channelMatched = 0;
  /** Start from local notes — never wipe on a failed or empty chain scan. */
  let chainNotes: DecryptedNote[] = metadataNotes;
  let scanSkipped = false;

  try {
    if (!ledgerWindow) {
      scanSkipped = true;
      warnings.push("Note scan skipped: RPC event window unavailable");
    } else {
      const fresh = await pickEventsRpc(config, poolId, config.contracts.deployLedger, { force: true });
      ledgerWindow = fresh.window;
      eventsRpc = fresh.rpc;
      const range = resolveScanLedgerRange(scanFromLedger, ledgerWindow);
      if (range.scanFrom > range.endLedger) {
        scanSkipped = true;
        lastScannedLedger = range.endLedger;
      } else {
        scanFromLedger = range.scanFrom;
        const delta = await scanRouteEvents(eventsRpc, poolId, scanFromLedger, viewingPriv, params.viewingPub, {
          indexedRouteEvents,
          routeCursor: params.routeCursor ?? 0,
          ledgerWindow,
          archivedEvents: archivedGapEvents,
          // Always scan every subchannel — incremental only narrows the ledger range.
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

        chainNotes = reconcileChainNotes(delta.notes, metadataNotes);
      }
    }
  } catch (e) {
    warnings.push(`Note scan failed: ${errMsg(e)}`);
    scanDebugWarn("refresh:scanFailed", { error: errMsg(e) });
  }

  scanDebug("refresh:scanDone", {
    scanSkipped,
    routeEventsScanned,
    channelMatched,
    chainNoteCount: chainNotes.length,
    metadataNoteCount: metadataNotes.length,
    lastScannedLedger,
    warnings,
  });

  const noteScanComplete = noteScanSucceeded({
    scanSkipped,
    routeEventsScanned,
    channelMatched,
  });

  const notesWithSpend = await resolveAllNoteSpendStatus(
    rpc,
    config,
    poolId,
    params.wallet,
    chainNotes,
    spending
  );

  let merkleLeaves: Hex32[] = [];
  const syncMerkle = params.syncMerkle ?? false;
  if (syncMerkle) {
    try {
      merkleLeaves = await fetchMerkleLeaves(config, params.wallet, poolDeployLedger ?? undefined, undefined, {
        archivedEvents: archivedGapEvents,
      });
    } catch (e) {
      warnings.push(`Merkle sync failed: ${errMsg(e)}`);
    }
  } else {
    void fetchMerkleLeaves(config, params.wallet, poolDeployLedger ?? undefined, undefined, {
      archivedEvents: archivedGapEvents,
    })
      .then((leaves) => {
        const state = useShieldedStore.getState();
        state.setMerkleLeaves(leaves);
        state.patchNoteLeafIndices(leaves);
      })
      .catch(() => {
        /* background merkle — transfer/unshield will resync on demand */
      });
  }

  const notesWithLeaves = attachLeafIndices(notesWithSpend, merkleLeaves);

  scanDebug("refresh:result", {
    noteScanComplete,
    chainNoteCount: chainNotes.length,
    spendNoteCount: notesWithSpend.length,
    finalNoteCount: notesWithLeaves.length,
    channelMatched,
    routeEventsScanned,
  });

  if (channelMatched > 0 && chainNotes.length === 0) {
    warnings.push(
      "Found route events for your channel but none decrypted — use Sync keys if you switched wallets or browsers."
    );
  }

  if (channelMatched > 0 && chainNotes.length > 0 && channelMatched > chainNotes.length) {
    warnings.push(
      `Recovered ${chainNotes.length} of ${channelMatched} route events for your channel — some notes may use different keys or subchannels.`
    );
  }

  const now = Date.now();
  return {
    notes: notesWithLeaves,
    merkleLeaves,
    shieldedBalance: shieldedTotal(notesWithLeaves),
    scanStartLedger: poolDeployLedger ?? ledgerWindow?.oldest ?? 0,
    lastScannedLedger,
    routeEventsScanned,
    channelMatched,
    warnings,
    noteScanComplete,
    scanCacheOut: {
      viewingPub: params.viewingPub,
      lastScannedLedger,
      lastFullScanAt: now,
      deployLedger,
    },
  };
}

function noteScanSucceeded(params: {
  scanSkipped: boolean;
  routeEventsScanned: number;
  channelMatched: number;
}): boolean {
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
  spending: bigint
): Promise<DecryptedNote[]> {
  if (notes.length === 0) return [];

  try {
    const hasher = await getBrowserPoseidonHasher();
    // Always check on-chain nullifiers — local `spent` is optimistic and may be wrong.
    return await resolveNoteSpendStatus(
      rpc,
      config,
      poolId,
      wallet,
      notes,
      spending,
      (sk, c) => nullifier(hasher, sk, c)
    );
  } catch {
    return notes.map((n) => ({ ...n, spent: n.spent ?? false }));
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
