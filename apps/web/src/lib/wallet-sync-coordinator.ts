/**
 * Single-flight wallet refresh — prevents parallel scans from racing and
 * overwriting a complete note set with a partial incremental result.
 */
let syncGeneration = 0;
let syncInFlight = false;

export type WalletSyncHandle = {
  generation: number;
  isCurrent: () => boolean;
};

export function beginWalletSync(opts?: { background?: boolean }): WalletSyncHandle | null {
  if (opts?.background && syncInFlight) return null;
  syncInFlight = true;
  const generation = ++syncGeneration;
  return {
    generation,
    isCurrent: () => generation === syncGeneration,
  };
}

export function endWalletSync(generation: number): void {
  if (generation === syncGeneration) {
    syncInFlight = false;
  }
}

export function invalidateWalletSync(): void {
  syncGeneration += 1;
  syncInFlight = false;
}

export function isWalletSyncInFlight(): boolean {
  return syncInFlight;
}
