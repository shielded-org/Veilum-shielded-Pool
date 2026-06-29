import { rpc } from "@stellar/stellar-sdk";

const { Api: SorobanApi } = rpc;

import type { NetworkConfig } from "./types";
import { fetchIndexerTxLeaves } from "./pool-indexer";
import {
  createRpc,
  waitForMerkleNextIndexAtLeast,
  waitForNullifierSpent,
  type SorobanRpc,
} from "./soroban";
import { bytes32Arg } from "./utils";

const TX_POLL_ATTEMPTS = 12;
const TX_POLL_DELAY_MS = 1500;

function delay(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

/** Poll until Soroban RPC reports the transaction succeeded. */
export async function waitForTransactionSuccess(
  rpcClient: SorobanRpc,
  txHash: string,
  onStatus?: (message: string) => void
): Promise<void> {
  for (let attempt = 0; attempt < TX_POLL_ATTEMPTS; attempt += 1) {
    try {
      const txStatus = await rpcClient.getTransaction(txHash);
      if (txStatus.status === SorobanApi.GetTransactionStatus.SUCCESS) {
        return;
      }
      if (txStatus.status === SorobanApi.GetTransactionStatus.FAILED) {
        throw new Error("Transaction failed on-chain");
      }
    } catch (e) {
      if (e instanceof Error && e.message === "Transaction failed on-chain") {
        throw e;
      }
    }

    if (attempt === 0) {
      onStatus?.("Transaction submitted — waiting on network provider…");
    } else {
      onStatus?.(`Processing on-chain… (${attempt + 1}/${TX_POLL_ATTEMPTS})`);
    }
    if (attempt < TX_POLL_ATTEMPTS - 1) {
      await delay(TX_POLL_DELAY_MS);
    }
  }

  throw new Error(
    "Transaction not visible on the network yet. Check the dashboard in a moment — it may still be processing."
  );
}

/** Poll nullifier_spent with user-visible retry status (RPC often lags behind tx success). */
export async function confirmNullifierSpent(
  rpcClient: SorobanRpc,
  config: NetworkConfig,
  wallet: string,
  poolId: string,
  nullifierHex: string,
  onStatus?: (message: string) => void
): Promise<boolean> {
  onStatus?.("Confirming spend on-chain…");

  const spent = await waitForNullifierSpent(
    rpcClient,
    config,
    wallet,
    poolId,
    nullifierHex,
    {
      attempts: 15,
      delayMs: 1500,
      onWaiting: ({ attempt, attempts }) => {
        if (attempt === 0) {
          onStatus?.("Waiting on network provider…");
        } else if (attempt < 4) {
          onStatus?.("Still confirming spend on-chain…");
        } else {
          onStatus?.(`Processing… confirming spend (${attempt + 1}/${attempts})`);
        }
      },
    }
  );

  if (!spent) {
    onStatus?.("Network catching up — syncing balance next…");
  }

  return spent;
}

/** After relayer returns a tx hash, wait for on-chain success + nullifier (best-effort). */
export async function confirmShieldedSpendApplied(params: {
  config: NetworkConfig;
  wallet: string;
  poolId: string;
  txHash: string;
  nullifierHex: string;
  onStatus?: (message: string) => void;
}): Promise<{ txSucceeded: boolean; nullifierConfirmed: boolean }> {
  const rpcClient = createRpc(params.config);
  const txHash = params.txHash.replace(/^0x/i, "").toLowerCase();

  await waitForTransactionSuccess(rpcClient, txHash, params.onStatus);
  const nullifierConfirmed = await confirmNullifierSpent(
    rpcClient,
    params.config,
    params.wallet,
    params.poolId,
    params.nullifierHex,
    params.onStatus
  );

  return { txSucceeded: true, nullifierConfirmed };
}

function normalizeTxHash(txHash: string): string {
  return txHash.replace(/^0x/i, "").toLowerCase();
}

function indexerLeavesForTx(
  leaves: Record<string, string[]>,
  txHash: string
): string[] | undefined {
  const normalized = normalizeTxHash(txHash);
  return (
    leaves[normalized] ??
    leaves[txHash] ??
    leaves[normalized.toUpperCase()] ??
    Object.entries(leaves).find(([key]) => normalizeTxHash(key) === normalized)?.[1]
  );
}

/** After shield_routed returns, wait for merkle growth (RPC + indexer fallback). */
export async function confirmShieldDepositApplied(params: {
  config: NetworkConfig;
  wallet: string;
  poolId: string;
  merkleTree: string;
  txHash: string;
  expectedLeafIndex: number;
  commitment: string;
  onStatus?: (message: string) => void;
}): Promise<{ leafIndex: number }> {
  const rpcClient = createRpc(params.config);
  const txHash = normalizeTxHash(params.txHash);
  const commitmentNorm = bytes32Arg(params.commitment).toLowerCase();

  params.onStatus?.("Confirming shield deposit on-chain…");

  try {
    const txStatus = await rpcClient.getTransaction(txHash);
    if (txStatus.status === SorobanApi.GetTransactionStatus.FAILED) {
      throw new Error("Shield transaction failed on-chain — deposit was not applied");
    }
  } catch (e) {
    if (e instanceof Error && e.message.includes("failed on-chain")) throw e;
  }

  const nextIndex = await waitForMerkleNextIndexAtLeast(
    rpcClient,
    params.config,
    params.wallet,
    params.merkleTree,
    params.expectedLeafIndex,
    {
      attempts: 20,
      delayMs: 1500,
      onWaiting: ({ attempt, attempts }) => {
        if (attempt === 0) {
          params.onStatus?.("Waiting for merkle tree update…");
        } else {
          params.onStatus?.(`Confirming deposit (${attempt + 1}/${attempts})…`);
        }
      },
    }
  );
  if (nextIndex != null) {
    return { leafIndex: params.expectedLeafIndex };
  }

  const indexerLeaves = await fetchIndexerTxLeaves(params.poolId, [txHash]);
  const txLeaves = indexerLeavesForTx(indexerLeaves, txHash);
  if (
    txLeaves?.some((leaf) => leaf.replace(/^0x/i, "").toLowerCase() === commitmentNorm)
  ) {
    params.onStatus?.("Deposit confirmed via indexer");
    return { leafIndex: params.expectedLeafIndex };
  }

  const finalTx = await rpcClient.getTransaction(txHash);
  if (finalTx.status === SorobanApi.GetTransactionStatus.FAILED) {
    throw new Error("Shield transaction failed on-chain — deposit was not applied");
  }
  if (finalTx.status !== SorobanApi.GetTransactionStatus.SUCCESS) {
    throw new Error(
      "Shield deposit is still confirming — check Activity and refresh in a moment."
    );
  }

  throw new Error(
    "Shield transaction did not insert a merkle leaf on-chain — your deposit was not applied; public tokens were not moved into the pool"
  );
}
