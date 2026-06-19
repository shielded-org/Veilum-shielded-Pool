import { Address, xdr } from "@stellar/stellar-sdk";

const INSERT_MEMBER = "insert_member";
const INVOKE_CONTRACT = "HostFunctionTypeHostFunctionTypeInvokeContract";

function decodeHorizonBytes(b64) {
  const scv = xdr.ScVal.fromXDR(b64, "base64");
  return `0x${Buffer.from(scv.bytes()).toString("hex")}`;
}

function decodeHorizonAddress(b64) {
  const scv = xdr.ScVal.fromXDR(b64, "base64");
  return Address.fromScAddress(scv.address()).toString();
}

function decodeHorizonSym(b64) {
  const scv = xdr.ScVal.fromXDR(b64, "base64");
  return scv.sym().toString();
}

function normalizeOwnerPk(ownerPk) {
  return ownerPk.replace(/^0x/i, "").toLowerCase();
}

function parseInsertMemberOp(op, contractId) {
  if (op.type !== "invoke_host_function") return null;
  if (!op.transaction_successful) return null;
  if (op.function !== INVOKE_CONTRACT) return null;
  const params = op.parameters;
  if (!params || params.length < 4) return null;
  if (decodeHorizonSym(params[1].value) !== INSERT_MEMBER) return null;
  if (decodeHorizonAddress(params[0].value) !== contractId) return null;
  return {
    ownerPk: decodeHorizonBytes(params[2].value),
    membershipBlinding: decodeHorizonBytes(params[3].value),
    createdAt: op.created_at,
    txHash: op.transaction_hash,
  };
}

/**
 * Index successful insert_member invocations from Horizon (newest-first scan, asc order output).
 * Uses on-chain next_index when available so we stop after the expected member count.
 */
export async function fetchMembershipInsertsFromHorizon({
  horizonUrl,
  sourceAddress,
  contractId,
  expectedCount = null,
  maxPages = 50,
}) {
  const found = [];
  let url = `${horizonUrl}/accounts/${sourceAddress}/operations?order=desc&limit=200`;
  let pages = 0;

  while (url && (expectedCount == null || found.length < expectedCount)) {
    pages += 1;
    if (pages > maxPages) {
      throw new Error(
        `Horizon membership index exceeded ${maxPages} pages — increase maxPages or check source account`
      );
    }

    const res = await fetch(url);
    if (!res.ok) {
      throw new Error(`Horizon operations fetch failed (${res.status})`);
    }
    const body = await res.json();

    for (const op of body._embedded?.records ?? []) {
      const insert = parseInsertMemberOp(op, contractId);
      if (!insert) continue;
      found.push(insert);
      if (expectedCount != null && found.length >= expectedCount) break;
    }

    if (expectedCount != null && found.length >= expectedCount) break;
    url = body._links?.next?.href ?? null;
  }

  found.reverse();
  return found.map((row, leafIndex) => ({ ...row, leafIndex }));
}

export function createHorizonMembershipIndexer({
  horizonUrl,
  sourceAddress,
  contractId,
  getExpectedCount,
  cacheTtlMs = 30_000,
}) {
  let cache = null;
  let cacheAt = 0;

  async function loadChain(force = false) {
    const expected =
      typeof getExpectedCount === "function" ? await getExpectedCount() : null;
    const now = Date.now();
    if (
      !force &&
      cache &&
      (expected == null || cache.length >= expected) &&
      now - cacheAt < cacheTtlMs
    ) {
      return expected != null ? cache.slice(0, expected) : cache;
    }

    cache = await fetchMembershipInsertsFromHorizon({
      horizonUrl,
      sourceAddress,
      contractId,
      expectedCount: expected,
    });
    cacheAt = now;
    return cache;
  }

  return {
    invalidate() {
      cache = null;
      cacheAt = 0;
    },
    async getIndexedMemberCount() {
      const chain = await loadChain();
      return chain.length;
    },
    async findLeafIndexForOwner(ownerPk) {
      const target = normalizeOwnerPk(ownerPk);
      const chain = await loadChain();
      const hit = chain.find((m) => normalizeOwnerPk(m.ownerPk) === target);
      return hit?.leafIndex ?? null;
    },
    async buildMembershipChainThrough(leafIndex) {
      const target = Number(leafIndex);
      if (!Number.isInteger(target) || target < 0) {
        throw new Error("Invalid ASP leaf index");
      }

      const expected =
        typeof getExpectedCount === "function" ? await getExpectedCount() : null;
      if (expected != null && target >= expected) {
        throw new Error(
          `ASP leaf index ${target} is not on-chain yet (next_index=${expected}) — membership insert may have failed`
        );
      }

      const chain = await loadChain();
      if (target >= chain.length) {
        throw new Error(
          `ASP Horizon index missing leaf ${target} (indexed ${chain.length} inserts) — re-index or wait for Horizon`
        );
      }

      return chain.slice(0, target + 1).map((m) => ({
        ownerPk: m.ownerPk,
        membershipBlinding: m.membershipBlinding,
        leafIndex: m.leafIndex,
      }));
    },
  };
}
