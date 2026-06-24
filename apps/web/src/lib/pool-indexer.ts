import { xdr } from "@stellar/stellar-sdk";
import { rpc } from "@stellar/stellar-sdk";

import type { RpcLedgerWindow } from "./rpc-events";
import { getServiceUrls } from "./service-urls";

const { Api } = rpc;

export type IndexedPoolEventRow = {
  type?: string;
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
    id: row.txHash,
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

/** Events below the live RPC retention window (archived by the indexer). */
export async function tryFetchHistoryGapEvents(
  poolId: string,
  deployLedger: number | undefined,
  window: RpcLedgerWindow
): Promise<{ events: Api.EventResponse[]; reachable: boolean }> {
  if (!deployLedger || deployLedger <= 0 || deployLedger >= window.oldest) {
    return { events: [], reachable: true };
  }
  try {
    const events = await fetchIndexerPoolEvents(poolId, deployLedger, window.oldest - 1);
    return { events, reachable: true };
  } catch {
    return { events: [], reachable: false };
  }
}
