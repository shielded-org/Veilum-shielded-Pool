import { rpc } from "@stellar/stellar-sdk";

const { Server: SorobanRpc } = rpc;

const MAX_PAGES = 128;
const MAX_EMPTY_PAGES = 16;
const PAGE_LIMIT = 200;

function uniqueRpcUrls(primary, fallbacks = []) {
  return [...new Set([primary, ...fallbacks].filter(Boolean))];
}

async function fetchAllContractEvents(rpcClient, poolId, scanFrom, endLedger) {
  const events = [];
  let cursor;
  let pages = 0;
  let emptyStreak = 0;

  while (pages < MAX_PAGES) {
    const page = cursor
      ? await rpcClient.getEvents({
          cursor,
          filters: [{ type: "contract", contractIds: [poolId] }],
          limit: PAGE_LIMIT,
        })
      : await rpcClient.getEvents({
          startLedger: scanFrom,
          endLedger,
          filters: [{ type: "contract", contractIds: [poolId] }],
          limit: PAGE_LIMIT,
        });

    pages += 1;
    if (page.events.length > 0) {
      emptyStreak = 0;
      events.push(...page.events);
    } else {
      emptyStreak += 1;
    }

    if (!page.cursor) break;
    if (emptyStreak >= MAX_EMPTY_PAGES) break;
    cursor = page.cursor;
  }

  return events;
}

function scValToB64(val) {
  if (val == null) return null;
  if (typeof val === "string") return val;
  if (typeof val.toXDR === "function") return val.toXDR("base64");
  return null;
}

function serializeEvent(ev) {
  return {
    type: ev.type,
    ledger: ev.ledger,
    ledgerClosedAt: ev.ledgerClosedAt,
    contractId: ev.contractId,
    id: ev.id,
    pagingToken: ev.pagingToken,
    topic: (ev.topic ?? []).map(scValToB64).filter(Boolean),
    value: scValToB64(ev.value),
    txHash: ev.txHash,
    inSuccessfulContractCall: ev.inSuccessfulContractCall,
    transactionIndex: ev.transactionIndex,
    operationIndex: ev.operationIndex,
  };
}

/**
 * Tail pool contract events from RPC and return newly seen rows.
 */
export async function indexPoolEvents({ poolId, deployLedger, rpcUrls, store }) {
  const urls = uniqueRpcUrls(rpcUrls[0], rpcUrls.slice(1));
  let rpcClient = null;
  let latest = 0;
  let oldest = Number.MAX_SAFE_INTEGER;
  let rpcUrlUsed = urls[0];

  for (const url of urls) {
    try {
      const client = new SorobanRpc(url, { allowHttp: url.startsWith("http://") });
      const probe = await client.getLatestLedger();
      const page = await client.getEvents({
        startLedger: Math.max(probe.sequence - 100, 1),
        filters: [{ type: "contract", contractIds: [poolId] }],
        limit: 1,
      });
      const windowOldest = page.oldestLedger ?? probe.sequence;
      if (windowOldest < oldest) {
        oldest = windowOldest;
        latest = probe.sequence;
        rpcClient = client;
        rpcUrlUsed = url;
      }
    } catch {
      /* try next mirror */
    }
  }

  if (!rpcClient) {
    throw new Error("No RPC endpoint available for pool event indexing");
  }

  const prior = store.getPool(poolId);
  const desiredStart = Math.max((deployLedger ?? oldest) - 50, 1);
  const scanFrom = Math.max(
    prior?.lastIndexedLedger != null ? Math.max(prior.lastIndexedLedger - 5, oldest) : desiredStart,
    oldest
  );

  const raw = await fetchAllContractEvents(rpcClient, poolId, scanFrom, latest);
  const serialized = raw.map(serializeEvent);
  const pool = store.mergeEvents(poolId, deployLedger, serialized, latest);

  return {
    rpcUrl: rpcUrlUsed,
    scanFrom,
    latest,
    oldest,
    fetched: serialized.length,
    total: pool.events.length,
    lastIndexedLedger: pool.lastIndexedLedger,
  };
}
