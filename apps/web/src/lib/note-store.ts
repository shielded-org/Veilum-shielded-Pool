import type { DecryptedNote, Hex32 } from "./types";

type StoredNote = Omit<DecryptedNote, "amount" | "blinding"> & {
  amount: string;
  blinding: string;
};

export function serializeNote(note: DecryptedNote): StoredNote {
  return {
    ...note,
    amount: note.amount.toString(),
    blinding: note.blinding.toString(),
  };
}

export function deserializeNote(note: StoredNote): DecryptedNote {
  return {
    ...note,
    amount: BigInt(note.amount),
    blinding: BigInt(note.blinding),
  };
}

/** Full rescan: on-chain decrypted notes are authoritative; keep local metadata only. */
export function reconcileChainNotes(
  scanned: DecryptedNote[],
  previous: DecryptedNote[] = []
): DecryptedNote[] {
  const prevById = new Map(previous.map((n) => [n.id, n]));
  const reconciled = scanned.map((note) => {
    const prev = prevById.get(note.id);
    if (!prev) return { ...note, spent: undefined };
    return {
      ...note,
      blinding: prev.blinding || note.blinding,
      leafIndex: prev.leafIndex ?? note.leafIndex,
      txHash: note.txHash ?? prev.txHash,
      spent: undefined,
    };
  });
  // Keep local notes until chain scan confirms them (RPC lag / just-shielded).
  const scannedCommitments = new Set(reconciled.map((n) => commitmentKey(n.commitment)));
  const pendingLocal = previous.filter((n) => {
    if (scannedCommitments.has(commitmentKey(n.commitment))) return false;
    const suffix = n.id.split(":").pop() ?? "";
    // Drop phantom optimistic notes keyed by relayer request id instead of a tx hash.
    return /^[0-9a-f]{64}$/i.test(suffix.replace(/^0x/i, ""));
  });
  return pendingLocal.length > 0 ? mergeNotes(pendingLocal, reconciled) : reconciled;
}

/** Stable key for deduping the same note across id variants (`commit:txHash` vs `commit:requestId`). */
export function commitmentKey(commitment: Hex32 | string): string {
  return commitment.replace(/^0x/i, "").toLowerCase();
}

function isStellarTxHash(value: string | undefined | null): value is string {
  return typeof value === "string" && /^[0-9a-f]{64}$/i.test(value.replace(/^0x/i, ""));
}

function preferNoteId(a: DecryptedNote, b: DecryptedNote): string {
  const aHash = isStellarTxHash(a.txHash);
  const bHash = isStellarTxHash(b.txHash);
  if (aHash && !bHash) return a.id;
  if (bHash && !aHash) return b.id;
  return b.id.length >= a.id.length ? b.id : a.id;
}

function mergeNotePair(prev: DecryptedNote, next: DecryptedNote): DecryptedNote {
  const txHash = isStellarTxHash(next.txHash)
    ? next.txHash
    : isStellarTxHash(prev.txHash)
      ? prev.txHash
      : next.txHash ?? prev.txHash;
  return {
    ...next,
    id: preferNoteId(prev, { ...next, txHash }),
    blinding: prev.blinding || next.blinding,
    leafIndex: prev.leafIndex ?? next.leafIndex,
    txHash,
    spent: prev.spent === true || next.spent === true ? true : (next.spent ?? prev.spent),
    nullifier: next.nullifier ?? prev.nullifier,
  };
}

/** Keep locally-known notes (blinding, leaf index) when chain scan returns overlapping data. */
export function mergeNotes(existing: DecryptedNote[], scanned: DecryptedNote[]): DecryptedNote[] {
  const byCommitment = new Map<string, DecryptedNote>();
  const upsert = (note: DecryptedNote) => {
    const key = commitmentKey(note.commitment);
    const prev = byCommitment.get(key);
    byCommitment.set(key, prev ? mergeNotePair(prev, note) : note);
  };
  for (const note of existing) upsert(note);
  for (const note of scanned) upsert(note);
  return Array.from(byCommitment.values());
}

/** After a spend tx: mark source note spent and merge change output locally. */
export function applyNoteSpendOutcome(
  existing: DecryptedNote[],
  spentNoteId: string,
  changeNote?: DecryptedNote
): DecryptedNote[] {
  const marked = existing.map((n) => (n.id === spentNoteId ? { ...n, spent: true } : n));
  return changeNote ? mergeNotes(marked, [changeNote]) : marked;
}

export function shieldedTotal(notes: DecryptedNote[]): bigint {
  return notes.filter((n) => !n.spent).reduce((sum, n) => sum + n.amount, 0n);
}

/** Remove optimistic notes keyed by relayer request id (not a 64-char on-chain tx hash). */
export function dropPhantomNoteIds(notes: DecryptedNote[]): DecryptedNote[] {
  return notes.filter((n) => {
    const suffix = n.id.split(":").pop() ?? "";
    return /^[0-9a-f]{64}$/i.test(suffix.replace(/^0x/i, ""));
  });
}
