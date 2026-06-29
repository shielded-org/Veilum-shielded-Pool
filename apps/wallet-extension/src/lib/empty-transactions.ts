import type { TransactionRecord } from "./types";

/** Stable empty list — Zustand selectors must not return a new [] each snapshot. */
export const EMPTY_WALLET_TRANSACTIONS: TransactionRecord[] = [];
