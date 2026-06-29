import { rpc, contract } from "@stellar/stellar-sdk";

import { Client as MerkleTreeClient } from "@stellar-shielded/contract-clients/merkle-tree";
import { Client as MockTokenClient } from "@stellar-shielded/contract-clients/mock-token";
import { Client as ShieldedPoolClient } from "@stellar-shielded/contract-clients/shielded-pool";

import type { NetworkConfig } from "../lib/types";
import { uniqueRpcUrls } from "../lib/rpc-events";
import { extensionSigners } from "../vault/session";
import {
  fetchAccountSequence,
  formatStellarSubmitError,
  isBadSequenceError,
  waitForSequenceAtLeast,
} from "./account-sequence";
import { withWalletTxLock } from "./tx-queue";

const { Api } = rpc;

export type SorobanRpc = rpc.Server;
type ClientOptions = contract.ClientOptions;
type AssembledTransaction<T> = contract.AssembledTransaction<T>;

function baseOptions(
  config: NetworkConfig,
  contractId: string,
  publicKey: string,
  rpcClient?: SorobanRpc,
  withSigner = false
): ClientOptions {
  return {
    contractId,
    networkPassphrase: config.networkPassphrase,
    rpcUrl: config.rpcUrl,
    allowHttp: config.rpcUrl.startsWith("http://"),
    publicKey,
    ...(rpcClient ? { server: rpcClient } : {}),
    ...(withSigner ? extensionSigners(config.networkPassphrase) : {}),
  };
}

export function mockTokenClient(
  config: NetworkConfig,
  publicKey: string,
  tokenId: string,
  rpcClient?: SorobanRpc,
  withSigner = false
) {
  return new MockTokenClient(baseOptions(config, tokenId, publicKey, rpcClient, withSigner));
}

export function shieldedPoolClient(
  config: NetworkConfig,
  publicKey: string,
  poolId: string,
  rpcClient?: SorobanRpc,
  withSigner = false
) {
  return new ShieldedPoolClient(baseOptions(config, poolId, publicKey, rpcClient, withSigner));
}

export function merkleTreeClient(
  config: NetworkConfig,
  publicKey: string,
  merkleId: string,
  rpcClient?: SorobanRpc,
  withSigner = false
) {
  return new MerkleTreeClient(baseOptions(config, merkleId, publicKey, rpcClient, withSigner));
}

export async function waitForTransactionSuccess(
  config: NetworkConfig,
  txHash: string,
  deadlineMs = 120_000,
  preferredRpc?: SorobanRpc
): Promise<void> {
  const deadline = Date.now() + deadlineMs;
  const urls = uniqueRpcUrls(config);

  while (Date.now() < deadline) {
    if (preferredRpc) {
      try {
        const status = await preferredRpc.getTransaction(txHash);
        if (status.status === Api.GetTransactionStatus.SUCCESS) return;
        if (status.status === Api.GetTransactionStatus.FAILED) {
          throw new Error(`Transaction failed on-chain (${txHash.slice(0, 12)}…)`);
        }
      } catch (e) {
        if (e instanceof Error && e.message.includes("failed on-chain")) throw e;
      }
    }
    for (const rpcUrl of urls) {
      const rpcClient = new rpc.Server(rpcUrl, { allowHttp: rpcUrl.startsWith("http://") });
      try {
        const status = await rpcClient.getTransaction(txHash);
        if (status.status === Api.GetTransactionStatus.SUCCESS) return;
        if (status.status === Api.GetTransactionStatus.FAILED) {
          throw new Error(`Transaction failed on-chain (${txHash.slice(0, 12)}…)`);
        }
      } catch (e) {
        if (e instanceof Error && e.message.includes("failed on-chain")) throw e;
      }
    }
    await new Promise((r) => setTimeout(r, 2000));
  }

  throw new Error(
    `Transaction not confirmed after ${Math.round(deadlineMs / 1000)}s — verify ${txHash.slice(0, 12)}…`
  );
}

export async function sendSigned<T>(
  assembled: AssembledTransaction<T>,
  rpcClient: SorobanRpc,
  config?: NetworkConfig,
  sourceAccount?: string
): Promise<string> {
  const seqBefore =
    sourceAccount != null ? await fetchAccountSequence(rpcClient, sourceAccount) : null;

  if (assembled.needsNonInvokerSigningBy().length > 0) {
    await assembled.signAuthEntries();
  }
  await assembled.sign();
  const tx = assembled.signed;
  if (!tx) throw new Error("Transaction signing failed");

  const send = await rpcClient.sendTransaction(tx);
  if (send.status === "ERROR") throw formatStellarSubmitError(send);
  const hash = send.hash;
  if (!hash) throw new Error("No transaction hash returned");

  if (config) {
    await waitForTransactionSuccess(config, hash, 120_000, rpcClient);
    if (sourceAccount != null && seqBefore != null) {
      await waitForSequenceAtLeast(rpcClient, sourceAccount, seqBefore + 1n);
    }
    return hash;
  }

  const deadline = Date.now() + 90_000;
  let status = await rpcClient.getTransaction(hash);
  while (status.status === Api.GetTransactionStatus.NOT_FOUND && Date.now() < deadline) {
    await new Promise((r) => setTimeout(r, 1500));
    status = await rpcClient.getTransaction(hash);
  }

  if (status.status === Api.GetTransactionStatus.NOT_FOUND) {
    throw new Error(`Transaction not indexed after 90s (${hash.slice(0, 12)}…)`);
  }
  if (status.status !== Api.GetTransactionStatus.SUCCESS) {
    throw new Error(`Transaction failed: ${status.status}`);
  }
  if (sourceAccount != null && seqBefore != null) {
    await waitForSequenceAtLeast(rpcClient, sourceAccount, seqBefore + 1n);
  }
  return hash;
}

/** Re-simulate and retry when the network rejects a stale sequence (txBadSeq). */
export async function sendSignedWithRetry<T>(
  buildTx: () => Promise<AssembledTransaction<T>>,
  rpcClient: SorobanRpc,
  config: NetworkConfig,
  sourceAccount: string,
  maxAttempts = 4
): Promise<string> {
  return withWalletTxLock(async () => {
    let lastError: Error | null = null;
    for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
      if (attempt > 0) {
        await new Promise((r) => setTimeout(r, 1500 * attempt));
      }
      try {
        const assembled = await buildTx();
        return await sendSigned(assembled, rpcClient, config, sourceAccount);
      } catch (err) {
        lastError = err instanceof Error ? err : new Error(String(err));
        if (!isBadSequenceError(lastError) || attempt === maxAttempts - 1) {
          throw lastError;
        }
      }
    }
    throw lastError ?? new Error("Transaction failed");
  });
}
