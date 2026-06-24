import { rpc } from "@stellar/stellar-sdk";

const { Api: SorobanApi } = rpc;

import { tokenFieldFromContractId } from "./config";
import {
  deriveMembershipBlinding,
  ensureAspMembership,
  fetchAspMembershipPath,
  packAspMeta,
} from "./asp";
import { resolveContractForTokenField } from "./tokens";
import {
  buildSpendPath,
  computeBatchMerkleRoot,
  computeIncrementalMerkleRoot,
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
import { merkleDebug, merkleDebugWarn } from "./merkle-debug";
import { resolvePoolStartLedger } from "./pool-ledger";
import { tryFetchHistoryGapEvents } from "./pool-indexer";
import { historyGapBeforeWindow } from "./rpc-events";
import { generateUltraHonkProof, packTransferMeta, type ProofInputs } from "./proving";
import { generateAspUltraHonkProof } from "./proving-asp";
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
  merkleHash2,
  nullifierSpent,
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
  const { merkleTree, shieldedPool } = params.config.contracts;
  const hasher = await getBrowserPoseidonHasher();
  const { startLedger: scanStart, window, eventsRpc } = await resolvePoolStartLedger(
    params.config,
    shieldedPool,
    params.config.contracts.deployLedger
  );
  let archivedEvents: Awaited<ReturnType<typeof tryFetchHistoryGapEvents>>["events"] = [];
  if (historyGapBeforeWindow(params.config.contracts.deployLedger, window)) {
    const gap = await tryFetchHistoryGapEvents(
      shieldedPool,
      params.config.contracts.deployLedger,
      window
    );
    archivedEvents = gap.events;
  }

  const zero = `0x${"00".repeat(32)}` as Hex32;
  const [onChainH00, localH00] = await Promise.all([
    merkleHash2(eventsRpc, params.config, params.wallet, merkleTree, zero, zero),
    hasher.hash2(0n, 0n),
  ]);
  if (onChainH00.toLowerCase() !== localH00.toLowerCase()) {
    merkleDebugWarn("poseidonMismatch", { onChainH00, localH00 });
    throw new Error(
      "Local Poseidon hash2 does not match on-chain merkle contract — hard refresh the page (Ctrl+Shift+R)"
    );
  }

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
  const rpc = createRpc(params.config);
  const synced = await syncMerkleLeavesValidated(
    eventsRpc,
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
    },
    {
      hasher,
    },
    window,
    archivedEvents
  );

  const leafIndex = resolveLeafIndex(synced.leaves);
  if (leafIndex < 0) {
    throw new Error("Note commitment not found in on-chain merkle tree — wait for sync and retry");
  }

  status("Building merkle path…");
  const path = await buildSpendPath(hasher, synced.leaves, leafIndex);
  const [incrementalRoot, batchRoot] = await Promise.all([
    computeIncrementalMerkleRoot(hasher, synced.leaves),
    computeBatchMerkleRoot(hasher, synced.leaves),
  ]);
  const onChain = synced.root.toLowerCase();
  const pathRoot = path.root.toLowerCase();
  const incrementalOk = incrementalRoot.toLowerCase() === onChain;
  const batchOk = batchRoot.toLowerCase() === onChain;
  const pathRootOk = pathRoot === onChain;

  merkleDebug("transfer:merklePath", {
    leafIndex,
    leafCount: synced.leaves.length,
    onChainRoot: synced.root,
    pathRoot: path.root,
    incrementalRoot,
    batchRoot,
    pathRootOk,
    incrementalOk,
    batchOk,
  });

  if (!pathRootOk) {
    merkleDebugWarn("transfer:rootMismatch", {
      onChainRoot: synced.root,
      pathRoot: path.root,
      incrementalRoot,
      batchRoot,
    });
    throw new Error(
      "Merkle spend path does not match the current on-chain root — wait for sync to finish and retry"
    );
  }

  useShieldedStore.getState().setMerkleLeaves(synced.leaves);
  return {
    rpc,
    hasher,
    leaves: synced.leaves,
    leafIndex,
    path,
    onChainRoot: path.root,
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

  let aspMetaHex = "";
  if (params.config.contracts.aspEnforceShield) {
    status("Scanning on-chain fund sources…");
    await ensureAspMembership(params.keys.ownerPk, params.wallet, tokenId);
    status("ASP membership approved — building shield path…");
    const path = await fetchAspMembershipPath(params.keys.ownerPk);
    aspMetaHex = packAspMeta({
      ownerPk: params.keys.ownerPk,
      membershipBlinding: path.membershipBlinding ?? deriveMembershipBlinding(params.keys.ownerPk),
      leafIndex: path.leafIndex,
      siblings: path.siblings,
      aspRoot: path.aspRoot,
    });
  }

  const expectedLeafIndex = await getMerkleNextIndex(rpc, params.config, params.wallet, merkleTree);
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
    route.subchannel,
    aspMetaHex
  );

  const nextIndex = await getMerkleNextIndex(rpc, params.config, params.wallet, merkleTree);
  if (nextIndex <= expectedLeafIndex) {
    throw new Error(
      "Shield transaction did not insert a merkle leaf on-chain — your deposit was not applied; public tokens were not moved into the pool"
    );
  }
  const leafIndex = expectedLeafIndex;

  void fetchMerkleLeaves(params.config, params.wallet).then((leaves) => {
    useShieldedStore.getState().setMerkleLeaves(leaves);
  });

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

  status("Submitting to relayer…");
  const proofInputs: ProofInputs = {
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
  };

  const feeRecipientPk = toHex32(0n);
  const transferMeta = packTransferMeta({
    nullifier0: nf0,
    nullifier1: toHex32(0n),
    outCommitment0,
    outCommitment1,
    merkleRoot: onChainRoot,
    token: params.note.token,
    feeRecipientPk,
  });

  const relayed = await submitShieldedTransferToRelayer({
    shieldedPool,
    proofInputs,
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
  const txHash = (confirmed.txHash ?? relayed.txHash)?.replace(/^0x/i, "").toLowerCase();
  if (!txHash || !/^[0-9a-f]{64}$/.test(txHash)) {
    throw new Error("Transfer submitted but no valid on-chain transaction hash was returned");
  }

  const rpcClient = createRpc(params.config);
  const txStatus = await rpcClient.getTransaction(txHash);
  if (txStatus.status !== SorobanApi.GetTransactionStatus.SUCCESS) {
    throw new Error(`Transfer transaction did not succeed on-chain (status=${txStatus.status})`);
  }
  const spentOnChain = await nullifierSpent(
    rpcClient,
    params.config,
    params.wallet,
    shieldedPool,
    bytes32Arg(nf0)
  );
  if (!spentOnChain) {
    throw new Error("Transfer was not applied on-chain — the source note nullifier is still unspent");
  }

  const changeNote =
    changeAmount > 0n
      ? {
          id: `${outCommitment1}:${txHash}`,
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

  const useAsp = Boolean(params.config.contracts.verifierAsp && params.config.contracts.aspGate);

  status(useAsp ? "Generating ASP unshield proof…" : "Generating unshield proof…");
  let proofHex: string;
  let publicInputsHex: string | undefined;
  if (useAsp) {
    status("Verifying ASP membership (on-chain scan)…");
    await ensureAspMembership(params.keys.ownerPk, params.wallet, tokenContract);
    const aspPath = await fetchAspMembershipPath(params.keys.ownerPk);
    const aspProof = await generateAspUltraHonkProof({
      spending_key: params.keys.spendingKey.toString(),
      in_amounts: [params.note.amount.toString(), "0"],
      in_blindings: [toHex32(params.note.blinding), toHex32(0n)],
      merkle_siblings: [path.siblings, Array(20).fill(toHex32(0n))],
      merkle_directions: [path.directions, Array(20).fill(false)],
      out_amounts: [changeAmount.toString(), "0"],
      out_recipient_pks: [params.keys.ownerPk, toHex32(0n)],
      out_blindings: [toHex32(changeBlinding), toHex32(0n)],
      membership_blinding: aspPath.membershipBlinding ?? deriveMembershipBlinding(params.keys.ownerPk),
      asp_merkle_siblings: aspPath.siblings,
      asp_merkle_directions: aspPath.directions,
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
      asp_membership_root: aspPath.aspRoot,
      owner_pk_public: params.keys.ownerPk,
    });
    proofHex = Buffer.from(aspProof.proof).toString("hex");
    publicInputsHex = Buffer.from(aspProof.publicInputs).toString("hex");
  } else {
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
    proofHex = Buffer.from(proof).toString("hex");
  }

  status("Submitting to relayer…");
  const relayed = await submitUnshieldToRelayer({
    shieldedPool,
    proofBytes: proofHex,
    nullifier: bytes32Arg(nf),
    token: tokenContract,
    recipient: params.recipientAddress,
    amount: params.amount.toString(),
    merkleRoot: bytes32Arg(onChainRoot),
    newCommitment: bytes32Arg(changeCommitment),
    encryptedNote: encryptedChange.replace(/^0x/, ""),
    channel: bytes32Arg(route.channel),
    subchannel: bytes32Arg(route.subchannel),
    ...(useAsp
      ? {
          useAsp: true,
          ownerPk: bytes32Arg(params.keys.ownerPk),
          aspGate: params.config.contracts.aspGate,
          publicInputs: publicInputsHex,
        }
      : {}),
  });
  status("Waiting for confirmation…");
  const confirmed = await waitForRelayerConfirmation(relayed.requestId);
  const txHash = (confirmed.txHash ?? relayed.txHash)?.replace(/^0x/i, "").toLowerCase();
  if (!txHash || !/^[0-9a-f]{64}$/.test(txHash)) {
    throw new Error("Withdrawal submitted but no valid on-chain transaction hash was returned");
  }

  const rpcClient = createRpc(params.config);
  const txStatus = await rpcClient.getTransaction(txHash);
  if (txStatus.status !== SorobanApi.GetTransactionStatus.SUCCESS) {
    throw new Error(
      `Withdrawal transaction did not succeed on-chain (status=${txStatus.status})`
    );
  }
  const spentOnChain = await nullifierSpent(
    rpcClient,
    params.config,
    params.wallet,
    shieldedPool,
    bytes32Arg(nf)
  );
  if (!spentOnChain) {
    throw new Error(
      "Withdrawal was not applied on-chain — the note nullifier is still unspent"
    );
  }

  const changeNote =
    changeAmount > 0n
      ? {
          id: `${changeCommitment}:${txHash}`,
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
  const poolId = config.contracts.shieldedPool;
  const merkleId = config.contracts.merkleTree;
  const hasher = await getBrowserPoseidonHasher();
  const resolved = await resolvePoolStartLedger(config, poolId, config.contracts.deployLedger);
  const scanStart = startLedger ?? resolved.startLedger;
  let archivedEvents: Awaited<ReturnType<typeof tryFetchHistoryGapEvents>>["events"] = [];
  if (historyGapBeforeWindow(config.contracts.deployLedger, resolved.window)) {
    const gap = await tryFetchHistoryGapEvents(poolId, config.contracts.deployLedger, resolved.window);
    archivedEvents = gap.events;
  }
  const synced = await syncMerkleLeavesValidated(
    resolved.eventsRpc,
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
    },
    {
      hasher,
    },
    resolved.window,
    archivedEvents
  );
  return synced.leaves;
}
