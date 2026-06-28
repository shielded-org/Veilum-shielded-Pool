import type { TransactionRecord } from "../lib/types";
import { EMPTY_WALLET_TRANSACTIONS } from "../lib/empty-transactions";
import { useShieldedStore } from "../store/use-shielded-store";
import { useWallet } from "./use-wallet";

/** Recent activity for the currently connected wallet address (newest first). */
export function useWalletTransactions(): TransactionRecord[] {
  const { address: wallet } = useWallet();
  return useShieldedStore((s) =>
    wallet ? (s.transactionsByWallet[wallet] ?? EMPTY_WALLET_TRANSACTIONS) : EMPTY_WALLET_TRANSACTIONS
  );
}

export function useWalletTransaction(txId: string | null): TransactionRecord | null {
  const { address: wallet } = useWallet();
  return useShieldedStore((s) => {
    if (!wallet || !txId) return null;
    const rows = s.transactionsByWallet[wallet] ?? EMPTY_WALLET_TRANSACTIONS;
    return rows.find((t) => t.id === txId) ?? null;
  });
}
