/**
 * Note scan diagnostics (browser console, prefix `[veilum-scan]`):
 *
 * DevTools → Application → Local Storage → `veilum:scanDebug` = `1`, then reload.
 * Or set `VITE_SCAN_DEBUG=true` in apps/web/.env.local and restart dev server.
 */

function readLocalDebugFlag(): boolean {
  if (typeof window === "undefined") return false;
  try {
    const ls = window.localStorage?.getItem("veilum:scanDebug");
    if (ls === "1" || String(ls).toLowerCase() === "true") return true;
    return new URLSearchParams(window.location.search).get("scanDebug") === "1";
  } catch {
    return false;
  }
}

function enabled(): boolean {
  if (readLocalDebugFlag()) return true;
  const v = import.meta.env.VITE_SCAN_DEBUG;
  return v === "1" || String(v).toLowerCase() === "true";
}

export function scanDebugEnabled(): boolean {
  return enabled();
}

export function scanDebug(phase: string, data: Record<string, unknown>): void {
  if (!enabled()) return;
  console.info(`[veilum-scan] ${phase}`, data);
}

export function scanDebugWarn(phase: string, data: Record<string, unknown>): void {
  if (!enabled()) return;
  console.warn(`[veilum-scan] ${phase}`, data);
}

export function scanRpcLabel(url: string): string {
  try {
    const u = new URL(url);
    return `${u.protocol}//${u.host}`;
  } catch {
    return url.length > 64 ? `${url.slice(0, 64)}…` : url;
  }
}
