import { rpc } from "@stellar/stellar-sdk";

import {
  merkleTreeClient,
  mockTokenClient,
  sendSigned,
  shieldedPoolClient,
  type SorobanRpc,
} from "./clients";
import type { NetworkConfig } from "./types";
import { bytes32Arg } from "./utils";
import {
  connectWallet,
  ensureWalletNetwork,
  initWalletKit,
  signWalletMessage,
} from "./wallet-kit";

export { type SorobanRpc };

export { connectWallet, ensureWalletNetwork, initWalletKit, signWalletMessage };

/** @deprecated Use connectWallet */
export const connectFreighter = connectWallet;
/** @deprecated Use ensureWalletNetwork */
export const ensureFreighterNetwork = ensureWalletNetwork;

export function createRpc(config: NetworkConfig): SorobanRpc {
  return new rpc.Server(config.rpcUrl, { allowHttp: config.rpcUrl.startsWith("http://") });
}

function bufferFromHex32(hex: string): Buffer {
  return Buffer.from(bytes32Arg(hex), "hex");
}

function bufferFromHex(hex: string): Buffer {
  return Buffer.from(hex.replace(/^0x/, ""), "hex");
}

function hexFromBuffer(buf: Buffer): `0x${string}` {
  return `0x${buf.toString("hex")}` as `0x${string}`;
}

export async function getTokenBalance(
  rpcClient: SorobanRpc,
  config: NetworkConfig,
  source: string,
  tokenId: string,
  owner: string
): Promise<bigint> {
  const client = mockTokenClient(config, source, tokenId, rpcClient);
  const tx = await client.balance({ id: owner });
  return tx.result!;
}

export async function getTokenDecimals(
  rpcClient: SorobanRpc,
  config: NetworkConfig,
  source: string,
  tokenId: string
): Promise<number> {
  const client = mockTokenClient(config, source, tokenId, rpcClient);
  const tx = await client.decimals();
  return Number(tx.result ?? 7);
}

export async function getMerkleRoot(
  rpcClient: SorobanRpc,
  config: NetworkConfig,
  source: string,
  merkleId: string
): Promise<`0x${string}`> {
  const client = merkleTreeClient(config, source, merkleId, rpcClient);
  const tx = await client.get_last_root();
  return hexFromBuffer(tx.result!);
}

export async function getMerkleNextIndex(
  rpcClient: SorobanRpc,
  config: NetworkConfig,
  source: string,
  merkleId: string
): Promise<number> {
  const client = merkleTreeClient(config, source, merkleId, rpcClient);
  const tx = await client.get_next_index();
  return Number(tx.result!);
}

export async function merkleIsKnownRoot(
  rpcClient: SorobanRpc,
  config: NetworkConfig,
  source: string,
  merkleId: string,
  root: string
): Promise<boolean> {
  const client = merkleTreeClient(config, source, merkleId, rpcClient);
  const tx = await client.is_known_root({ root: bufferFromHex32(root) });
  return Boolean(tx.result);
}

export async function merkleHash2(
  rpcClient: SorobanRpc,
  config: NetworkConfig,
  source: string,
  merkleId: string,
  left: string,
  right: string
): Promise<`0x${string}`> {
  const client = merkleTreeClient(config, source, merkleId, rpcClient);
  const tx = await client.hash2({
    left: bufferFromHex32(left),
    right: bufferFromHex32(right),
  });
  return hexFromBuffer(tx.result!);
}

export async function nullifierSpent(
  rpcClient: SorobanRpc,
  config: NetworkConfig,
  source: string,
  poolId: string,
  nullifierHex: string
): Promise<boolean> {
  const client = shieldedPoolClient(config, source, poolId, rpcClient);
  const tx = await client.nullifier_spent({ nullifier: bufferFromHex32(nullifierHex) });
  return Boolean(tx.result);
}

export async function mintToken(
  rpcClient: SorobanRpc,
  config: NetworkConfig,
  caller: string,
  tokenId: string,
  to: string,
  amount: bigint
): Promise<string> {
  const client = mockTokenClient(config, caller, tokenId, rpcClient, true);
  const tx = await client.mint({ to, amount }, { timeoutInSeconds: 180 });
  return sendSigned(tx, rpcClient, config);
}

export async function approveToken(
  rpcClient: SorobanRpc,
  config: NetworkConfig,
  owner: string,
  tokenId: string,
  spender: string,
  amount: bigint
): Promise<string> {
  const client = mockTokenClient(config, owner, tokenId, rpcClient, true);
  const tx = await client.approve({ owner, spender, amount }, { timeoutInSeconds: 180 });
  return sendSigned(tx, rpcClient, config);
}

export async function shieldRouted(
  rpcClient: SorobanRpc,
  config: NetworkConfig,
  caller: string,
  poolId: string,
  tokenId: string,
  amount: bigint,
  commitment: string,
  encryptedNote: string,
  channel: string,
  subchannel: string,
  aspMeta = ""
): Promise<string> {
  const client = shieldedPoolClient(config, caller, poolId, rpcClient, true);
  const tx = await client.shield_routed(
    {
      caller,
      token: tokenId,
      amount,
      commitment: bufferFromHex32(commitment),
      encrypted_note: bufferFromHex(encryptedNote),
      channel: bufferFromHex32(channel),
      subchannel: bufferFromHex32(subchannel),
      asp_meta: bufferFromHex(aspMeta),
    },
    { timeoutInSeconds: 180 }
  );
  return sendSigned(tx, rpcClient, config);
}

export async function getTokenField(
  rpcClient: SorobanRpc,
  config: NetworkConfig,
  source: string,
  poolId: string,
  tokenId: string
): Promise<`0x${string}`> {
  const client = shieldedPoolClient(config, source, poolId, rpcClient);
  const tx = await client.token_field({ token: tokenId });
  return hexFromBuffer(tx.result!);
}
