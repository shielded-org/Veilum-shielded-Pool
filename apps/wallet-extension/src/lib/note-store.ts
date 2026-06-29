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

/** Chain scan output merged with prior scan metadata (blinding, leaf index) only. */
export function reconcileChainNotes(
  scanned: DecryptedNote[],
  previous: DecryptedNote[] = []
): DecryptedNote[] {
  const prevByCommitment = new Map(previous.map((n) => [commitmentKey(n.commitment), n]));
  return scanned.map((note) => {
    const prev = prevByCommitment.get(commitmentKey(note.commitment));
    if (!prev) return { ...note, spent: undefined };
    return {
      ...note,
      blinding: prev.blinding || note.blinding,
      leafIndex: prev.leafIndex ?? note.leafIndex,
      txHash: note.txHash ?? prev.txHash,
      spent: prev.spent === true ? true : undefined,
      nullifier: prev.nullifier ?? note.nullifier,
    };
  });
}

/** Combine prior chain-verified wallet with notes discovered in an incremental scan range. */
export function mergeIncrementalWalletNotes(
  prior: DecryptedNote[],
  scannedDelta: DecryptedNote[]
): DecryptedNote[] {
  if (scannedDelta.length === 0) return prior;
  const reconciled = reconcileChainNotes(scannedDelta, prior);
  const touched = new Set(scannedDelta.map((n) => commitmentKey(n.commitment)));
  const untouched = prior.filter((n) => !touched.has(commitmentKey(n.commitment)));
  return mergeNotes(untouched, reconciled);
}

/** Stable key for deduping the same note across id variants (`commit:txHash` vs `commit:requestId`). */
export function commitmentKey(commitment: Hex32 | string): string {
  return commitment.replace(/^0x/i, "").toLowerCase();
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
  const seen = new Set<string>();
  let sum = 0n;
  for (const n of notes) {
    if (n.spent) continue;
    const key = commitmentKey(n.commitment);
    if (seen.has(key)) continue;
    seen.add(key);
    sum += n.amount;
  }
  return sum;
}

/** Remove notes not discoverable from indexer/RPC event decryption. */
export function dropPhantomNoteIds(notes: DecryptedNote[]): DecryptedNote[] {
  return notes.filter((n) => isConfirmedOnChainNote(n));
}

export function isStellarTxHash(value: string | undefined | null): value is string {
  return typeof value === "string" && /^[0-9a-f]{64}$/i.test(value.replace(/^0x/i, ""));
}

/** Note id references a 64-char on-chain tx hash (decrypted from a route event). */
export function isConfirmedOnChainNote(note: DecryptedNote): boolean {
  if (isStellarTxHash(note.txHash)) return true;
  const suffix = note.id.split(":").pop() ?? "";
  return isStellarTxHash(suffix);
}
