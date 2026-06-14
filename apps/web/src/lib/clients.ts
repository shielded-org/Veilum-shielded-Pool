import { rpc, contract } from "@stellar/stellar-sdk";

import { Client as MerkleTreeClient } from "@stellar-shielded/contract-clients/merkle-tree";
import { Client as MockTokenClient } from "@stellar-shielded/contract-clients/mock-token";
import { Client as ShieldedPoolClient } from "@stellar-shielded/contract-clients/shielded-pool";

import type { NetworkConfig } from "./types";
import { walletKitSigners } from "./wallet-kit";

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

/** Sign, submit, and poll until confirmed (or return hash if RPC indexing lags). */
export async function sendSigned<T>(
  assembled: AssembledTransaction<T>,
  rpcClient: SorobanRpc
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

  const deadline = Date.now() + 90_000;
  let status = await rpcClient.getTransaction(hash);
  while (status.status === Api.GetTransactionStatus.NOT_FOUND && Date.now() < deadline) {
    await new Promise((r) => setTimeout(r, 1500));
    status = await rpcClient.getTransaction(hash);
  }

  if (status.status === Api.GetTransactionStatus.NOT_FOUND) {
    return hash;
  }
  if (status.status !== Api.GetTransactionStatus.SUCCESS) {
    throw new Error(`Transaction failed: ${status.status}`);
  }
  return hash;
}
