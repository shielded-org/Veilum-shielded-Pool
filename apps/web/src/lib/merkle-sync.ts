import { Address, xdr } from "@stellar/stellar-sdk";
import { rpc } from "@stellar/stellar-sdk";

const { Api, Server: SorobanRpc } = rpc;

import { getMerkleNextIndex, getMerkleRoot } from "./soroban";
import type { DecryptedNote, Hex32, NetworkConfig } from "./types";
import { bytes32Arg } from "./utils";

export type OnChainMerkleState = {
  nextIndex: number;
  root: Hex32;
};

export type ValidatedMerkleSync = OnChainMerkleState & {
  leaves: Hex32[];
};

function parseEnvelope(envelopeXdr: unknown): xdr.TransactionEnvelope | null {
  if (!envelopeXdr) return null;
  if (typeof envelopeXdr === "string") {
    return xdr.TransactionEnvelope.fromXDR(envelopeXdr, "base64");
  }
  return envelopeXdr as xdr.TransactionEnvelope;
}

function getEnvelopeOperations(envelope: xdr.TransactionEnvelope): xdr.Operation[] {
  const v1 = envelope.v1?.();
  if (v1) return v1.tx().operations();
  const v0 = envelope.v0?.();
  if (v0) return v0.tx().operations();
  const feeBump = envelope.feeBump?.();
  if (feeBump) {
    const inner = feeBump.tx().innerTx();
    const innerEnv = typeof inner.value === "function" ? inner.value() : inner;
    return getEnvelopeOperations(innerEnv as xdr.TransactionEnvelope);
  }
  return [];
}

type PoolEventRef = {
  txHash: string;
  ledger: number;
  transactionIndex: number;
  operationIndex: number;
};

const RPC_TIMEOUT_MS = 15_000;
const MAX_EVENT_PAGES = 8;

async function withRpcTimeout<T>(label: string, fn: () => Promise<T>): Promise<T> {
  return Promise.race([
    fn(),
    new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error(`${label} timeout`)), RPC_TIMEOUT_MS)
    ),
  ]);
}

async function getTransactionWithTimeout(
  rpc: SorobanRpc,
  txHash: string
): Promise<Api.GetTransactionResponse | null> {
  try {
    return await withRpcTimeout(`getTransaction ${txHash.slice(0, 8)}`, () =>
      rpc.getTransaction(txHash)
    );
  } catch {
    return null;
  }
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
  onProgress?: (p: MerkleSyncProgress) => void
): Promise<Hex32[]> {
  const eventRefs: PoolEventRef[] = [];
  let cursor: string | undefined;
  const latest = await withRpcTimeout("getLatestLedger", () => rpc.getLatestLedger());
  const endLedger = latest.sequence;
  const safeStart = Number.isFinite(startLedger) && startLedger > 0 ? startLedger : 1;
  const scanFrom = Math.min(safeStart, Math.max(endLedger - 5000, 1));

  onProgress?.({ phase: "events", events: 0 });

  for (let pages = 0; pages < MAX_EVENT_PAGES; pages++) {
    const page = await withRpcTimeout("getEvents", () =>
      cursor
        ? rpc.getEvents({
            cursor,
            filters: [{ type: "contract", contractIds: [poolId] }],
            limit: 200,
          })
        : rpc.getEvents({
            startLedger: scanFrom,
            endLedger,
            filters: [{ type: "contract", contractIds: [poolId] }],
            limit: 200,
          })
    );

    for (const ev of page.events) {
      eventRefs.push({
        txHash: ev.txHash,
        ledger: ev.ledger,
        transactionIndex: ev.transactionIndex,
        operationIndex: ev.operationIndex,
      });
    }

    onProgress?.({ phase: "events", events: eventRefs.length });

    // Soroban RPC keeps returning a cursor on empty pages — stop immediately.
    if (!page.cursor || page.events.length === 0) break;
    cursor = page.cursor;
  }

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

  for (let i = 0; i < uniqueRefs.length; i += BATCH) {
    const chunk = uniqueRefs.slice(i, i + BATCH);
    const parts = await Promise.all(
      chunk.map(async (ref) => {
        const tx = await getTransactionWithTimeout(rpc, ref.txHash);
        if (!tx || tx.status !== Api.GetTransactionStatus.SUCCESS) return [] as Hex32[];
        return extractCommitmentsFromTx(tx, poolId);
      })
    );
    for (const extracted of parts) leaves.push(...extracted);
    onProgress?.({ phase: "txs", txs: Math.min(i + BATCH, uniqueRefs.length), totalTxs: uniqueRefs.length });
  }

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

/**
 * Rebuild leaves from pool txs and verify count matches on-chain next_index.
 * Retries when RPC indexing lags behind the merkle contract.
 */
export async function syncMerkleLeavesValidated(
  rpc: SorobanRpc,
  config: NetworkConfig,
  wallet: string,
  poolId: string,
  merkleId: string,
  startLedger: number,
  onProgress?: (p: MerkleSyncProgress) => void
): Promise<ValidatedMerkleSync> {
  let lastLeaves: Hex32[] = [];
  let lastState: OnChainMerkleState = { nextIndex: 0, root: `0x${"00".repeat(32)}` as Hex32 };

  for (let attempt = 0; attempt < 4; attempt++) {
    const [state, leaves] = await Promise.all([
      readOnChainMerkleState(rpc, config, wallet, merkleId),
      syncMerkleLeaves(rpc, poolId, startLedger, onProgress),
    ]);
    lastState = state;
    lastLeaves = leaves;

    if (leaves.length === state.nextIndex) {
      return { ...state, leaves };
    }
    if (attempt < 3) {
      await new Promise((r) => setTimeout(r, 1200));
    }
  }

  throw new Error(
    `Merkle leaf sync incomplete: rebuilt ${lastLeaves.length} leaves but on-chain next_index is ${lastState.nextIndex}`
  );
}

function extractCommitmentsFromTx(tx: Api.GetTransactionResponse, poolId: string): Hex32[] {
  const out: Hex32[] = [];
  const envelope = parseEnvelope(tx.envelopeXdr);
  if (!envelope) return out;
  const ops = getEnvelopeOperations(envelope);
  for (const op of ops) {
    if (op.body().switch() !== xdr.OperationType.invokeHostFunction()) continue;
    const invoke = op.body().invokeHostFunctionOp();
    const host = invoke.hostFunction();
    if (host.switch() !== xdr.HostFunctionType.hostFunctionTypeInvokeContract()) continue;
    const invokeContract = host.invokeContract();
    const contract = Address.fromScAddress(invokeContract.contractAddress()).toString();
    if (contract !== poolId) continue;
    const fn = invokeContract.functionName().toString();
    const args = invokeContract.args();
    if (fn === "shield_routed" && args.length >= 4) {
      const c = scValBytesToHex32(args[3]);
      if (c) out.push(c);
    } else if (fn === "shielded_transfer_routed" && args.length >= 2) {
      const meta = scValBytesToHex(args[1]);
      if (meta.length >= 256) {
        out.push(`0x${meta.slice(128, 192)}` as Hex32, `0x${meta.slice(192, 256)}` as Hex32);
      }
    } else if (fn === "unshield" && args.length >= 7) {
      const c = scValBytesToHex32(args[6]);
      if (c && c !== `0x${"00".repeat(32)}`) out.push(c);
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
