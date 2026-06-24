import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";

import { buildOrderedLeavesFromPool } from "./merkle-rebuild.js";

function eventKey(ev) {
  if (ev.id) return ev.id;
  return `${ev.txHash}:${ev.ledger}:${ev.transactionIndex}:${ev.operationIndex}`;
}

export function createEventStore(dataDir) {
  mkdirSync(dataDir, { recursive: true });
  const filePath = path.join(dataDir, "pool-events.json");

  function load() {
    if (!existsSync(filePath)) {
      return { pools: {} };
    }
    try {
      return JSON.parse(readFileSync(filePath, "utf8"));
    } catch {
      return { pools: {} };
    }
  }

  function save(data) {
    writeFileSync(filePath, JSON.stringify(data, null, 2));
  }

  return {
    getPool(poolId) {
      const data = load();
      return data.pools[poolId] ?? null;
    },

    getStatus(poolId) {
      const pool = this.getPool(poolId);
      if (!pool) return null;
      const events = pool.events ?? [];
      const oldestLedger =
        events.length > 0 ? Math.min(...events.map((e) => e.ledger)) : pool.deployLedger ?? null;
      return {
        poolId,
        deployLedger: pool.deployLedger ?? null,
        lastIndexedLedger: pool.lastIndexedLedger ?? null,
        eventCount: events.length,
        oldestStoredLedger: oldestLedger,
        merkleLeafCount: pool.merkleLeafCount ?? pool.orderedLeaves?.length ?? 0,
        merkleTxCount: pool.merkleTxCount ?? null,
        merkleMissingTxCount: pool.merkleMissingTxCount ?? null,
        updatedAt: pool.updatedAt ?? null,
      };
    },

    queryEvents(poolId, fromLedger, toLedger) {
      const pool = this.getPool(poolId);
      if (!pool?.events?.length) return [];
      const from = Number(fromLedger) || 0;
      const to = Number(toLedger) || Number.MAX_SAFE_INTEGER;
      return pool.events.filter((e) => e.ledger >= from && e.ledger <= to);
    },

    mergeEvents(poolId, deployLedger, newEvents, lastIndexedLedger) {
      const data = load();
      const existing = data.pools[poolId]?.events ?? [];
      const seen = new Set(existing.map(eventKey));
      const merged = [...existing];
      for (const ev of newEvents) {
        const key = eventKey(ev);
        if (seen.has(key)) continue;
        seen.add(key);
        merged.push(ev);
      }
      merged.sort(
        (a, b) =>
          a.ledger - b.ledger ||
          a.transactionIndex - b.transactionIndex ||
          a.operationIndex - b.operationIndex
      );
      data.pools[poolId] = {
        deployLedger: deployLedger ?? data.pools[poolId]?.deployLedger ?? null,
        lastIndexedLedger,
        events: merged,
        txLeaves: data.pools[poolId]?.txLeaves ?? {},
        orderedLeaves: data.pools[poolId]?.orderedLeaves ?? [],
        merkleLeafCount: data.pools[poolId]?.merkleLeafCount ?? 0,
        merkleTxCount: data.pools[poolId]?.merkleTxCount ?? 0,
        merkleMissingTxCount: data.pools[poolId]?.merkleMissingTxCount ?? 0,
        updatedAt: new Date().toISOString(),
      };
      save(data);
      return data.pools[poolId];
    },

    mergeTxLeaves(poolId, txHash, leaves) {
      if (!leaves?.length) return;
      const data = load();
      const pool = data.pools[poolId];
      if (!pool) return;
      const txLeaves = { ...(pool.txLeaves ?? {}) };
      if (!txLeaves[txHash]) {
        txLeaves[txHash] = leaves;
        data.pools[poolId] = { ...pool, txLeaves, updatedAt: new Date().toISOString() };
        save(data);
      }
    },

    getTxLeaves(poolId, txHashes) {
      const pool = this.getPool(poolId);
      const map = pool?.txLeaves ?? {};
      const out = {};
      for (const hash of txHashes) {
        if (map[hash]?.length) out[hash] = map[hash];
      }
      return out;
    },

    getAllTxLeaves(poolId) {
      const pool = this.getPool(poolId);
      return pool?.txLeaves ?? {};
    },

    rebuildOrderedMerkleLeaves(poolId) {
      const data = load();
      const pool = data.pools[poolId];
      if (!pool) return null;

      const built = buildOrderedLeavesFromPool(pool);
      data.pools[poolId] = {
        ...pool,
        orderedLeaves: built.leaves,
        merkleLeafCount: built.leafCount,
        merkleTxCount: built.txCount,
        merkleMissingTxCount: built.missingTxCount,
        updatedAt: new Date().toISOString(),
      };
      save(data);
      return built;
    },

    getOrderedMerkleLeaves(poolId) {
      const pool = this.getPool(poolId);
      if (!pool) return null;
      if (pool.orderedLeaves?.length) {
        return {
          leaves: pool.orderedLeaves,
          leafCount: pool.merkleLeafCount ?? pool.orderedLeaves.length,
          txCount: pool.merkleTxCount ?? 0,
          missingTxCount: pool.merkleMissingTxCount ?? 0,
          lastIndexedLedger: pool.lastIndexedLedger ?? null,
        };
      }
      return this.rebuildOrderedMerkleLeaves(poolId);
    },
  };
}
