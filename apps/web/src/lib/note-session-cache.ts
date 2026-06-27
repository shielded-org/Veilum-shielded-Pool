import type { DecryptedNote, Hex32 } from "./types";

const STORAGE_KEY = "stellar-shielded-notes-session";

type SerializedNote = Omit<DecryptedNote, "amount"> & { amount: string };

type SessionRow = {
  key: string;
  notes: SerializedNote[];
  savedAt: number;
};

function serializeNote(note: DecryptedNote): SerializedNote {
  return { ...note, amount: note.amount.toString() };
}

function deserializeNote(row: SerializedNote): DecryptedNote {
  return { ...row, amount: BigInt(row.amount) };
}

function readStore(): SessionRow | null {
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as SessionRow;
    if (!parsed?.key || !Array.isArray(parsed.notes)) return null;
    return parsed;
  } catch {
    return null;
  }
}

/** Instant balance display on reload — cleared when keys change or tab closes. */
export function readSessionNotes(cacheKey: string): DecryptedNote[] | null {
  const row = readStore();
  if (!row || row.key !== cacheKey) return null;
  return row.notes.map(deserializeNote);
}

export function writeSessionNotes(cacheKey: string, notes: DecryptedNote[]): void {
  if (notes.length === 0) {
    clearSessionNotes();
    return;
  }
  try {
    const payload: SessionRow = {
      key: cacheKey,
      notes: notes.map(serializeNote),
      savedAt: Date.now(),
    };
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
  } catch {
    /* quota / private mode */
  }
}

export function clearSessionNotes(): void {
  try {
    sessionStorage.removeItem(STORAGE_KEY);
  } catch {
    /* ignore */
  }
}

export function sessionCacheMatchesViewingPub(viewingPub: Hex32 | null, cacheKey: string): boolean {
  if (!viewingPub) return false;
  const row = readStore();
  return row?.key === cacheKey;
}
