import { rpc, contract } from "@stellar/stellar-sdk";

import { Client as MerkleTreeClient } from "@stellar-shielded/contract-clients/merkle-tree";
import { Client as MockTokenClient } from "@stellar-shielded/contract-clients/mock-token";
import { Client as ShieldedPoolClient } from "@stellar-shielded/contract-clients/shielded-pool";

import type { NetworkConfig } from "./types";
import { walletKitSigners } from "./wallet-kit";
import { uniqueRpcUrls } from "./rpc-events";

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
    ...(withSigner ? walletKitSigners(config.networkPassphrase) : {}),
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

/** Poll multiple RPC mirrors until a submitted transaction is confirmed or fails. */
export async function waitForTransactionSuccess(
  config: NetworkConfig,
  txHash: string,
  deadlineMs = 120_000
): Promise<void> {
  const deadline = Date.now() + deadlineMs;
  const urls = uniqueRpcUrls(config);

  while (Date.now() < deadline) {
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
    `Transaction not confirmed on-chain after ${Math.round(deadlineMs / 1000)}s — verify ${txHash.slice(0, 12)}… before retrying`
  );
}

/** Sign, submit, and poll until confirmed. */
export async function sendSigned<T>(
  assembled: AssembledTransaction<T>,
  rpcClient: SorobanRpc,
  config?: NetworkConfig
): Promise<string> {
  // Only sign Soroban custom auth entries when simulation recorded them (e.g. token
  // approvals for other accounts). Simple invoker-only calls like mint() must skip
  // this — otherwise the wallet throws "No unsigned non-invoker auth entries".
  if (assembled.needsNonInvokerSigningBy().length > 0) {
    await assembled.signAuthEntries();
  }
  await assembled.sign();
  const tx = assembled.signed;
  if (!tx) throw new Error("Transaction signing failed");

  const send = await rpcClient.sendTransaction(tx);
  if (send.status === "ERROR") throw new Error(JSON.stringify(send));
  const hash = send.hash;
  if (!hash) throw new Error("No transaction hash returned");

  if (config) {
    await waitForTransactionSuccess(config, hash);
    return hash;
  }

  const deadline = Date.now() + 90_000;
  let status = await rpcClient.getTransaction(hash);
  while (status.status === Api.GetTransactionStatus.NOT_FOUND && Date.now() < deadline) {
    await new Promise((r) => setTimeout(r, 1500));
    status = await rpcClient.getTransaction(hash);
  }

  if (status.status === Api.GetTransactionStatus.NOT_FOUND) {
    throw new Error(
      `Transaction not indexed after 90s — verify ${hash.slice(0, 12)}… on-chain before assuming success`
    );
  }
  if (status.status !== Api.GetTransactionStatus.SUCCESS) {
    throw new Error(`Transaction failed: ${status.status}`);
  }
  return hash;
}
