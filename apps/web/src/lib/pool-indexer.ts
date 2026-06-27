import type { Api } from "@stellar/stellar-sdk";
import { scValToNative, xdr } from "@stellar/stellar-sdk";

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

/** Hydrate only fields needed to decrypt a channel-filtered route event. */
function hydrateRouteEventValue(row: IndexedPoolEventRow): Api.EventResponse {
  return {
    type: "contract",
    ledger: row.ledger,
    ledgerClosedAt: row.ledgerClosedAt ?? "",
    contractId: undefined,
    id: row.id ?? row.txHash,
    pagingToken: "",
    topic: [],
    value: row.value ? xdr.ScVal.fromXDR(row.value, "base64") : xdr.ScVal.scvVoid(),
    txHash: row.txHash,
    inSuccessfulContractCall: row.inSuccessfulContractCall ?? true,
    transactionIndex: row.transactionIndex,
    operationIndex: row.operationIndex,
  };
}

export type IndexerPoolStatus = {
  poolId: string;
  deployLedger: number | null;
  lastIndexedLedger: number | null;
  eventCount: number;
  oldestStoredLedger: number | null;
};

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

/** Indexer coverage for a pool — used to choose ledger ranges for note scan. */
export async function fetchIndexerPoolStatus(poolId: string): Promise<IndexerPoolStatus | null> {
  try {
    const { indexerUrl } = await getServiceUrls();
    const statusRes = await fetch(
      `${indexerUrl}/pool/${encodeURIComponent(poolId)}/status`,
      { cache: "no-store" }
    );
    if (statusRes.ok) {
      const body = (await statusRes.json()) as Partial<IndexerPoolStatus>;
      return {
        poolId: body.poolId ?? poolId,
        deployLedger: body.deployLedger ?? null,
        lastIndexedLedger: body.lastIndexedLedger ?? null,
        eventCount: body.eventCount ?? 0,
        oldestStoredLedger: body.oldestStoredLedger ?? null,
      };
    }
    const healthRes = await fetch(`${indexerUrl}/health`, { cache: "no-store" });
    if (!healthRes.ok) return null;
    const health = (await healthRes.json()) as {
      status?: Partial<IndexerPoolStatus>;
    };
    const st = health.status;
    if (!st) return null;
    return {
      poolId: st.poolId ?? poolId,
      deployLedger: st.deployLedger ?? null,
      lastIndexedLedger: st.lastIndexedLedger ?? null,
      eventCount: st.eventCount ?? 0,
      oldestStoredLedger: st.oldestStoredLedger ?? null,
    };
  } catch {
    return null;
  }
}

/** Archived pool contract events below the live RPC retention window. */
export async function fetchIndexerPoolEvents(
  poolId: string,
  fromLedger: number,
  toLedger: number,
  channelHex?: string
): Promise<{ events: Api.EventResponse[]; channelFiltered: boolean }> {
  const { indexerUrl } = await getServiceUrls();
  const url = new URL(`${indexerUrl}/pool/${encodeURIComponent(poolId)}/events`);
  url.searchParams.set("fromLedger", String(fromLedger));
  url.searchParams.set("toLedger", String(toLedger));
  const normalizedChannel = channelHex?.replace(/^0x/i, "").toLowerCase();
  if (normalizedChannel) {
    url.searchParams.set("channel", normalizedChannel);
  }
  const res = await fetch(url.toString(), { cache: "no-store" });
  if (!res.ok) {
    throw new Error(`Indexer events fetch failed (${res.status})`);
  }
  const body = (await res.json()) as {
    events?: IndexedPoolEventRow[];
    channel?: string | null;
  };
  const rows = body.events ?? [];
  const serverFiltered = Boolean(normalizedChannel && body.channel);
  if (serverFiltered) {
    return { events: rows.map(hydrateRouteEventValue), channelFiltered: true };
  }
  if (!normalizedChannel) {
    return { events: rows.map(hydrateEvent), channelFiltered: false };
  }
  const hydrated = rows.map(hydrateEvent);
  return {
    events: filterEventsByChannel(hydrated, normalizedChannel),
    channelFiltered: true,
  };
}

/** Route events for a viewing channel — indexer filters server-side (binary search on ledger). */
export async function fetchIndexerChannelRouteEvents(
  poolId: string,
  channelHex: string,
  fromLedger: number,
  toLedger: number
): Promise<Api.EventResponse[]> {
  const { events } = await fetchIndexerPoolEvents(poolId, fromLedger, toLedger, channelHex);
  return events;
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

/** Pool route events from the indexer for any ledger range. */
export async function tryFetchIndexerRouteEvents(
  poolId: string,
  fromLedger: number,
  toLedger: number,
  channelHex?: string
): Promise<{ events: Api.EventResponse[]; reachable: boolean; channelFiltered: boolean }> {
  if (fromLedger > toLedger) {
    return { events: [], reachable: true, channelFiltered: Boolean(channelHex) };
  }
  const cacheKey = `${poolId}:${channelHex ?? "all"}:${fromLedger}:${toLedger}`;
  const hit = indexerEventsCache.get(cacheKey);
  if (hit && Date.now() - hit.at < INDEXER_EVENTS_CACHE_TTL_MS) {
    return hit.result;
  }
  try {
    const { events, channelFiltered } = await fetchIndexerEventsWithRetry(
      poolId,
      fromLedger,
      toLedger,
      channelHex
    );
    const result = { events, reachable: true, channelFiltered };
    indexerEventsCache.set(cacheKey, { at: Date.now(), result });
    return result;
  } catch {
    const result = { events: [], reachable: false, channelFiltered: false };
    indexerEventsCache.set(cacheKey, { at: Date.now(), result });
    return result;
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
  return tryFetchIndexerRouteEvents(poolId, deployLedger, window.oldest - 1);
}

const INDEXER_EVENTS_CACHE_TTL_MS = 30_000;
const INDEXER_FETCH_RETRIES = 3;
const indexerEventsCache = new Map<
  string,
  {
    at: number;
    result: { events: Api.EventResponse[]; reachable: boolean; channelFiltered: boolean };
  }
>();

function bytes32FromTopic(topic: xdr.ScVal): string | null {
  try {
    const native = scValToNative(topic);
    if (native instanceof Uint8Array) {
      return Buffer.from(native).toString("hex").padStart(64, "0").slice(-64);
    }
    return null;
  } catch {
    return null;
  }
}

function eventMatchesChannel(ev: Api.EventResponse, channelHex: string): boolean {
  const topics = ev.topic ?? [];
  if (topics.length < 2) return false;
  try {
    const name = scValToNative(topics[0]);
    if (name !== "route") return false;
    const ch = bytes32FromTopic(topics[1]);
    return ch != null && ch.toLowerCase() === channelHex.replace(/^0x/i, "").toLowerCase();
  } catch {
    return false;
  }
}

function filterEventsByChannel(events: Api.EventResponse[], channelHex: string): Api.EventResponse[] {
  const normalized = channelHex.replace(/^0x/i, "").toLowerCase();
  return events.filter((ev) => eventMatchesChannel(ev, normalized));
}

async function fetchIndexerEventsWithRetry(
  poolId: string,
  fromLedger: number,
  toLedger: number,
  channelHex?: string
): Promise<{ events: Api.EventResponse[]; channelFiltered: boolean }> {
  let lastErr: unknown;
  for (let attempt = 0; attempt < INDEXER_FETCH_RETRIES; attempt++) {
    try {
      return await fetchIndexerPoolEvents(poolId, fromLedger, toLedger, channelHex);
    } catch (err) {
      lastErr = err;
      if (attempt < INDEXER_FETCH_RETRIES - 1) {
        await new Promise((r) => setTimeout(r, 400 * (attempt + 1)));
      }
    }
  }
  throw lastErr;
}
