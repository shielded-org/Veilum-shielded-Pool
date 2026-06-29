import { commitmentKey } from "./note-store";
import type { DecryptedNote, Hex32 } from "./types";

/** JSON-safe note row for localStorage / scan cache. */
export type PersistedNote = {
  id: string;
  commitment: Hex32;
  token: Hex32;
  amount: string;
  blinding: string;
  leafIndex?: number;
  txHash?: string;
  spent?: boolean;
  nullifier?: Hex32;
  createdAt?: string;
};

export function serializeNote(note: DecryptedNote): PersistedNote {
  return {
    ...note,
    amount: note.amount.toString(),
    blinding: note.blinding.toString(),
  };
}

export function deserializeNote(row: PersistedNote): DecryptedNote {
  return {
    ...row,
    amount: BigInt(row.amount),
    blinding: BigInt(row.blinding),
  };
}

export function serializeNotes(notes: DecryptedNote[]): PersistedNote[] {
  return notes.map(serializeNote);
}

export function deserializeNotes(rows: PersistedNote[] | undefined | null): DecryptedNote[] {
  if (!rows?.length) return [];
  return rows.map(deserializeNote);
}

/** Merge prior spent/nullifier metadata onto freshly scanned notes. */
export function mergePriorSpendFlags(
  notes: DecryptedNote[],
  priorNotes: DecryptedNote[]
): DecryptedNote[] {
  if (priorNotes.length === 0) return notes;
  const priorById = new Map(priorNotes.map((n) => [n.id, n]));
  const priorByCommitment = new Map(priorNotes.map((n) => [commitmentKey(n.commitment), n]));
  return notes.map((n) => {
    const prior = priorById.get(n.id) ?? priorByCommitment.get(commitmentKey(n.commitment));
    if (!prior) return n;
    const spent = prior.spent === true || n.spent === true ? true : (n.spent ?? prior.spent);
    return {
      ...n,
      spent,
      nullifier: prior.nullifier ?? n.nullifier,
      leafIndex: n.leafIndex ?? prior.leafIndex,
      txHash: n.txHash ?? prior.txHash,
    };
  });
}
