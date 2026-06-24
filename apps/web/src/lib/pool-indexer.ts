import type { Api } from "@stellar/stellar-sdk";
import { xdr } from "@stellar/stellar-sdk";

import type { RpcLedgerWindow } from "./rpc-events";
import { getServiceUrls } from "./service-urls";

export type IndexedPoolEventRow = {
  type?: string;
  id?: string;
  ledger: number;
  ledgerClosedAt?: string;
  topic?: string[];
  value?: string;
  txHash: string;
  transactionIndex: number;
  operationIndex: number;
  inSuccessfulContractCall?: boolean;
};

function hydrateEvent(row: IndexedPoolEventRow): Api.EventResponse {
  return {
    type: (row.type as Api.EventResponse["type"]) ?? "contract",
    ledger: row.ledger,
    ledgerClosedAt: row.ledgerClosedAt ?? "",
    contractId: undefined,
    id: row.id ?? row.txHash,
    pagingToken: "",
    topic: (row.topic ?? []).map((t) => xdr.ScVal.fromXDR(t, "base64")),
    value: row.value ? xdr.ScVal.fromXDR(row.value, "base64") : xdr.ScVal.scvVoid(),
    txHash: row.txHash,
    inSuccessfulContractCall: row.inSuccessfulContractCall ?? true,
    transactionIndex: row.transactionIndex,
    operationIndex: row.operationIndex,
  };
}

export async function fetchIndexerHealth(): Promise<{ ok: boolean; eventCount?: number }> {
  try {
    const { indexerUrl } = await getServiceUrls();
    const res = await fetch(`${indexerUrl}/health`, { cache: "no-store" });
    if (!res.ok) return { ok: false };
    const body = (await res.json()) as { ok?: boolean; status?: { eventCount?: number } };
    return { ok: Boolean(body.ok), eventCount: body.status?.eventCount };
  } catch {
    return { ok: false };
  }
}

/** Archived pool contract events below the live RPC retention window. */
export async function fetchIndexerPoolEvents(
  poolId: string,
  fromLedger: number,
  toLedger: number
): Promise<Api.EventResponse[]> {
  const { indexerUrl } = await getServiceUrls();
  const url = new URL(`${indexerUrl}/pool/${encodeURIComponent(poolId)}/events`);
  url.searchParams.set("fromLedger", String(fromLedger));
  url.searchParams.set("toLedger", String(toLedger));
  const res = await fetch(url.toString(), { cache: "no-store" });
  if (!res.ok) {
    throw new Error(`Indexer events fetch failed (${res.status})`);
  }
  const body = (await res.json()) as { events?: IndexedPoolEventRow[] };
  return (body.events ?? []).map(hydrateEvent);
}

/** Cached merkle leaf commitments per tx (from indexer). */
export async function fetchIndexerTxLeaves(
  poolId: string,
  txHashes: string[]
): Promise<Record<string, string[]>> {
  if (txHashes.length === 0) return {};
  const chunks: string[][] = [];
  const CHUNK = 24;
  for (let i = 0; i < txHashes.length; i += CHUNK) {
    chunks.push(txHashes.slice(i, i + CHUNK));
  }
  const merged: Record<string, string[]> = {};
  try {
    const { indexerUrl } = await getServiceUrls();
    for (const chunk of chunks) {
      const url = new URL(`${indexerUrl}/pool/${encodeURIComponent(poolId)}/tx-leaves`);
      url.searchParams.set("txHashes", chunk.join(","));
      const res = await fetch(url.toString(), { cache: "no-store" });
      if (!res.ok) continue;
      const body = (await res.json()) as { leaves?: Record<string, string[]> };
      Object.assign(merged, body.leaves ?? {});
    }
  } catch {
    /* indexer optional */
  }
  return merged;
}

/** Full per-tx merkle leaf map stored by the indexer. */
export async function fetchIndexerAllTxLeaves(poolId: string): Promise<Record<string, string[]>> {
  try {
    const { indexerUrl } = await getServiceUrls();
    const url = `${indexerUrl}/pool/${encodeURIComponent(poolId)}/tx-leaves`;
    const res = await fetch(url, { cache: "no-store" });
    if (!res.ok) return {};
    const body = (await res.json()) as { leaves?: Record<string, string[]> };
    return body.leaves ?? {};
  } catch {
    return {};
  }
}

export type IndexerOrderedMerkle = {
  leaves: string[];
  leafCount: number;
  txCount: number;
  missingTxCount: number;
  lastIndexedLedger: number | null;
};

/** Ordered merkle leaf list rebuilt and cached by the indexer. */
export async function fetchIndexerOrderedMerkleLeaves(
  poolId: string
): Promise<IndexerOrderedMerkle | null> {
  try {
    const { indexerUrl } = await getServiceUrls();
    const url = `${indexerUrl}/pool/${encodeURIComponent(poolId)}/merkle-leaves`;
    const res = await fetch(url, { cache: "no-store" });
    if (!res.ok) return null;
    return (await res.json()) as IndexerOrderedMerkle;
  } catch {
    return null;
  }
}

/** Events below the live RPC retention window (archived by the indexer). */
export async function tryFetchHistoryGapEvents(
  poolId: string,
  deployLedger: number | undefined,
  window: RpcLedgerWindow
): Promise<{ events: Api.EventResponse[]; reachable: boolean }> {
  if (!deployLedger || deployLedger <= 0 || deployLedger >= window.oldest) {
    return { events: [], reachable: true };
  }
  const cacheKey = `${poolId}:${deployLedger}:${window.oldest}`;
  const hit = gapCache.get(cacheKey);
  if (hit && Date.now() - hit.at < GAP_CACHE_TTL_MS) {
    return hit.result;
  }
  try {
    const events = await fetchGapWithRetry(poolId, deployLedger, window.oldest - 1);
    const result = { events, reachable: true };
    gapCache.set(cacheKey, { at: Date.now(), result });
    return result;
  } catch {
    // Gap only matters for pre-RPC deploy ledgers; live notes use Soroban RPC directly.
    const result = { events: [], reachable: true };
    gapCache.set(cacheKey, { at: Date.now(), result });
    return result;
  }
}

const GAP_CACHE_TTL_MS = 30_000;
const GAP_FETCH_RETRIES = 3;
const gapCache = new Map<string, { at: number; result: { events: Api.EventResponse[]; reachable: boolean } }>();

async function fetchGapWithRetry(
  poolId: string,
  fromLedger: number,
  toLedger: number
): Promise<Api.EventResponse[]> {
  let lastErr: unknown;
  for (let attempt = 0; attempt < GAP_FETCH_RETRIES; attempt++) {
    try {
      return await fetchIndexerPoolEvents(poolId, fromLedger, toLedger);
    } catch (err) {
      lastErr = err;
      if (attempt < GAP_FETCH_RETRIES - 1) {
        await new Promise((r) => setTimeout(r, 400 * (attempt + 1)));
      }
    }
  }
  throw lastErr;
}
