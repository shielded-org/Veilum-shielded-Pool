import type { DecryptedNote } from "./types";
import { commitmentKey } from "./note-store";

function traceEnabled(): boolean {
  if (typeof window === "undefined") return false;
  try {
    const ls = window.localStorage?.getItem("veilum:notesTrace");
    if (ls === "1" || String(ls).toLowerCase() === "true") return true;
    return new URLSearchParams(window.location.search).get("notesTrace") === "1";
  } catch {
    return false;
  }
}

export function traceNotesUpdate(
  source: string,
  prev: DecryptedNote[],
  next: DecryptedNote[],
  detail?: Record<string, unknown>
): void {
  const prevKeys = new Set(prev.map((n) => commitmentKey(n.commitment)));
  const nextKeys = new Set(next.map((n) => commitmentKey(n.commitment)));
  const dropped = prev.filter((n) => !nextKeys.has(commitmentKey(n.commitment)));
  const added = next.filter((n) => !prevKeys.has(commitmentKey(n.commitment)));

  if (next.length < prev.length || dropped.length > 0) {
    console.warn(`[veilum-notes] shrink ${prev.length} → ${next.length} via ${source}`, {
      dropped: dropped.length,
      added: added.length,
      droppedCommitments: dropped.map((n) => n.commitment.slice(0, 14)),
      ...detail,
    });
  } else if (traceEnabled()) {
    console.info(`[veilum-notes] ${source}`, {
      prev: prev.length,
      next: next.length,
      added: added.length,
      ...detail,
    });
  }
}
