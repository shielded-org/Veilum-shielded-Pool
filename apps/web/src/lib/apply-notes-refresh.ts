import { commitmentKey, mergeNotes, shieldedTotal } from "./note-store";
import type { WalletRefreshMode } from "./wallet-sync";
import type { DecryptedNote } from "./types";
import { useShieldedStore } from "../store/use-shielded-store";

/** Live preview during scan — never shrink an existing note set mid-flight. */
export function applyNotesPreview(
  mode: WalletRefreshMode,
  notes: DecryptedNote[],
  balance: bigint
): void {
  const state = useShieldedStore.getState();
  const current = state.notes;

  if (notes.length === 0 && current.length > 0) return;

  if (mode === "full") {
    if (current.length > 0 && notes.length < current.length) return;
    state.setNotes(notes);
    state.setShieldedBalance(balance);
    return;
  }

  if (notes.length > 0) {
    const merged = mergeNotes(current, notes);
    state.setNotes(merged);
    state.setShieldedBalance(shieldedTotal(merged));
  }
}

export function applyNotesFinal(
  mode: WalletRefreshMode,
  notes: DecryptedNote[],
  balance: bigint,
  noteScanComplete: boolean
): void {
  const state = useShieldedStore.getState();
  const current = state.notes;

  if (mode === "full") {
    if (!noteScanComplete) return;
    if (isSuspiciousNoteShrink(notes, current)) return;
    state.setNotes(notes);
    state.setShieldedBalance(balance);
    return;
  }

  if (!noteScanComplete && notes.length <= current.length) return;

  if (notes.length > 0) {
    const merged = mergeNotes(current, notes);
    if (isSuspiciousNoteShrink(merged, current) && !noteScanComplete) return;
    state.setNotes(merged);
    state.setShieldedBalance(shieldedTotal(merged));
  }
}

/** True when a scan actually walked chain events (not a skipped empty incremental cursor). */
export function isNoteScanComplete(params: {
  scanSkipped: boolean;
  routeEventsScanned: number;
  channelMatched: number;
  mode: WalletRefreshMode;
}): boolean {
  if (params.scanSkipped) return false;
  if (params.routeEventsScanned > 0) return true;
  if (params.mode === "full" && params.channelMatched > 0) return true;
  return false;
}

/** Detect partial full-scan results that would drop known commitments. */
export function isSuspiciousNoteShrink(
  next: DecryptedNote[],
  current: DecryptedNote[]
): boolean {
  if (current.length === 0 || next.length === 0) return false;
  if (next.length >= current.length) return false;
  const nextKeys = new Set(next.map((n) => commitmentKey(n.commitment)));
  const missing = current.filter((n) => !nextKeys.has(commitmentKey(n.commitment)));
  return missing.length > 0;
}
