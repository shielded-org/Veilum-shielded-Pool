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
import { resolveHorizonUrl } from "./config";
import { fetchIndexerTxLeaves } from "./pool-indexer";
import { fetchTransactionEnvelope } from "./tx-envelope";
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
  options?: {
    aspGateId?: string;
    txRpcUrls?: string[];
    horizonUrl?: string;
    archivedEvents?: Api.EventResponse[];
    archivedTxLeaves?: Record<string, Hex32[]>;
  }
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
        range,
        200,
        { rpcUrl: window.rpcUrl, poolId }
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
        range,
        200,
        { rpcUrl: window.rpcUrl, poolId }
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
  const horizonUrl = options?.horizonUrl;
  let txLeafCache: Record<string, Hex32[]> = { ...(options?.archivedTxLeaves ?? {}) };
  const txFailures: string[] = [];

  async function leavesForTx(ref: PoolEventRef): Promise<Hex32[]> {
    const cached = txLeafCache[ref.txHash];
    if (cached?.length) return cached;

    const tx = await fetchTransactionEnvelope(txRpcUrls, ref.txHash, horizonUrl);
    if (tx?.status === Api.GetTransactionStatus.SUCCESS) {
      if (tx.source === "horizon") {
        merkleDebug("sync:horizonTx", { txHash: ref.txHash.slice(0, 12), ledger: ref.ledger });
      }
      const extracted = extractCommitmentsFromEnvelope(tx.envelopeXdr, poolId, aspGateId);
      if (extracted.length) txLeafCache[ref.txHash] = extracted;
      return extracted;
    }

    const fromIndexer = await fetchIndexerTxLeaves(poolId, [ref.txHash]);
    const indexerLeaves = fromIndexer[ref.txHash] as Hex32[] | undefined;
    if (indexerLeaves?.length) {
      merkleDebug("sync:indexerTxLeaves", { txHash: ref.txHash.slice(0, 12), leaves: indexerLeaves.length });
      txLeafCache[ref.txHash] = indexerLeaves;
      return indexerLeaves;
    }

    txFailures.push(ref.txHash);
    return [];
  }

  for (let i = 0; i < uniqueRefs.length; i += BATCH) {
    const chunk = uniqueRefs.slice(i, i + BATCH);
    const parts = await Promise.all(chunk.map((ref) => leavesForTx(ref)));
    for (const extracted of parts) leaves.push(...extracted);
    onProgress?.({ phase: "txs", txs: Math.min(i + BATCH, uniqueRefs.length), totalTxs: uniqueRefs.length });
  }

  if (txFailures.length > 0) {
    merkleDebugWarn("sync:txFetchFailures", {
      count: txFailures.length,
      sample: txFailures.slice(0, 3).map((h) => h.slice(0, 12)),
      horizonConfigured: Boolean(horizonUrl),
    });
    const recovered = await fetchIndexerTxLeaves(poolId, txFailures);
    for (const ref of uniqueRefs) {
      if (!txFailures.includes(ref.txHash)) continue;
      const indexerLeaves = recovered[ref.txHash] as Hex32[] | undefined;
      if (!indexerLeaves?.length) continue;
      txLeafCache[ref.txHash] = indexerLeaves;
    }
    if (Object.keys(recovered).length > 0) {
      leaves.length = 0;
      txFailures.length = 0;
      for (const ref of uniqueRefs) {
        const ls = txLeafCache[ref.txHash] ?? (await leavesForTx(ref));
        if (!ls.length) txFailures.push(ref.txHash);
        leaves.push(...ls);
      }
    }
  }

  merkleDebug("syncMerkleLeaves:done", {
    events: eventRefs.length,
    uniqueTxs: uniqueRefs.length,
    leafCount: leaves.length,
    txFailures: txFailures.length,
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

export type MerkleSyncExtras = {
  archivedEvents?: Api.EventResponse[];
  archivedTxLeaves?: Record<string, Hex32[]>;
  /** Pre-validated ordered leaf list from indexer (skip tx fetch when root matches). */
  indexerOrderedLeaves?: Hex32[] | null;
};

async function merkleRootsMatch(
  hasher: PoseidonHasher,
  leaves: Hex32[],
  onChainRoot: Hex32
): Promise<boolean> {
  const [incremental, batch] = await Promise.all([
    computeIncrementalMerkleRoot(hasher, leaves),
    computeBatchMerkleRoot(hasher, leaves),
  ]);
  const onChain = onChainRoot.toLowerCase();
  return incremental.toLowerCase() === onChain || batch.toLowerCase() === onChain;
}

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
  extras?: MerkleSyncExtras
): Promise<ValidatedMerkleSync> {
  let lastLeaves: Hex32[] = [];
  let lastState: OnChainMerkleState = { nextIndex: 0, root: `0x${"00".repeat(32)}` as Hex32 };
  const horizonUrl = resolveHorizonUrl(config);

  merkleDebug("sync:start", { poolId, merkleId, startLedger, horizonUrl });

  for (let attempt = 0; attempt < 8; attempt++) {
    const state = await readOnChainMerkleState(rpc, config, wallet, merkleId);
    lastState = state;

    const indexerLeaves = extras?.indexerOrderedLeaves;
    if (
      verify?.hasher &&
      indexerLeaves?.length === state.nextIndex &&
      (await merkleRootsMatch(verify.hasher, indexerLeaves, state.root))
    ) {
      merkleDebug("sync:indexerFastPath", { leafCount: indexerLeaves.length });
      return { ...state, leaves: indexerLeaves };
    }

    const txRpcUrls = uniqueRpcUrls(config);
    const leaves = await syncMerkleLeaves(rpc, poolId, startLedger, onProgress, ledgerWindow, {
      aspGateId: config.contracts.aspGate ?? undefined,
      txRpcUrls,
      horizonUrl,
      archivedEvents: extras?.archivedEvents,
      archivedTxLeaves: extras?.archivedTxLeaves,
    });
    lastLeaves = leaves;

    merkleDebug("sync:attempt", {
      attempt,
      leafCount: leaves.length,
      nextIndex: state.nextIndex,
      onChainRoot: state.root,
    });

    if (leaves.length !== state.nextIndex) {
      if (attempt < 7) {
        merkleDebugWarn("sync:countMismatch", {
          attempt,
          leaves: leaves.length,
          nextIndex: state.nextIndex,
        });
        await new Promise((r) => setTimeout(r, 1200 + attempt * 400));
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
        if (attempt < 7) {
          merkleDebugWarn("sync:rootMismatchRetry", {
            attempt,
            incremental,
            batch,
            onChain: state.root,
          });
          await new Promise((r) => setTimeout(r, 1500 + attempt * 500));
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

  const gap = lastState.nextIndex - lastLeaves.length;
  throw new Error(
    gap > 0
      ? `Merkle leaf sync incomplete: rebuilt ${lastLeaves.length} of ${lastState.nextIndex} leaves (${gap} missing). ` +
          `Archived pool txs may be unavailable — ensure the indexer is running and Horizon is reachable, then retry.`
      : `Merkle leaf sync incomplete: rebuilt ${lastLeaves.length} leaves but on-chain next_index is ${lastState.nextIndex}`
  );
}

function extractCommitmentsFromEnvelope(
  envelopeXdr: string,
  poolId: string,
  aspGateId?: string
): Hex32[] {
  const out: Hex32[] = [];
  const envelope = asEnvelope(envelopeXdr);
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
