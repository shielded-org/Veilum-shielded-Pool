import type { DecryptedNote, Hex32 } from "./types";

export type TokenNoteGroup = {
  token: Hex32;
  totalAmount: bigint;
  maxNoteAmount: bigint;
  noteCount: number;
  notes: DecryptedNote[];
};

export function tokenKey(token: Hex32): string {
  return token.toLowerCase();
}

export function groupUnspentNotesByToken(notes: DecryptedNote[]): TokenNoteGroup[] {
  const map = new Map<string, TokenNoteGroup>();

  for (const note of notes) {
    if (note.spent) continue;
    const key = tokenKey(note.token);
    let group = map.get(key);
    if (!group) {
      group = {
        token: note.token,
        totalAmount: 0n,
        maxNoteAmount: 0n,
        noteCount: 0,
        notes: [],
      };
      map.set(key, group);
    }
    group.notes.push(note);
    group.totalAmount += note.amount;
    group.noteCount += 1;
    if (note.amount > group.maxNoteAmount) {
      group.maxNoteAmount = note.amount;
    }
  }

  for (const group of map.values()) {
    group.notes.sort((a, b) => (a.amount < b.amount ? -1 : a.amount > b.amount ? 1 : 0));
  }

  return [...map.values()];
}

/** Smallest note that covers the send amount — minimizes change. */
export function pickNoteForTransfer(
  group: TokenNoteGroup | undefined,
  sendAmount: bigint
): DecryptedNote | undefined {
  if (!group) return undefined;
  return group.notes.find((n) => n.amount >= sendAmount);
}
