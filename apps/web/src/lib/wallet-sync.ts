import { loadNetworkConfig } from "./config";
import { getBrowserPoseidonHasher, nullifier } from "./hasher";
import { attachLeafIndices } from "./merkle-sync";
import { mergeNotes, reconcileChainNotes, shieldedTotal } from "./note-store";
import { resolvePoolStartLedger } from "./pool-ledger";
import type { ScanCachePayload } from "./scan-cache";
import { pickRefreshMode } from "./scan-cache";
import { resolveNoteSpendStatus, scanRouteEvents } from "./scan";
import { fetchMerkleLeaves } from "./shield-ops";
import { createRpc } from "./soroban";
import { useShieldedStore } from "../store/use-shielded-store";
import type { DecryptedNote, Hex32, NetworkName } from "./types";

export type WalletRefreshMode = "full" | "incremental";

export type WalletRefreshResult = {
  notes: DecryptedNote[];
  merkleLeaves: Hex32[];
  shieldedBalance: bigint;
  scanStartLedger: number;
  lastScannedLedger: number;
  routeEventsScanned: number;
  warnings: string[];
  scanCacheOut: ScanCachePayload;
  mode: WalletRefreshMode;
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
  mode?: WalletRefreshMode;
  syncMerkle?: boolean;
  onScanProgress?: (found: number, eventsScanned: number) => void;
  onNotesReady?: (notes: DecryptedNote[], balance: bigint) => void;
}): Promise<WalletRefreshResult> {
  const warnings: string[] = [];
  const config = await loadNetworkConfig(params.network);
  const rpc = createRpc(config);
  const viewingPriv = BigInt(params.viewingKey);
  const spending = BigInt(params.spendingKey);
  const poolId = config.contracts.shieldedPool;
  const indexedRouteEvents = config.contracts.indexedRouteEvents === true;
  const metadataNotes = params.existingNotes ?? [];

  const mode = params.mode ?? pickRefreshMode(params.priorScanCache ?? null);

  let poolDeployLedger = 1;
  try {
    poolDeployLedger = await resolvePoolStartLedger(rpc, poolId, config.contracts.deployLedger);
  } catch (e) {
    warnings.push(`Could not resolve scan start ledger: ${errMsg(e)}`);
  }

  let scanFromLedger = poolDeployLedger;
  let lastScannedLedger = params.priorScanCache?.lastScannedLedger ?? poolDeployLedger - 1;

  if (
    mode === "incremental" &&
    params.priorScanCache &&
    params.priorScanCache.viewingPub.toLowerCase() === params.viewingPub.toLowerCase()
  ) {
    scanFromLedger = Math.max(poolDeployLedger, params.priorScanCache.lastScannedLedger + 1);
    lastScannedLedger = params.priorScanCache.lastScannedLedger;
  }

  let routeEventsScanned = 0;
  let chainNotes: DecryptedNote[] = mode === "full" ? [] : metadataNotes;
  let scanSkipped = false;

  try {
    const latest = await rpc.getLatestLedger();
    if (scanFromLedger > latest.sequence) {
      scanSkipped = true;
      lastScannedLedger = latest.sequence;
    } else {
      const delta = await scanRouteEvents(rpc, poolId, scanFromLedger, viewingPriv, params.viewingPub, {
        indexedRouteEvents,
        routeCursor: params.routeCursor ?? 0,
        onProgress: (p) => {
          routeEventsScanned = p.eventsScanned;
          params.onScanProgress?.(p.notesFound, p.eventsScanned);
        },
      });
      routeEventsScanned = delta.eventsScanned;
      lastScannedLedger = Math.max(lastScannedLedger, delta.lastScannedLedger);

      if (mode === "full") {
        chainNotes = reconcileChainNotes(delta.notes, metadataNotes);
      } else if (delta.notes.length > 0) {
        chainNotes = mergeNotes(metadataNotes, delta.notes);
      }
    }
  } catch (e) {
    warnings.push(`Note scan failed: ${errMsg(e)}`);
    chainNotes = mode === "full" ? [] : metadataNotes;
  }

  if (chainNotes.length > 0 && (routeEventsScanned > 0 || !scanSkipped || mode === "full")) {
    params.onNotesReady?.(chainNotes, shieldedTotal(chainNotes));
  }

  const notesWithSpend = await resolveAllNoteSpendStatus(
    rpc,
    config,
    poolId,
    params.wallet,
    chainNotes,
    spending
  );
  params.onNotesReady?.(notesWithSpend, shieldedTotal(notesWithSpend));

  let merkleLeaves: Hex32[] = [];
  const syncMerkle = params.syncMerkle ?? false;
  if (syncMerkle) {
    try {
      merkleLeaves = await fetchMerkleLeaves(config, params.wallet, poolDeployLedger);
    } catch (e) {
      warnings.push(`Merkle sync failed: ${errMsg(e)}`);
    }
  } else {
    void fetchMerkleLeaves(config, params.wallet, poolDeployLedger)
      .then((leaves) => {
        const state = useShieldedStore.getState();
        state.setMerkleLeaves(leaves);
        state.setNotes(attachLeafIndices(state.notes, leaves));
      })
      .catch(() => {
        /* background merkle — transfer/unshield will resync on demand */
      });
  }

  const notesWithLeaves = attachLeafIndices(notesWithSpend, merkleLeaves);

  if (routeEventsScanned > 0 && chainNotes.length === 0 && mode === "full") {
    warnings.push(
      "Found route events for your channel but none decrypted — reconnect your wallet to re-derive keys."
    );
  }

  const now = Date.now();
  return {
    notes: notesWithLeaves,
    merkleLeaves,
    shieldedBalance: shieldedTotal(notesWithLeaves),
    scanStartLedger: poolDeployLedger,
    lastScannedLedger,
    routeEventsScanned,
    warnings,
    mode,
    scanCacheOut: {
      viewingPub: params.viewingPub,
      lastScannedLedger,
      lastFullScanAt: mode === "full" ? now : params.priorScanCache?.lastFullScanAt,
    },
  };
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
  const unspent = notes.filter((n) => n.spent !== true);
  if (unspent.length === 0) return notes;

  try {
    const hasher = await getBrowserPoseidonHasher();
    const unspentIds = new Set(unspent.map((n) => n.id));
    return await resolveNoteSpendStatus(
      rpc,
      config,
      poolId,
      wallet,
      notes,
      spending,
      (sk, c) => nullifier(hasher, sk, c),
      unspentIds
    );
  } catch {
    return notes.map((n) => ({ ...n, spent: n.spent ?? false }));
  }
}

function errMsg(e: unknown): string {
  return e instanceof Error ? e.message : String(e);
}
