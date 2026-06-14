import { tokenFieldFromContractId } from "./config";
import { resolveContractForTokenField } from "./tokens";
import {
  buildSpendPath,
  getBrowserPoseidonHasher,
  deriveOwnerPk,
  noteCommitment,
  nullifier,
} from "./hasher";
import {
  encryptNoteECDH,
  routeForRecipient,
} from "./keys";
import { findLeafIndex, syncMerkleLeavesValidated } from "./merkle-sync";
import { resolvePoolStartLedger } from "./pool-ledger";
import { generateUltraHonkProof, packTransferMeta } from "./proving";
import {
  submitShieldedTransferToRelayer,
  submitUnshieldToRelayer,
  waitForRelayerConfirmation,
} from "./relayer";
import {
  approveToken,
  createRpc,
  getMerkleNextIndex,
  getTokenField,
  shieldRouted,
} from "./soroban";
import { useShieldedStore } from "../store/use-shielded-store";
import type { DecryptedNote, Hex32, NetworkConfig, ShieldedKeys } from "./types";
import { bytes32Arg, randomBlinding, toHex32 } from "./utils";

function merkleStatus(onStatus: ((msg: string) => void) | undefined, msg: string) {
  onStatus?.(msg);
}

async function resolveMerkleSpendPath(params: {
  config: NetworkConfig;
  wallet: string;
  note: DecryptedNote;
  onStatus?: (msg: string) => void;
}) {
  const status = (msg: string) => merkleStatus(params.onStatus, msg);
  status("Initializing crypto…");
  const rpc = createRpc(params.config);
  const { merkleTree, shieldedPool } = params.config.contracts;
  const hasher = await getBrowserPoseidonHasher();
  const scanStart = await resolvePoolStartLedger(rpc, shieldedPool, params.config.contracts.deployLedger);

  function resolveLeafIndex(leaves: Hex32[]): number {
    let leafIndex = findLeafIndex(leaves, params.note.commitment);
    if (
      leafIndex < 0 &&
      params.note.leafIndex != null &&
      params.note.leafIndex >= 0 &&
      params.note.leafIndex < leaves.length
    ) {
      const atIdx = leaves[params.note.leafIndex];
      if (
        atIdx &&
        bytes32Arg(atIdx).toLowerCase() === bytes32Arg(params.note.commitment).toLowerCase()
      ) {
        leafIndex = params.note.leafIndex;
      }
    }
    return leafIndex;
  }

  status("Reading on-chain merkle root…");
  status("Syncing merkle tree from chain…");
  const synced = await syncMerkleLeavesValidated(
    rpc,
    params.config,
    params.wallet,
    shieldedPool,
    merkleTree,
    scanStart,
    (p) => {
      if (p.phase === "events") {
        status(`Syncing merkle tree… (${p.events ?? 0} events)`);
      } else if (p.phase === "txs") {
        status(`Syncing merkle tree… (${p.txs ?? 0}/${p.totalTxs ?? "?"} txs)`);
      }
    }
  );

  const leafIndex = resolveLeafIndex(synced.leaves);
  if (leafIndex < 0) {
    throw new Error("Note commitment not found in on-chain merkle tree — wait for sync and retry");
  }

  status("Building merkle path…");
  const path = await buildSpendPath(hasher, synced.leaves, leafIndex);
  if (path.root.toLowerCase() !== synced.root.toLowerCase()) {
    throw new Error(
      "Merkle root mismatch with on-chain contract — local hash differs from get_last_root()"
    );
  }

  useShieldedStore.getState().setMerkleLeaves(synced.leaves);
  return {
    rpc,
    hasher,
    leaves: synced.leaves,
    leafIndex,
    path,
    onChainRoot: synced.root,
  };
}

export async function executeShieldDeposit(params: {
  config: NetworkConfig;
  wallet: string;
  keys: ShieldedKeys;
  amount: bigint;
  tokenContractId: string;
  routeCursor: number;
  onStatus?: (msg: string) => void;
}): Promise<{ txHash: string; note: DecryptedNote; leafIndex: number }> {
  const status = params.onStatus ?? (() => {});
  const rpc = createRpc(params.config);
  const { shieldedPool, merkleTree } = params.config.contracts;
  const tokenId = params.tokenContractId;
  const hasher = await getBrowserPoseidonHasher();
  const tokenField = await getTokenField(rpc, params.config, params.wallet, shieldedPool, tokenId);
  const blinding = randomBlinding();
  const commitment = await noteCommitment(hasher, params.keys.ownerPk, tokenField, params.amount, blinding);
  const route = routeForRecipient(params.keys.viewingPub, params.routeCursor);
  const encrypted = await encryptNoteECDH(
    {
      owner_pk: params.keys.ownerPk,
      token: tokenField,
      amount: params.amount.toString(),
      blinding: toHex32(blinding),
      commitment,
    },
    params.keys.viewingPub
  );

  status("Approving token spend…");
  await approveToken(rpc, params.config, params.wallet, tokenId, shieldedPool, params.amount);

  const leafIndex = await getMerkleNextIndex(rpc, params.config, params.wallet, merkleTree);
  status("Submitting shield deposit…");
  const txHash = await shieldRouted(
    rpc,
    params.config,
    params.wallet,
    shieldedPool,
    tokenId,
    params.amount,
    commitment,
    encrypted.replace(/^0x/, ""),
    route.channel,
    route.subchannel
  );

  return {
    txHash,
    leafIndex,
    note: {
      id: `${commitment}:${txHash}`,
      commitment,
      token: tokenField,
      amount: params.amount,
      blinding,
      leafIndex,
      txHash,
      spent: false,
    },
  };
}

export async function executePrivateTransfer(params: {
  config: NetworkConfig;
  wallet: string;
  keys: ShieldedKeys;
  note: DecryptedNote;
  recipientOwnerPk: Hex32;
  recipientViewingPub: Hex32;
  sendAmount: bigint;
  leaves: Hex32[];
  senderRouteCursor: number;
  recipientRouteCursor: number;
  onStatus?: (msg: string) => void;
}): Promise<{
  requestId: string;
  txHash?: string | null;
  spentNoteId: string;
  changeNote?: DecryptedNote;
}> {
  const status = params.onStatus ?? (() => {});
  const { shieldedPool } = params.config.contracts;
  const { rpc, hasher, path, onChainRoot } = await resolveMerkleSpendPath({
    config: params.config,
    wallet: params.wallet,
    note: params.note,
    onStatus: status,
  });

  const changeAmount = params.note.amount - params.sendAmount;
  if (changeAmount < 0n) throw new Error("Insufficient note balance");

  const nf0 = await nullifier(hasher, params.keys.spendingKey, params.note.commitment);
  const outBlinding0 = randomBlinding();
  const outBlinding1 = randomBlinding();
  const outCommitment0 = await noteCommitment(
    hasher,
    params.recipientOwnerPk,
    params.note.token,
    params.sendAmount,
    outBlinding0
  );
  const outCommitment1 = await noteCommitment(
    hasher,
    params.keys.ownerPk,
    params.note.token,
    changeAmount,
    outBlinding1
  );

  const route0 = routeForRecipient(params.recipientViewingPub, params.recipientRouteCursor);
  const route1 = routeForRecipient(params.keys.viewingPub, params.senderRouteCursor);

  const encryptedNote0 = await encryptNoteECDH(
    {
      token: params.note.token,
      amount: params.sendAmount.toString(),
      blinding: toHex32(outBlinding0),
      commitment: outCommitment0,
    },
    params.recipientViewingPub
  );
  const encryptedNote1 = await encryptNoteECDH(
    {
      token: params.note.token,
      amount: changeAmount.toString(),
      blinding: toHex32(outBlinding1),
      commitment: outCommitment1,
    },
    params.keys.viewingPub
  );

  status("Generating transfer proof…");
  const proof = await generateUltraHonkProof({
    spending_key: params.keys.spendingKey.toString(),
    in_amounts: [params.note.amount.toString(), "0"],
    in_blindings: [toHex32(params.note.blinding), toHex32(0n)],
    merkle_siblings: [path.siblings, Array(20).fill(toHex32(0n))],
    merkle_directions: [path.directions, Array(20).fill(false)],
    out_amounts: [params.sendAmount.toString(), changeAmount.toString()],
    out_recipient_pks: [params.recipientOwnerPk, params.keys.ownerPk],
    out_blindings: [toHex32(outBlinding0), toHex32(outBlinding1)],
    token: params.note.token,
    merkle_root: onChainRoot,
    nullifiers: [nf0, toHex32(0n)],
    out_commitments: [outCommitment0, outCommitment1],
    fee: "0",
    fee_recipient_pk: toHex32(0n),
    mode: "0",
    unshield_recipient: toHex32(0n),
    unshield_amount: "0",
    unshield_token_address: toHex32(0n),
  });

  const transferMeta = packTransferMeta({
    nullifier0: nf0,
    nullifier1: toHex32(0n),
    outCommitment0,
    outCommitment1,
    merkleRoot: onChainRoot,
    token: params.note.token,
    fee: 0n,
  });

  status("Submitting to relayer…");
  const relayed = await submitShieldedTransferToRelayer({
    shieldedPool,
    proofBytes: Buffer.from(proof).toString("hex"),
    transferMeta,
    encryptedNote0: encryptedNote0.replace(/^0x/, ""),
    encryptedNote1: encryptedNote1.replace(/^0x/, ""),
    channel0: bytes32Arg(route0.channel),
    channel1: bytes32Arg(route1.channel),
    subchannel0: bytes32Arg(route0.subchannel),
    subchannel1: bytes32Arg(route1.subchannel),
    fee: 0,
  });
  status("Waiting for confirmation…");
  const confirmed = await waitForRelayerConfirmation(relayed.requestId);
  const txHash = confirmed.txHash ?? relayed.txHash ?? undefined;
  const changeNote =
    changeAmount > 0n
      ? {
          id: `${outCommitment1}:${txHash ?? relayed.requestId}`,
          commitment: outCommitment1,
          token: params.note.token,
          amount: changeAmount,
          blinding: outBlinding1,
          txHash,
          spent: false,
        }
      : undefined;
  return {
    requestId: relayed.requestId,
    txHash: txHash ?? null,
    spentNoteId: params.note.id,
    changeNote,
  };
}

export async function executeUnshield(params: {
  config: NetworkConfig;
  wallet: string;
  keys: ShieldedKeys;
  note: DecryptedNote;
  recipientAddress: string;
  amount: bigint;
  leaves: Hex32[];
  routeCursor: number;
  onStatus?: (msg: string) => void;
}): Promise<{
  requestId: string;
  txHash?: string | null;
  spentNoteId: string;
  changeNote?: DecryptedNote;
}> {
  const status = params.onStatus ?? (() => {});
  const { shieldedPool } = params.config.contracts;
  const tokenContract = await resolveContractForTokenField(
    params.config,
    params.wallet,
    params.note.token
  );
  const { hasher, path, onChainRoot } = await resolveMerkleSpendPath({
    config: params.config,
    wallet: params.wallet,
    note: params.note,
    cachedLeaves: params.leaves,
    onStatus: status,
  });

  const changeAmount = params.note.amount - params.amount;
  if (changeAmount < 0n) throw new Error("Unshield amount exceeds note");

  const nf = await nullifier(hasher, params.keys.spendingKey, params.note.commitment);
  const changeBlinding = changeAmount > 0n ? randomBlinding() : 0n;
  const changeCommitment = await noteCommitment(
    hasher,
    params.keys.ownerPk,
    params.note.token,
    changeAmount,
    changeBlinding
  );
  const recipientField = await tokenFieldFromContractId(params.recipientAddress);
  const route = routeForRecipient(params.keys.viewingPub, params.routeCursor);
  const encryptedChange =
    changeAmount > 0n
      ? await encryptNoteECDH(
          {
            token: params.note.token,
            amount: changeAmount.toString(),
            blinding: toHex32(changeBlinding),
            commitment: changeCommitment,
          },
          params.keys.viewingPub
        )
      : "00";

  status("Generating unshield proof…");
  const proof = await generateUltraHonkProof({
    spending_key: params.keys.spendingKey.toString(),
    in_amounts: [params.note.amount.toString(), "0"],
    in_blindings: [toHex32(params.note.blinding), toHex32(0n)],
    merkle_siblings: [path.siblings, Array(20).fill(toHex32(0n))],
    merkle_directions: [path.directions, Array(20).fill(false)],
    out_amounts: [changeAmount.toString(), "0"],
    out_recipient_pks: [params.keys.ownerPk, toHex32(0n)],
    out_blindings: [toHex32(changeBlinding), toHex32(0n)],
    token: params.note.token,
    merkle_root: onChainRoot,
    nullifiers: [nf, toHex32(0n)],
    out_commitments: [changeCommitment, toHex32(0n)],
    fee: "0",
    fee_recipient_pk: toHex32(0n),
    mode: "1",
    unshield_recipient: recipientField,
    unshield_amount: params.amount.toString(),
    unshield_token_address: params.note.token,
  });

  status("Submitting to relayer…");
  const relayed = await submitUnshieldToRelayer({
    shieldedPool,
    proofBytes: Buffer.from(proof).toString("hex"),
    nullifier: bytes32Arg(nf),
    token: tokenContract,
    recipient: params.recipientAddress,
    amount: params.amount.toString(),
    merkleRoot: bytes32Arg(onChainRoot),
    newCommitment: bytes32Arg(changeCommitment),
    encryptedNote: encryptedChange.replace(/^0x/, ""),
    channel: bytes32Arg(route.channel),
    subchannel: bytes32Arg(route.subchannel),
  });
  status("Waiting for confirmation…");
  const confirmed = await waitForRelayerConfirmation(relayed.requestId);
  const txHash = confirmed.txHash ?? relayed.txHash ?? undefined;
  const changeNote =
    changeAmount > 0n
      ? {
          id: `${changeCommitment}:${txHash ?? relayed.requestId}`,
          commitment: changeCommitment,
          token: params.note.token,
          amount: changeAmount,
          blinding: changeBlinding,
          txHash,
          spent: false,
        }
      : undefined;
  return {
    requestId: relayed.requestId,
    txHash: txHash ?? null,
    spentNoteId: params.note.id,
    changeNote,
  };
}

export async function fetchMerkleLeaves(
  config: NetworkConfig,
  wallet: string,
  startLedger?: number,
  onStatus?: (msg: string) => void
): Promise<Hex32[]> {
  const rpc = createRpc(config);
  const poolId = config.contracts.shieldedPool;
  const merkleId = config.contracts.merkleTree;
  const scanStart =
    startLedger ??
    (await resolvePoolStartLedger(rpc, poolId, config.contracts.deployLedger));
  const synced = await syncMerkleLeavesValidated(
    rpc,
    config,
    wallet,
    poolId,
    merkleId,
    scanStart,
    (p) => {
      if (p.phase === "events") {
        onStatus?.(`Syncing merkle tree… (${p.events ?? 0} events)`);
      } else if (p.phase === "txs") {
        onStatus?.(`Syncing merkle tree… (${p.txs ?? 0}/${p.totalTxs ?? "?"} txs)`);
      }
    }
  );
  return synced.leaves;
}
