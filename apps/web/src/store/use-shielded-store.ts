import { create } from "zustand";
import { persist } from "zustand/middleware";

import type { DecryptedNote, Hex32, NetworkName, TransactionRecord } from "../lib/types";
import { attachLeafIndices } from "../lib/merkle-sync";
import { mergeNotes, shieldedTotal } from "../lib/note-store";
import { serializeNotes } from "../lib/note-persist";
import { traceNotesUpdate } from "../lib/notes-trace";
import type { StoredScanCacheRow } from "../lib/scan-cache";
import { payloadToStoredRow } from "../lib/scan-cache";
import type { ScanCachePayload } from "../lib/scan-cache";
import { EMPTY_WALLET_TRANSACTIONS } from "../lib/empty-transactions";
import { sortTransactionsNewestFirst } from "../lib/utils";

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
  /** True after first chain-verified balance apply this session — avoids stale cache flash. */
  notesChainReady: boolean;
  syncError: string | null;
  syncWarnings: string[];
  relayerOk: boolean;
  /** Recent activity keyed by connected wallet address. */
  transactionsByWallet: Record<string, TransactionRecord[]>;
  onboardingDismissed: boolean;
  /** Incremental route-event scan cache per pool (cursor + notes). */
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
  setNotesChainReady: (v: boolean) => void;
  setSyncError: (v: string | null) => void;
  setSyncWarnings: (v: string[]) => void;
  setRelayerOk: (v: boolean) => void;
  setScanCacheEntry: (key: string, payload: ScanCachePayload) => void;
  getScanCacheEntry: (key: string) => ScanCachePayload | null;
  bumpRouteCursor: () => number;
  getWalletTransactions: (wallet: string) => TransactionRecord[];
  addTransaction: (wallet: string, tx: TransactionRecord) => void;
  updateTransaction: (wallet: string, id: string, patch: Partial<TransactionRecord>) => void;
  setOnboardingDismissed: (v: boolean) => void;
};

type PersistedShieldedState = {
  notes?: ReturnType<typeof serializeNotes>;
  scanCacheByPool?: Record<string, StoredScanCacheRow & { notes?: StoredScanCacheRow["notes"] }>;
  transactionsByWallet?: Record<string, TransactionRecord[]>;
  /** @deprecated v5 — migrated to transactionsByWallet */
  transactions?: TransactionRecord[];
};

function dedupeTransactions(rows: TransactionRecord[]): TransactionRecord[] {
  const seen = new Set<string>();
  return rows.filter((tx) => {
    if (seen.has(tx.id)) return false;
    seen.add(tx.id);
    return true;
  });
}

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
      notesChainReady: false,
      syncError: null,
      syncWarnings: [],
      relayerOk: false,
      transactionsByWallet: {},
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
          notes: [],
          shieldedBalance: 0n,
          notesChainReady: false,
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
          notesChainReady: false,
        }),
      resetWalletSession: () =>
        set((state) => ({
          spendingKey: "",
          viewingKey: "",
          viewingPub: null,
          ownerPk: null,
          keyMaterialAddress: null,
          routeCursor: 0,
          notes: [],
          merkleLeaves: [],
          shieldedBalance: 0n,
          notesChainReady: false,
          scanLoading: false,
          scanRefreshing: false,
          syncError: null,
          syncWarnings: [],
          transactionsByWallet: state.transactionsByWallet,
          scanCacheByPool: state.scanCacheByPool,
        })),
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
      setNotesChainReady: (notesChainReady) => set({ notesChainReady }),
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
          notesChainVerified: row.notesChainVerified === true,
          notes: row.notesChainVerified === true ? (row.notes ?? []) : [],
        };
      },
      bumpRouteCursor: () => {
        const cur = get().routeCursor;
        set({ routeCursor: cur + 1 });
        return cur;
      },
      getWalletTransactions: (wallet) => {
        if (!wallet) return EMPTY_WALLET_TRANSACTIONS;
        const rows = get().transactionsByWallet[wallet];
        if (!rows?.length) return EMPTY_WALLET_TRANSACTIONS;
        return sortTransactionsNewestFirst(rows);
      },
      addTransaction: (wallet, tx) => {
        if (!wallet) return;
        const row = { ...tx, walletAddress: wallet };
        const existing = get().transactionsByWallet[wallet] ?? [];
        const rest = existing.filter((t) => t.id !== row.id);
        set({
          transactionsByWallet: {
            ...get().transactionsByWallet,
            [wallet]: sortTransactionsNewestFirst(dedupeTransactions([...rest, row])),
          },
        });
      },
      updateTransaction: (wallet, id, patch) => {
        if (!wallet) return;
        const existing = get().transactionsByWallet[wallet] ?? [];
        if (!existing.some((t) => t.id === id)) return;
        set({
          transactionsByWallet: {
            ...get().transactionsByWallet,
            [wallet]: sortTransactionsNewestFirst(
              existing.map((t) => (t.id === id ? { ...t, ...patch, walletAddress: wallet } : t))
            ),
          },
        });
      },
      setOnboardingDismissed: (onboardingDismissed) => set({ onboardingDismissed }),
    }),
    {
      name: "stellar-shielded-store",
      version: 6,
      migrate: (persisted, version) => {
        const state = persisted as PersistedShieldedState & Record<string, unknown>;
        if (version < 3) {
          state.notes = serializeNotes([]);
        }
        const cache = state.scanCacheByPool ?? {};
        for (const key of Object.keys(cache)) {
          const row = cache[key];
          if (!row) continue;
          if (!Array.isArray(row.notes)) {
            row.notes = [];
          }
          if (version < 4 && row.notes.length === 0) {
            row.lastScannedLedger = 0;
          }
          if (version < 5) {
            row.notesChainVerified = false;
            row.notes = [];
            if (row.lastScannedLedger > 0 && row.notes.length === 0) {
              row.lastScannedLedger = 0;
            }
          }
        }
        if (version < 5) {
          state.notes = serializeNotes([]);
        }
        state.scanCacheByPool = cache;

        if (version < 6) {
          const legacy = (state.transactions as TransactionRecord[] | undefined) ?? [];
          const byWallet: Record<string, TransactionRecord[]> = { ...(state.transactionsByWallet ?? {}) };
          const fallbackWallet =
            (state.keyMaterialAddress as string | undefined) ??
            legacy.find((t) => t.walletAddress)?.walletAddress ??
            "_legacy";
          if (legacy.length > 0) {
            const migrated = legacy.map((t) => ({
              ...t,
              walletAddress: t.walletAddress ?? fallbackWallet,
            }));
            byWallet[fallbackWallet] = sortTransactionsNewestFirst(
              dedupeTransactions([...migrated, ...(byWallet[fallbackWallet] ?? [])])
            );
          }
          state.transactionsByWallet = byWallet;
          delete state.transactions;
        }

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
        merkleLeaves: s.merkleLeaves,
        revealBalances: s.revealBalances,
        transactionsByWallet: s.transactionsByWallet,
        onboardingDismissed: s.onboardingDismissed,
        scanCacheByPool: s.scanCacheByPool,
      }),
      merge: (persisted, current) => {
        const p = persisted as PersistedShieldedState & Partial<ShieldedState>;
        const scanCacheByPool = p.scanCacheByPool ?? {};
        for (const key of Object.keys(scanCacheByPool)) {
          const row = scanCacheByPool[key];
          if (!row) continue;
          if (!Array.isArray(row.notes)) {
            row.notes = [];
          }
          if (row.notesChainVerified !== true) {
            row.notes = [];
          }
        }
        const transactionsByWallet: Record<string, TransactionRecord[]> = {};
        for (const [wallet, rows] of Object.entries(p.transactionsByWallet ?? {})) {
          transactionsByWallet[wallet] = sortTransactionsNewestFirst(dedupeTransactions(rows ?? []));
        }
        return {
          ...current,
          ...p,
          notes: [],
          shieldedBalance: 0n,
          transactionsByWallet,
          scanCacheByPool,
          scanLoading: false,
          scanRefreshing: false,
          notesChainReady: false,
        };
      },
    }
  )
);
