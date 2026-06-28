import type { PersistedNote } from "./note-persist";
import type { Hex32, NetworkName } from "./types";
import type { RpcLedgerWindow } from "./rpc-events";

/** Incremental scan cache per pool — cursor + indexer/RPC-verified notes only. */
export type StoredScanCacheRow = {
  viewingPub: Hex32;
  lastScannedLedger: number;
  lastFullScanAt?: number;
  deployLedger?: number;
  /** Notes were decrypted from indexer/RPC events in a completed scan. */
  notesChainVerified?: boolean;
  notes: PersistedNote[];
};

export type ScanCachePayload = {
  viewingPub: Hex32;
  lastScannedLedger: number;
  lastFullScanAt?: number;
  deployLedger?: number;
  notesChainVerified?: boolean;
  notes?: PersistedNote[];
};

export const BACKGROUND_POLL_MS = 30_000;
/** Faster incremental poll while the tab is visible (incoming private transfers). */
export const VISIBLE_POLL_MS = 12_000;

/** @deprecated Always RPC-tail when indexer lags chain head — kept for tests. */
export const INDEXER_RPC_TAIL_LAG = 0;

/** Re-scan this many ledgers before the scan cursor after a confirmed tx. */
export const POST_TX_RESCAN_LEDGERS = 12;

/** Include deploy ledger so redeploys do not reuse a stale cursor (shielded-token parity). */
export function scanCacheKey(
  network: NetworkName,
  poolId: string,
  viewingPub: Hex32,
  deployLedger?: number
): string {
  return `${network}:${poolId}:${deployLedger ?? 0}:${viewingPub.toLowerCase()}`;
}

export function payloadToStoredRow(payload: ScanCachePayload): StoredScanCacheRow {
  return {
    viewingPub: payload.viewingPub,
    lastScannedLedger: payload.lastScannedLedger,
    lastFullScanAt: payload.lastFullScanAt,
    deployLedger: payload.deployLedger,
    notesChainVerified: payload.notesChainVerified === true,
    notes: payload.notesChainVerified === true ? (payload.notes ?? []) : [],
  };
}

/**
 * Incremental unless cache is missing, deploy changed, notes are empty, or caller forces full.
 * A cursor without cached notes always triggers a full rescan (shielded-token parity).
 */
export function pickRefreshMode(
  priorCache: ScanCachePayload | null,
  opts?: { deployLedger?: number; forceFull?: boolean; hasNotes?: boolean }
): "full" | "incremental" {
  if (opts?.forceFull) return "full";
  if (
    opts?.deployLedger &&
    priorCache?.deployLedger &&
    priorCache.deployLedger !== opts.deployLedger
  ) {
    return "full";
  }
  if (!priorCache?.lastScannedLedger) return "full";
  const hasCachedNotes =
    priorCache.notesChainVerified === true &&
    ((opts?.hasNotes ?? false) || (priorCache.notes?.length ?? 0) > 0);
  if (!hasCachedNotes) return "full";
  return "incremental";
}

/** Drop stale cursors outside the current RPC retention window. */
export function sanitizeScanCache(
  priorCache: ScanCachePayload | null | undefined,
  window?: RpcLedgerWindow,
  deployLedger?: number
): ScanCachePayload | null {
  if (!priorCache?.lastScannedLedger) return priorCache ?? null;
  if (deployLedger && priorCache.deployLedger && priorCache.deployLedger !== deployLedger) {
    return null;
  }
  if (!window) return priorCache;
  if (priorCache.lastScannedLedger < window.oldest - 1 || priorCache.lastScannedLedger > window.latest) {
    return null;
  }
  return priorCache;
}
