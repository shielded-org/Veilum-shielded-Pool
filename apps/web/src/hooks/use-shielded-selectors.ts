import { useMemo } from "react";

import { useShieldedStore } from "../store/use-shielded-store";

/** Stable unspent notes — never filter inside the zustand selector (causes infinite re-renders). */
export function useUnspentNotes() {
  const notes = useShieldedStore((s) => s.notes);
  return useMemo(() => notes.filter((n) => !n.spent), [notes]);
}

export function useUnspentNoteCount() {
  const notes = useShieldedStore((s) => s.notes);
  return useMemo(() => notes.filter((n) => !n.spent).length, [notes]);
}
