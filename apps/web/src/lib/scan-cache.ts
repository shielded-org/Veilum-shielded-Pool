import type { Hex32, NetworkName } from "./types";
import type { RpcLedgerWindow } from "./rpc-events";

/** Ledger cursor only — notes are always rebuilt from on-chain route events. */
export type StoredScanCacheRow = {
  viewingPub: Hex32;
  lastScannedLedger: number;
  lastFullScanAt?: number;
  deployLedger?: number;
  /** @deprecated legacy rows — ignored */
  notes?: unknown[];
};

export type ScanCachePayload = {
  viewingPub: Hex32;
  lastScannedLedger: number;
  lastFullScanAt?: number;
  deployLedger?: number;
};

export const FULL_SCAN_INTERVAL_MS = 3 * 60 * 1000;
export const BACKGROUND_POLL_MS = 30_000;

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
  };
}

export function pickRefreshMode(
  priorCache: ScanCachePayload | null,
  opts?: { hasNotes?: boolean; deployLedger?: number }
): "full" | "incremental" {
  if (!opts?.hasNotes) return "full";
  if (
    opts.deployLedger &&
    priorCache?.deployLedger &&
    priorCache.deployLedger !== opts.deployLedger
  ) {
    return "full";
  }
  if (!priorCache?.lastScannedLedger) return "full";
  if (!priorCache.lastFullScanAt) return "full";
  if (Date.now() - priorCache.lastFullScanAt > FULL_SCAN_INTERVAL_MS) return "full";
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
