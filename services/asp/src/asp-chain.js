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

/** All on-chain membership inserts [0..next_index-1] for current-root proofs. */
export async function resolveFullMembershipChain({ aspReader, contractId, db }) {
  if (!aspReader?.getNextIndex || !aspReader?.buildMembershipChainThrough) {
    throw new Error("ASP Soroban reader not configured for full membership chain");
  }
  const nextIndex = await aspReader.getNextIndex();
  if (nextIndex <= 0) {
    throw new Error("ASP membership tree is empty");
  }
  const chain = await aspReader.buildMembershipChainThrough(nextIndex - 1);
  if (db && contractId) {
    const aspRoot = await aspReader.getLastRoot?.();
    backfillMembershipsFromChain(db, contractId, chain, aspRoot);
  }
  return { chain, nextIndex };
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
