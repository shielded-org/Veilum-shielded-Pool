/**
 * Merkle sync diagnostics (prefix `[veilum-merkle]`).
 * Enable: localStorage `veilum:merkleDebug` = `1` or `?merkleDebug=1`
 */

function enabled(): boolean {
  if (typeof window === "undefined") return false;
  try {
    const ls = window.localStorage?.getItem("veilum:merkleDebug");
    if (ls === "1" || String(ls).toLowerCase() === "true") return true;
    return new URLSearchParams(window.location.search).get("merkleDebug") === "1";
  } catch {
    return false;
  }
}

export function merkleDebugEnabled(): boolean {
  return enabled();
}

export function merkleDebug(phase: string, data: Record<string, unknown>): void {
  if (!enabled()) return;
  console.info(`[veilum-merkle] ${phase}`, data);
}

export function merkleDebugWarn(phase: string, data: Record<string, unknown>): void {
  if (!enabled()) return;
  console.warn(`[veilum-merkle] ${phase}`, data);
}
