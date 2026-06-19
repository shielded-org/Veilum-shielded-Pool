import { createHorizonMembershipIndexer } from "./asp-tx-index.js";

export function extendAspSorobanReader(reader, { horizonUrl, sourceAddress, contractId }) {
  const horizonIndexer =
    horizonUrl && sourceAddress && contractId
      ? createHorizonMembershipIndexer({
          horizonUrl,
          sourceAddress,
          contractId,
          getExpectedCount: async () =>
            Number(await reader.simulateRead("get_next_index", [])),
        })
      : null;

  return {
    ...reader,
    async getNextIndex() {
      return Number(await reader.simulateRead("get_next_index", []));
    },
    invalidateMembershipIndex() {
      horizonIndexer?.invalidate();
    },
    async findLeafIndexForOwner(ownerPk) {
      if (!horizonIndexer) {
        throw new Error("Horizon membership indexer not configured");
      }
      return horizonIndexer.findLeafIndexForOwner(ownerPk);
    },
    async buildMembershipChainThrough(leafIndex) {
      if (!horizonIndexer) {
        throw new Error("Horizon membership indexer not configured");
      }
      return horizonIndexer.buildMembershipChainThrough(leafIndex);
    },
  };
}

/** Backfill local registry from indexed on-chain inserts. */
export function backfillMembershipsFromChain(db, contractId, chain, aspRoot) {
  if (!Array.isArray(db.memberships)) db.memberships = [];
  for (const m of chain) {
    const exists = db.memberships.some(
      (row) =>
        row.leafIndex === m.leafIndex &&
        row.ownerPk?.toLowerCase() === m.ownerPk.toLowerCase() &&
        (!contractId || !row.contractId || row.contractId === contractId)
    );
    if (exists) continue;
    db.memberships.push({
      ownerPk: m.ownerPk,
      membershipBlinding: m.membershipBlinding,
      leafIndex: m.leafIndex,
      aspRoot: aspRoot ?? null,
      contractId,
      approvedAt: new Date().toISOString(),
      source: "horizon-index",
    });
  }
}

export async function resolveMembershipChain({
  db,
  aspReader,
  contractId,
  ownerPk,
  leafIndexHint,
}) {
  let leafIndex = leafIndexHint;

  if (aspReader?.findLeafIndexForOwner) {
    const onChainIndex = await aspReader.findLeafIndexForOwner(ownerPk);
    if (onChainIndex == null) {
      throw new Error(
        "ASP membership not found on-chain — compliance may be stale; re-run compliance scan"
      );
    }
    leafIndex = onChainIndex;
  }

  if (aspReader?.buildMembershipChainThrough) {
    return {
      leafIndex,
      chain: await aspReader.buildMembershipChainThrough(leafIndex),
    };
  }

  const { getCanonicalMembershipChain } = await import("./asp-pipeline.js");
  return {
    leafIndex,
    chain: getCanonicalMembershipChain(db, contractId, leafIndex),
  };
}
