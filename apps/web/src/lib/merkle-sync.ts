import { Address, xdr } from "@stellar/stellar-sdk";
import { rpc } from "@stellar/stellar-sdk";

const { Api, Server: SorobanRpc } = rpc;

import { getMerkleNextIndex, getMerkleRoot } from "./soroban";
import type { PoseidonHasher } from "./hasher";
import { computeBatchMerkleRoot, computeIncrementalMerkleRoot } from "./hasher";
import { merkleDebug, merkleDebugWarn } from "./merkle-debug";
import {
  fetchAllContractEvents,
  isLedgerRangeError,
  probeLedgerWindow,
  resolveScanLedgerRange,
  uniqueRpcUrls,
  type RpcLedgerWindow,
} from "./rpc-events";
import type { DecryptedNote, Hex32, NetworkConfig } from "./types";
import { bytes32Arg } from "./utils";

export type OnChainMerkleState = {
  nextIndex: number;
  root: Hex32;
};

export type ValidatedMerkleSync = OnChainMerkleState & {
  leaves: Hex32[];
};

function asEnvelope(envelopeXdr: unknown): xdr.TransactionEnvelope | null {
  if (!envelopeXdr) return null;
  if (typeof envelopeXdr === "string") {
    return xdr.TransactionEnvelope.fromXDR(envelopeXdr, "base64");
  }
  const env = envelopeXdr as xdr.TransactionEnvelope;
  return typeof env.switch === "function" ? env : null;
}

function getEnvelopeOperations(envelope: xdr.TransactionEnvelope): xdr.Operation[] {
  switch (envelope.switch()) {
    case xdr.EnvelopeType.envelopeTypeTxV0():
      return envelope.v0().tx().operations();
    case xdr.EnvelopeType.envelopeTypeTx():
      return envelope.v1().tx().operations();
    case xdr.EnvelopeType.envelopeTypeTxFeeBump(): {
      const inner = envelope.feeBump().tx().innerTx();
      const innerEnv = asEnvelope(typeof inner.value === "function" ? inner.value() : inner);
      return innerEnv ? getEnvelopeOperations(innerEnv) : [];
    }
    default:
      return [];
  }
}

type PoolEventRef = {
  txHash: string;
  ledger: number;
  transactionIndex: number;
  operationIndex: number;
};

const RPC_TIMEOUT_MS = 15_000;

async function withRpcTimeout<T>(label: string, fn: () => Promise<T>): Promise<T> {
  return Promise.race([
    fn(),
    new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error(`${label} timeout`)), RPC_TIMEOUT_MS)
    ),
  ]);
}

async function getTransactionWithTimeout(
  rpcUrls: string[],
  txHash: string
): Promise<Api.GetTransactionResponse | null> {
  for (const rpcUrl of rpcUrls) {
    const server = new SorobanRpc(rpcUrl, { allowHttp: rpcUrl.startsWith("http://") });
    try {
      const tx = await withRpcTimeout(`getTransaction ${txHash.slice(0, 8)}`, () =>
        server.getTransaction(txHash)
      );
      if (tx.status === Api.GetTransactionStatus.NOT_FOUND || !tx.envelopeXdr) continue;
      return tx;
    } catch {
      /* try next RPC */
    }
  }
  return null;
}

export type MerkleSyncProgress = {
  phase: "events" | "txs";
  events?: number;
  txs?: number;
  totalTxs?: number;
};

/** Rebuild ordered leaf list from public pool transaction args (commitments are public on-chain). */
export async function syncMerkleLeaves(
  rpc: SorobanRpc,
  poolId: string,
  startLedger: number,
  onProgress?: (p: MerkleSyncProgress) => void,
  ledgerWindow?: RpcLedgerWindow,
  options?: { aspGateId?: string; txRpcUrls?: string[]; archivedEvents?: Api.EventResponse[] }
): Promise<Hex32[]> {
  const eventRefs: PoolEventRef[] = [];

  let window = ledgerWindow;
  if (!window?.rpcUrl) {
    throw new Error("Merkle sync requires a probed RPC ledger window");
  }
  window = await probeLedgerWindow(window.rpcUrl, poolId, { force: true });
  let range = resolveScanLedgerRange(startLedger, window);

  if (range.scanFrom > range.endLedger) return [];

  onProgress?.({ phase: "events", events: 0 });

  let events: Awaited<ReturnType<typeof fetchAllContractEvents>>;
  try {
    events = await withRpcTimeout("getEvents", () =>
      fetchAllContractEvents(
        rpc,
        { type: "contract", contractIds: [poolId] },
        range
      )
    );
  } catch (err) {
    if (!isLedgerRangeError(err) || !window.rpcUrl) throw err;
    window = await probeLedgerWindow(window.rpcUrl, poolId, { force: true });
    range = resolveScanLedgerRange(startLedger, window);
    if (range.scanFrom > range.endLedger) return [];
    events = await withRpcTimeout("getEvents", () =>
      fetchAllContractEvents(
        rpc,
        { type: "contract", contractIds: [poolId] },
        range
      )
    );
  }

  for (const ev of events) {
    eventRefs.push({
      txHash: ev.txHash,
      ledger: ev.ledger,
      transactionIndex: ev.transactionIndex,
      operationIndex: ev.operationIndex,
    });
  }

  for (const ev of options?.archivedEvents ?? []) {
    eventRefs.push({
      txHash: ev.txHash,
      ledger: ev.ledger,
      transactionIndex: ev.transactionIndex,
      operationIndex: ev.operationIndex,
    });
  }

  onProgress?.({ phase: "events", events: eventRefs.length });

  eventRefs.sort(
    (a, b) =>
      a.ledger - b.ledger ||
      a.transactionIndex - b.transactionIndex ||
      a.operationIndex - b.operationIndex
  );

  const seenTx = new Set<string>();
  const uniqueRefs: PoolEventRef[] = [];
  for (const ref of eventRefs) {
    if (seenTx.has(ref.txHash)) continue;
    seenTx.add(ref.txHash);
    uniqueRefs.push(ref);
  }

  const leaves: Hex32[] = [];
  const BATCH = 8;
  onProgress?.({ phase: "txs", txs: 0, totalTxs: uniqueRefs.length });

  const txRpcUrls =
    options?.txRpcUrls?.length
      ? options.txRpcUrls
      : ledgerWindow?.rpcUrl
        ? [ledgerWindow.rpcUrl]
        : [];
  const aspGateId = options?.aspGateId;

  for (let i = 0; i < uniqueRefs.length; i += BATCH) {
    const chunk = uniqueRefs.slice(i, i + BATCH);
    const parts = await Promise.all(
      chunk.map(async (ref) => {
        const tx = await getTransactionWithTimeout(txRpcUrls, ref.txHash);
        if (!tx || tx.status !== Api.GetTransactionStatus.SUCCESS) return [] as Hex32[];
        return extractCommitmentsFromTx(tx, poolId, aspGateId);
      })
    );
    for (const extracted of parts) leaves.push(...extracted);
    onProgress?.({ phase: "txs", txs: Math.min(i + BATCH, uniqueRefs.length), totalTxs: uniqueRefs.length });
  }

  merkleDebug("syncMerkleLeaves:done", {
    events: eventRefs.length,
    uniqueTxs: uniqueRefs.length,
    leafCount: leaves.length,
  });

  return leaves;
}

/** Read authoritative merkle state from the on-chain merkle-tree contract. */
export async function readOnChainMerkleState(
  rpc: SorobanRpc,
  config: NetworkConfig,
  wallet: string,
  merkleId: string
): Promise<OnChainMerkleState> {
  const [nextIndex, root] = await Promise.all([
    getMerkleNextIndex(rpc, config, wallet, merkleId),
    getMerkleRoot(rpc, config, wallet, merkleId),
  ]);
  return { nextIndex, root };
}

export type MerkleVerifyOptions = {
  hasher: PoseidonHasher;
};

/**
 * Rebuild leaves from pool txs and verify count + root against on-chain merkle tree.
 * Reads on-chain state after leaf rebuild (avoids race with concurrent inserts).
 */
export async function syncMerkleLeavesValidated(
  rpc: SorobanRpc,
  config: NetworkConfig,
  wallet: string,
  poolId: string,
  merkleId: string,
  startLedger: number,
  onProgress?: (p: MerkleSyncProgress) => void,
  verify?: MerkleVerifyOptions,
  ledgerWindow?: RpcLedgerWindow,
  archivedEvents?: Api.EventResponse[]
): Promise<ValidatedMerkleSync> {
  let lastLeaves: Hex32[] = [];
  let lastState: OnChainMerkleState = { nextIndex: 0, root: `0x${"00".repeat(32)}` as Hex32 };

  merkleDebug("sync:start", { poolId, merkleId, startLedger });

  for (let attempt = 0; attempt < 6; attempt++) {
    const txRpcUrls = uniqueRpcUrls(config);
    const leaves = await syncMerkleLeaves(rpc, poolId, startLedger, onProgress, ledgerWindow, {
      aspGateId: config.contracts.aspGate ?? undefined,
      txRpcUrls,
      archivedEvents,
    });
    const state = await readOnChainMerkleState(rpc, config, wallet, merkleId);
    lastState = state;
    lastLeaves = leaves;

    merkleDebug("sync:attempt", {
      attempt,
      leafCount: leaves.length,
      nextIndex: state.nextIndex,
      onChainRoot: state.root,
    });

    if (leaves.length !== state.nextIndex) {
      if (attempt < 5) {
        merkleDebugWarn("sync:countMismatch", {
          attempt,
          leaves: leaves.length,
          nextIndex: state.nextIndex,
        });
        await new Promise((r) => setTimeout(r, 1500));
        continue;
      }
      break;
    }

    if (verify?.hasher) {
      const [incremental, batch] = await Promise.all([
        computeIncrementalMerkleRoot(verify.hasher, leaves),
        computeBatchMerkleRoot(verify.hasher, leaves),
      ]);
      const onChain = state.root.toLowerCase();
      const incMatch = incremental.toLowerCase() === onChain;
      const batchMatch = batch.toLowerCase() === onChain;

      merkleDebug("sync:rootCheck", {
        attempt,
        incremental,
        batch,
        onChain: state.root,
        incMatch,
        batchMatch,
      });

      if (!incMatch && !batchMatch) {
        if (attempt < 5) {
          merkleDebugWarn("sync:rootMismatchRetry", {
            attempt,
            incremental,
            batch,
            onChain: state.root,
          });
          await new Promise((r) => setTimeout(r, 2000));
          continue;
        }
        throw new Error(
          `Merkle root mismatch: rebuilt ${leaves.length} leaves but local root differs from get_last_root() (incremental=${incremental}, batch=${batch}, on-chain=${state.root})`
        );
      }
    }

    merkleDebug("sync:done", {
      leafCount: leaves.length,
      root: state.root,
    });
    return { ...state, leaves };
  }

  throw new Error(
    `Merkle leaf sync incomplete: rebuilt ${lastLeaves.length} leaves but on-chain next_index is ${lastState.nextIndex}`
  );
}

function extractCommitmentsFromTx(
  tx: Api.GetTransactionResponse,
  poolId: string,
  aspGateId?: string
): Hex32[] {
  const out: Hex32[] = [];
  const envelope = asEnvelope(tx.envelopeXdr);
  if (!envelope) return out;
  const ops = getEnvelopeOperations(envelope);
  for (const op of ops) {
    const extracted = extractCommitmentsFromOp(op, poolId, aspGateId);
    out.push(...extracted);
  }
  return out;
}

/** Extract commitments from a single operation (pool insert order). */
function extractCommitmentsFromOp(
  op: xdr.Operation,
  poolId: string,
  aspGateId?: string
): Hex32[] {
  const out: Hex32[] = [];
  if (op.body().switch() !== xdr.OperationType.invokeHostFunction()) return out;
  const invoke = op.body().invokeHostFunctionOp();
  const host = invoke.hostFunction();
  if (host.switch() !== xdr.HostFunctionType.hostFunctionTypeInvokeContract()) return out;
  const invokeContract = host.invokeContract();
  const contract = Address.fromScAddress(invokeContract.contractAddress()).toString();
  const fn = invokeContract.functionName().toString();
  const args = invokeContract.args();
  if (contract === poolId) {
    if (fn === "shield_routed" && args.length >= 4) {
      const c = scValBytesToHex32(args[3]);
      if (c) out.push(c);
    } else if (fn === "shielded_transfer_routed" && args.length >= 2) {
      const meta = scValBytesToHex(args[1]);
      if (meta.length >= 256) {
        out.push(`0x${meta.slice(128, 192)}` as Hex32, `0x${meta.slice(192, 256)}` as Hex32);
      }
    } else if (
      (fn === "unshield" || fn === "unshield_with_asp" || fn === "fulfill_unshield") &&
      args.length >= 7
    ) {
      const c = scValBytesToHex32(args[6]);
      if (c && c !== `0x${"00".repeat(32)}`) out.push(c);
    }
  } else if (aspGateId && contract === aspGateId && fn === "unshield_asp" && args.length >= 2) {
    // ASP gate packs new_commitment at byte offset 64 in meta (see asp-gate buildUnshieldAspMeta).
    const meta = scValBytesToHex(args[1]);
    if (meta.length >= 192) {
      const c = `0x${meta.slice(128, 192)}` as Hex32;
      if (c !== `0x${"00".repeat(32)}`) out.push(c);
    }
  }
  return out;
}

function scValBytesToHex32(val: xdr.ScVal): Hex32 | null {
  if (val.switch() !== xdr.ScValType.scvBytes()) return null;
  const hex = Buffer.from(val.bytes()).toString("hex").padStart(64, "0").slice(-64);
  return `0x${hex}` as Hex32;
}

function scValBytesToHex(val: xdr.ScVal): string {
  if (val.switch() !== xdr.ScValType.scvBytes()) return "";
  return Buffer.from(val.bytes()).toString("hex");
}

export function findLeafIndex(leaves: Hex32[], commitment: Hex32): number {
  const target = bytes32Arg(commitment).toLowerCase();
  return leaves.findIndex((l) => bytes32Arg(l).toLowerCase() === target);
}

export function attachLeafIndices(notes: DecryptedNote[], leaves: Hex32[]): DecryptedNote[] {
  return notes.map((note) => {
    const idx = findLeafIndex(leaves, note.commitment);
    return idx >= 0 ? { ...note, leafIndex: idx } : note;
  });
}
