import { finishShieldedTransaction, recoverBalanceFromChain } from "./sync-shielded-now";
import { contractSuccess, finishNotify, notifyLoading } from "./notify";
import {
  mapStatusMessageToTxStep,
  txProgressLabel,
  txProgressPercent,
} from "./tx-progress";
import type { TxProgressStep } from "./types";
import { useShieldedStore } from "../store/use-shielded-store";
import { useTxPanelStore } from "../store/use-tx-panel-store";

type ProgressPatch = {
  progressStep: TxProgressStep;
  progressMessage: string;
  progressPercent: number;
};

function progressPatch(step: TxProgressStep, message: string): ProgressPatch {
  return {
    progressStep: step,
    progressMessage: message,
    progressPercent: txProgressPercent(step),
  };
}

function makeOnStatus(
  wallet: string,
  txId: string,
  updateTransaction: ReturnType<typeof useShieldedStore.getState>["updateTransaction"]
): (message: string) => void {
  let lastStep: TxProgressStep = "prepare";
  return (message: string) => {
    const mapped = mapStatusMessageToTxStep(message);
    const step = mapped ?? lastStep;
    if (mapped) lastStep = mapped;
    updateTransaction(wallet, txId, progressPatch(step, message));
  };
}

export type TransferJobParams = {
  wallet: string;
  txId: string;
  amountLabel: string;
  run: (onStatus: (message: string) => void) => Promise<{
    txHash?: string | null;
    spentNoteId: string;
    contractId: string;
  }>;
};

export type UnshieldJobParams = {
  wallet: string;
  txId: string;
  amountLabel: string;
  run: (onStatus: (message: string) => void) => Promise<{
    txHash?: string | null;
    spentNoteId: string;
    contractId: string;
  }>;
};

export type ShieldJobParams = {
  wallet: string;
  txId: string;
  amountLabel: string;
  tokenSymbol: string;
  amount: string;
  onAfterDeposit?: () => void | Promise<void>;
  run: (onStatus: (message: string) => void) => Promise<{
    txHash?: string | null;
    contractId: string;
  }>;
};

function startJobToast(label: string) {
  return notifyLoading(label);
}

/** Fire-and-forget private transfer — updates store + progress panel; user can navigate away. */
export function runTransferJob(params: TransferJobParams): void {
  const { wallet, txId } = params;
  const store = useShieldedStore.getState();
  const toast = startJobToast("Private transfer in progress…");
  useTxPanelStore.getState().openTxPanel(txId);

  store.updateTransaction(wallet, txId, progressPatch("prepare", "Starting private transfer…"));

  void (async () => {
    const onStatus = makeOnStatus(wallet, txId, store.updateTransaction);
    try {
      onStatus("Generating proof and submitting…");
      const result = await params.run(onStatus);

      store.updateTransaction(wallet, txId, {
        txHash: result.txHash ?? undefined,
        contractId: result.contractId,
        spentNoteId: result.spentNoteId,
        ...progressPatch("sync", "Updating balance from chain…"),
      });

      const { balanceVerified } = await finishShieldedTransaction({
        spentNoteId: result.spentNoteId,
        syncMerkle: true,
        onStatus,
      });

      store.bumpRouteCursor();
      store.updateTransaction(wallet, txId, {
        status: "confirmed",
        ...(balanceVerified ? {} : { detail: "Balance synced from chain" }),
        ...progressPatch("done", balanceVerified ? "Transfer complete" : "Confirmed — balance syncing"),
      });

      const success = contractSuccess.transfer();
      finishNotify(toast, {
        ok: true,
        title: success.title,
        detail: balanceVerified ? success.detail : "Confirmed on-chain. Balance updated from indexer.",
        txHash: result.txHash,
      });
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      store.updateTransaction(wallet, txId, progressPatch("sync", "Restoring balance from chain…"));
      await recoverBalanceFromChain();
      store.updateTransaction(wallet, txId, {
        status: "failed",
        detail: message,
        ...progressPatch("done", "Transfer failed"),
      });
      finishNotify(toast, { ok: false, message });
    }
  })();
}

export function runUnshieldJob(params: UnshieldJobParams): void {
  const { wallet, txId } = params;
  const store = useShieldedStore.getState();
  const toast = startJobToast("Withdrawal in progress…");
  useTxPanelStore.getState().openTxPanel(txId);

  store.updateTransaction(wallet, txId, progressPatch("prepare", "Starting withdrawal…"));

  void (async () => {
    const onStatus = makeOnStatus(wallet, txId, store.updateTransaction);
    try {
      onStatus("Generating proof and submitting…");
      const result = await params.run(onStatus);

      store.updateTransaction(wallet, txId, {
        txHash: result.txHash ?? undefined,
        contractId: result.contractId,
        spentNoteId: result.spentNoteId,
        ...progressPatch("sync", "Updating balance from chain…"),
      });

      const { balanceVerified } = await finishShieldedTransaction({
        spentNoteId: result.spentNoteId,
        syncMerkle: true,
        onStatus,
      });

      store.bumpRouteCursor();
      store.updateTransaction(wallet, txId, {
        status: "confirmed",
        ...(balanceVerified ? {} : { detail: "Balance synced from chain" }),
        ...progressPatch("done", balanceVerified ? "Withdrawal complete" : "Confirmed — balance syncing"),
      });

      const success = contractSuccess.unshield();
      finishNotify(toast, {
        ok: true,
        title: success.title,
        detail: balanceVerified ? success.detail : "Confirmed on-chain. Balance updated from indexer.",
        txHash: result.txHash,
      });
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      store.updateTransaction(wallet, txId, progressPatch("sync", "Restoring balance from chain…"));
      await recoverBalanceFromChain();
      store.updateTransaction(wallet, txId, {
        status: "failed",
        detail: message,
        ...progressPatch("done", "Withdrawal failed"),
      });
      finishNotify(toast, { ok: false, message });
    }
  })();
}

export function runShieldJob(params: ShieldJobParams): void {
  const { wallet, txId, amount, tokenSymbol } = params;
  const store = useShieldedStore.getState();
  const toast = startJobToast("Shield deposit in progress…");
  useTxPanelStore.getState().openTxPanel(txId);

  store.updateTransaction(wallet, txId, progressPatch("prepare", "Starting shield deposit…"));

  void (async () => {
    const onStatus = makeOnStatus(wallet, txId, store.updateTransaction);
    try {
      onStatus("Submitting deposit…");
      const result = await params.run(onStatus);

      store.updateTransaction(wallet, txId, {
        txHash: result.txHash ?? undefined,
        contractId: result.contractId,
        ...progressPatch("sync", "Scanning for new note…"),
      });

      if (params.onAfterDeposit) await params.onAfterDeposit();

      const { balanceVerified } = await finishShieldedTransaction({
        syncMerkle: false,
        onStatus,
      });

      store.bumpRouteCursor();
      store.updateTransaction(wallet, txId, {
        status: "confirmed",
        ...(balanceVerified ? {} : { detail: "Balance synced from chain" }),
        ...progressPatch("done", balanceVerified ? "Shield complete" : "Deposit confirmed — balance syncing"),
      });

      const success = contractSuccess.shield(amount, tokenSymbol);
      finishNotify(toast, {
        ok: true,
        title: success.title,
        detail: balanceVerified ? success.detail : "Deposit confirmed. Balance updated from indexer.",
        txHash: result.txHash,
      });
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      store.updateTransaction(wallet, txId, progressPatch("sync", "Restoring balance from chain…"));
      await recoverBalanceFromChain();
      store.updateTransaction(wallet, txId, {
        status: "failed",
        detail: message,
        ...progressPatch("done", "Shield failed"),
      });
      finishNotify(toast, { ok: false, message });
    }
  })();
}

export { txProgressLabel };
