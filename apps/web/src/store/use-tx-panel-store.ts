import { create } from "zustand";

type TxPanelState = {
  activeTxId: string | null;
  minimized: boolean;
  openTxPanel: (txId: string) => void;
  minimizePanel: () => void;
  expandPanel: () => void;
  closePanel: () => void;
};

export const useTxPanelStore = create<TxPanelState>((set) => ({
  activeTxId: null,
  minimized: false,
  openTxPanel: (txId) => set({ activeTxId: txId, minimized: false }),
  minimizePanel: () => set({ minimized: true }),
  expandPanel: () => set({ minimized: false }),
  closePanel: () => set({ activeTxId: null, minimized: false }),
}));
