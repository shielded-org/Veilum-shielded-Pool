import { create } from "zustand";
import { persist } from "zustand/middleware";

import type { DecryptedNote, Hex32, NetworkName, TransactionRecord } from "../lib/types";
import { attachLeafIndices } from "../lib/merkle-sync";
import { mergeNotes, shieldedTotal } from "../lib/note-store";
import { traceNotesUpdate } from "../lib/notes-trace";
import type { StoredScanCacheRow } from "../lib/scan-cache";
import { payloadToStoredRow } from "../lib/scan-cache";
import type { ScanCachePayload } from "../lib/scan-cache";

type ShieldedState = {
  network: NetworkName;
  spendingKey: string;
  viewingKey: string;
  viewingPub: Hex32 | null;
  ownerPk: Hex32 | null;
  keyMaterialAddress: string | null;
  routeCursor: number;
  notes: DecryptedNote[];
  merkleLeaves: Hex32[];
  shieldedBalance: bigint;
  revealBalances: boolean;
  scanLoading: boolean;
  scanRefreshing: boolean;
  syncError: string | null;
  syncWarnings: string[];
  relayerOk: boolean;
  transactions: TransactionRecord[];
  onboardingDismissed: boolean;
  /** Incremental route-event scan cache per pool (shielded-token parity). */
  scanCacheByPool: Record<string, StoredScanCacheRow>;
  setNetwork: (n: NetworkName) => void;
  setKeys: (keys: {
    spendingKey: bigint;
    viewingPriv: bigint;
    viewingPub: Hex32;
    ownerPk: Hex32;
    address: string;
  }) => void;
  clearKeys: () => void;
  /** Clear all wallet-bound session data (keys, notes, scans, activity). */
  resetWalletSession: () => void;
  setNotes: (notes: DecryptedNote[]) => void;
  addNote: (note: DecryptedNote) => void;
  markNoteSpent: (id: string) => void;
  setMerkleLeaves: (leaves: Hex32[]) => void;
  patchNoteLeafIndices: (leaves: Hex32[]) => void;
  setShieldedBalance: (v: bigint) => void;
  setRevealBalances: (v: boolean) => void;
  setScanLoading: (v: boolean) => void;
  setScanRefreshing: (v: boolean) => void;
  setSyncError: (v: string | null) => void;
  setSyncWarnings: (v: string[]) => void;
  setRelayerOk: (v: boolean) => void;
  setScanCacheEntry: (key: string, payload: ScanCachePayload) => void;
  getScanCacheEntry: (key: string) => ScanCachePayload | null;
  bumpRouteCursor: () => number;
  addTransaction: (tx: TransactionRecord) => void;
  updateTransaction: (id: string, patch: Partial<TransactionRecord>) => void;
  setOnboardingDismissed: (v: boolean) => void;
};

export const useShieldedStore = create<ShieldedState>()(
  persist(
    (set, get) => ({
      network: "testnet",
      spendingKey: "",
      viewingKey: "",
      viewingPub: null,
      ownerPk: null,
      keyMaterialAddress: null,
      routeCursor: 0,
      notes: [],
      merkleLeaves: [],
      shieldedBalance: 0n,
      revealBalances: true,
      scanLoading: false,
      scanRefreshing: false,
      syncError: null,
      syncWarnings: [],
      relayerOk: false,
      transactions: [],
      onboardingDismissed: false,
      scanCacheByPool: {},
      setNetwork: (network) => set({ network }),
      setKeys: (keys) =>
        set({
          spendingKey: keys.spendingKey.toString(),
          viewingKey: keys.viewingPriv.toString(),
          viewingPub: keys.viewingPub,
          ownerPk: keys.ownerPk,
          keyMaterialAddress: keys.address,
          scanCacheByPool: {},
        }),
      clearKeys: () =>
        set({
          spendingKey: "",
          viewingKey: "",
          viewingPub: null,
          ownerPk: null,
          keyMaterialAddress: null,
          notes: [],
          shieldedBalance: 0n,
          scanCacheByPool: {},
        }),
      resetWalletSession: () =>
        set({
          spendingKey: "",
          viewingKey: "",
          viewingPub: null,
          ownerPk: null,
          keyMaterialAddress: null,
          routeCursor: 0,
          notes: [],
          merkleLeaves: [],
          shieldedBalance: 0n,
          scanLoading: false,
          scanRefreshing: false,
          syncError: null,
          syncWarnings: [],
          transactions: [],
          scanCacheByPool: {},
        }),
      setNotes: (notes) => {
        const prev = get().notes;
        traceNotesUpdate("store:setNotes", prev, notes);
        set({ notes, shieldedBalance: shieldedTotal(notes) });
      },
      addNote: (note) => {
        const notes = mergeNotes(get().notes, [note]);
        set({ notes, shieldedBalance: shieldedTotal(notes) });
      },
      markNoteSpent: (id) => {
        const notes = get().notes.map((n) => (n.id === id ? { ...n, spent: true } : n));
        set({ notes, shieldedBalance: shieldedTotal(notes) });
      },
      setMerkleLeaves: (merkleLeaves) => set({ merkleLeaves }),
      patchNoteLeafIndices: (leaves) =>
        set((state) => ({
          notes: attachLeafIndices(state.notes, leaves),
        })),
      setShieldedBalance: (shieldedBalance) => set({ shieldedBalance }),
      setRevealBalances: (revealBalances) => set({ revealBalances }),
      setScanLoading: (scanLoading) => set({ scanLoading }),
      setScanRefreshing: (scanRefreshing) => set({ scanRefreshing }),
      setSyncError: (syncError) => set({ syncError }),
      setSyncWarnings: (syncWarnings) => set({ syncWarnings }),
      setRelayerOk: (relayerOk) => set({ relayerOk }),
      setScanCacheEntry: (key, payload) =>
        set((state) => ({
          scanCacheByPool: { ...state.scanCacheByPool, [key]: payloadToStoredRow(payload) },
        })),
      getScanCacheEntry: (key) => {
        const row = get().scanCacheByPool[key];
        if (!row) return null;
        return {
          viewingPub: row.viewingPub,
          lastScannedLedger: row.lastScannedLedger,
          lastFullScanAt: row.lastFullScanAt,
          deployLedger: row.deployLedger,
        };
      },
      bumpRouteCursor: () => {
        const cur = get().routeCursor;
        set({ routeCursor: cur + 1 });
        return cur;
      },
      addTransaction: (tx) => {
        const rest = get().transactions.filter((t) => t.id !== tx.id);
        set({ transactions: [tx, ...rest] });
      },
      updateTransaction: (id, patch) =>
        set({
          transactions: get().transactions.map((t) => (t.id === id ? { ...t, ...patch } : t)),
        }),
      setOnboardingDismissed: (onboardingDismissed) => set({ onboardingDismissed }),
    }),
    {
      name: "stellar-shielded-store",
      version: 2,
      migrate: (persisted) => {
        const state = persisted as Record<string, unknown>;
        delete state.notes;
        return state as ShieldedState;
      },
      partialize: (s) => ({
        network: s.network,
        spendingKey: s.spendingKey,
        viewingKey: s.viewingKey,
        viewingPub: s.viewingPub,
        ownerPk: s.ownerPk,
        keyMaterialAddress: s.keyMaterialAddress,
        routeCursor: s.routeCursor,
        // Notes are always rebuilt from on-chain route events — persisting them caused
        // stale partial balances (e.g. Brave showing only the latest incremental note).
        merkleLeaves: s.merkleLeaves,
        revealBalances: s.revealBalances,
        transactions: s.transactions,
        onboardingDismissed: s.onboardingDismissed,
        scanCacheByPool: s.scanCacheByPool,
      }),
      merge: (persisted, current) => {
        const p = persisted as Partial<ShieldedState> & {
          transactions?: TransactionRecord[];
        };
        const seenTx = new Set<string>();
        const transactions = (p.transactions ?? []).filter((tx) => {
          if (seenTx.has(tx.id)) return false;
          seenTx.add(tx.id);
          return true;
        });
        return {
          ...current,
          ...p,
          notes: [],
          shieldedBalance: 0n,
          transactions,
        };
      },
    }
  )
);
