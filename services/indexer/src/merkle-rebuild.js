/**
 * Build the ordered merkle leaf list from indexed pool events + per-tx leaf cache.
 */
export function buildOrderedLeavesFromPool(pool) {
  const events = pool?.events ?? [];
  const txLeaves = pool?.txLeaves ?? {};

  const sorted = [...events].sort(
    (a, b) =>
      a.ledger - b.ledger ||
      a.transactionIndex - b.transactionIndex ||
      a.operationIndex - b.operationIndex
  );

  const seenTx = new Set();
  const ordered = [];
  const missingTxs = [];

  for (const ev of sorted) {
    if (seenTx.has(ev.txHash)) continue;
    seenTx.add(ev.txHash);
    const leaves = txLeaves[ev.txHash];
    if (!leaves?.length) {
      missingTxs.push(ev.txHash);
      continue;
    }
    ordered.push(...leaves);
  }

  return {
    leaves: ordered,
    leafCount: ordered.length,
    txCount: seenTx.size,
    missingTxs,
    missingTxCount: missingTxs.length,
    lastIndexedLedger: pool?.lastIndexedLedger ?? null,
  };
}
