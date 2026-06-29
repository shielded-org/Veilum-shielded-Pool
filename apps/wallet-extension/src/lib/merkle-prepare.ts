import type { Api } from "@stellar/stellar-sdk";

import type { RpcLedgerWindow } from "./rpc-events";
import { historyGapBeforeWindow } from "./rpc-events";
import {
  fetchIndexerAllTxLeaves,
  fetchIndexerOrderedMerkleLeaves,
  fetchIndexerPoolStatus,
  tryFetchHistoryGapEvents,
  tryFetchIndexerRouteEvents,
} from "./pool-indexer";
import type { Hex32 } from "./types";

export type MerkleIndexerCache = {
  archivedEvents: Api.EventResponse[];
  archivedTxLeaves: Record<string, Hex32[]>;
  orderedLeaves: Hex32[] | null;
  orderedLeafCount: number;
  orderedMissingTxCount: number;
  lastIndexedLedger: number | null;
};

/** Load indexer-backed merkle data (gap events, per-tx leaves, ordered snapshot). */
export async function prepareMerkleIndexerCache(
  poolId: string,
  deployLedger: number | undefined,
  window: RpcLedgerWindow
): Promise<MerkleIndexerCache> {
  let archivedEvents: Api.EventResponse[] = [];
  const status = await fetchIndexerPoolStatus(poolId);
  const from =
    deployLedger && deployLedger > 0
      ? deployLedger
      : (status?.oldestStoredLedger ?? window.oldest);
  const to =
    status?.lastIndexedLedger != null
      ? Math.min(status.lastIndexedLedger, window.latest)
      : null;

  if (to != null && from <= to) {
    const fetched = await tryFetchIndexerRouteEvents(poolId, from, to);
    if (fetched.reachable) {
      archivedEvents = fetched.events;
    }
  } else if (historyGapBeforeWindow(deployLedger, window)) {
    const gap = await tryFetchHistoryGapEvents(poolId, deployLedger, window);
    archivedEvents = gap.events;
  }

  const [allTxLeaves, ordered] = await Promise.all([
    fetchIndexerAllTxLeaves(poolId),
    fetchIndexerOrderedMerkleLeaves(poolId),
  ]);

  const archivedTxLeaves = Object.fromEntries(
    Object.entries(allTxLeaves).map(([hash, leaves]) => [hash, leaves as Hex32[]])
  );

  return {
    archivedEvents,
    archivedTxLeaves,
    orderedLeaves: ordered?.leaves?.length ? (ordered.leaves as Hex32[]) : null,
    orderedLeafCount: ordered?.leafCount ?? 0,
    orderedMissingTxCount: ordered?.missingTxCount ?? 0,
    lastIndexedLedger: ordered?.lastIndexedLedger ?? null,
  };
}
