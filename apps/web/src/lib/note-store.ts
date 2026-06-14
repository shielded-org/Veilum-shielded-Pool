import type { DecryptedNote } from "./types";

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
  return scanned.map((note) => {
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
}

/** Keep locally-known notes (blinding, leaf index) when chain scan returns overlapping data. */
export function mergeNotes(existing: DecryptedNote[], scanned: DecryptedNote[]): DecryptedNote[] {
  const byId = new Map<string, DecryptedNote>();
  for (const note of existing) byId.set(note.id, note);
  for (const note of scanned) {
    const prev = byId.get(note.id);
    byId.set(
      note.id,
      prev
        ? {
            ...note,
            blinding: prev.blinding || note.blinding,
            leafIndex: prev.leafIndex ?? note.leafIndex,
            txHash: note.txHash ?? prev.txHash,
            spent: prev.spent === true ? true : (note.spent ?? prev.spent),
            nullifier: note.nullifier ?? prev.nullifier,
          }
        : note
    );
  }
  return Array.from(byId.values());
}

export function shieldedTotal(notes: DecryptedNote[]): bigint {
  return notes.filter((n) => !n.spent).reduce((sum, n) => sum + n.amount, 0n);
}
