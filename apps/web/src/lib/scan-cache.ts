import type { Hex32, NetworkName } from "./types";

/** Ledger cursor only — notes are always rebuilt from on-chain route events. */
export type StoredScanCacheRow = {
  viewingPub: Hex32;
  lastScannedLedger: number;
  lastFullScanAt?: number;
  /** @deprecated legacy rows — ignored */
  notes?: unknown[];
};

export type ScanCachePayload = {
  viewingPub: Hex32;
  lastScannedLedger: number;
  lastFullScanAt?: number;
};

export const FULL_SCAN_INTERVAL_MS = 3 * 60 * 1000;
export const BACKGROUND_POLL_MS = 30_000;

export function scanCacheKey(network: NetworkName, poolId: string, viewingPub: Hex32): string {
  return `${network}:${poolId}:${viewingPub.toLowerCase()}`;
}

export function payloadToStoredRow(payload: ScanCachePayload): StoredScanCacheRow {
  return {
    viewingPub: payload.viewingPub,
    lastScannedLedger: payload.lastScannedLedger,
    lastFullScanAt: payload.lastFullScanAt,
  };
}

export function pickRefreshMode(priorCache: ScanCachePayload | null): "full" | "incremental" {
  if (!priorCache?.lastScannedLedger) return "full";
  if (!priorCache.lastFullScanAt) return "full";
  if (Date.now() - priorCache.lastFullScanAt > FULL_SCAN_INTERVAL_MS) return "full";
  return "incremental";
}
