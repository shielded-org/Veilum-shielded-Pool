import { loadNetworkConfig } from "./config";
import { commitmentKey, isConfirmedOnChainNote } from "./note-store";
import { buildTokenFieldRegistryOnChain } from "./token-labels";
import { scanDebug } from "./scan-debug";
import type { DecryptedNote, NetworkName, TransactionRecord } from "./types";
import { formatTokenAmount } from "./utils";
import { useShieldedStore } from "../store/use-shielded-store";

/** Stable activity id for a discovered incoming note (dedupes across syncs). */
export function incomingActivityId(note: DecryptedNote): string {
  const tx = note.txHash?.replace(/^0x/i, "").toLowerCase() ?? "unknown";
  return `recv-${commitmentKey(note.commitment)}-${tx}`;
}

function normalizeTxHash(txHash: string | undefined | null): string | null {
  if (!txHash) return null;
  const h = txHash.replace(/^0x/i, "").toLowerCase();
  return /^[0-9a-f]{64}$/.test(h) ? h : null;
}

/** Tx hashes from transfers/shields/unshields this wallet initiated in the app. */
function userInitiatedTxHashes(transactions: TransactionRecord[]): Set<string> {
  const out = new Set<string>();
  for (const tx of transactions) {
    if (tx.type === "receive") continue;
    const h = normalizeTxHash(tx.txHash);
    if (h) out.add(h);
  }
  return out;
}

/** Stable activity id for a shield deposit note discovered on-chain (backfill). */
export function shieldDepositActivityId(note: DecryptedNote): string {
  const tx = note.txHash?.replace(/^0x/i, "").toLowerCase() ?? "unknown";
  return `shield-${commitmentKey(note.commitment)}-${tx}`;
}

const sourceAccountCache = new Map<string, string | null>();

async function fetchTxSourceAccount(
  horizonUrl: string | undefined,
  txHash: string
): Promise<string | null> {
  const key = txHash.toLowerCase();
  if (sourceAccountCache.has(key)) return sourceAccountCache.get(key) ?? null;

  const bases = [
    horizonUrl,
    "https://horizon-testnet.stellar.org",
    "https://horizon.stellar.org",
  ]
    .filter(Boolean)
    .map((u) => u!.replace(/\/$/, ""));
  const unique = [...new Set(bases)];

  for (const base of unique) {
    try {
      const res = await fetch(`${base}/transactions/${txHash}`, { cache: "no-store" });
      if (res.status === 404) continue;
      if (!res.ok) continue;
      const body = (await res.json()) as { source_account?: string };
      const source = body.source_account ?? null;
      sourceAccountCache.set(key, source);
      return source;
    } catch {
      /* try next horizon */
    }
  }

  sourceAccountCache.set(key, null);
  return null;
}

/**
 * Register incoming private transfers and shield deposits discovered from indexer/RPC scans.
 * Skips notes tied to txs this wallet already initiated in-app (change, etc.).
 */
export async function recordIncomingTransferActivity(params: {
  wallet: string;
  network: NetworkName;
  poolId: string;
  notes: DecryptedNote[];
}): Promise<number> {
  const state = useShieldedStore.getState();
  const existing = state.getWalletTransactions(params.wallet);
  const knownIds = new Set(existing.map((t) => t.id));
  const ownTxHashes = userInitiatedTxHashes(existing);

  const config = await loadNetworkConfig(params.network);
  const registry = await buildTokenFieldRegistryOnChain(config, params.wallet);

  let added = 0;

  let receives = 0;
  let shields = 0;

  for (const note of params.notes) {
    if (!isConfirmedOnChainNote(note)) continue;

    const txH = normalizeTxHash(note.txHash);
    if (txH && ownTxHashes.has(txH)) continue;

    const token = registry.byField.get(note.token.toLowerCase());
    const symbol = registry.symbolForField(note.token);
    if (symbol === "—") continue;

    const decimals = token?.decimals ?? 7;
    const amountLabel = `${formatTokenAmount(note.amount, decimals)} ${symbol}`;

    let type: "receive" | "shield" = "receive";
    let id = incomingActivityId(note);
    let detail = "Received privately";

    if (txH) {
      const source = await fetchTxSourceAccount(config.horizonUrl, txH);
      if (source === params.wallet) {
        type = "shield";
        id = shieldDepositActivityId(note);
        detail = "Shield deposit (discovered on-chain)";
      }
    }

    if (knownIds.has(id)) continue;

    state.addTransaction(params.wallet, {
      id,
      walletAddress: params.wallet,
      type,
      status: "confirmed",
      amount: amountLabel,
      txHash: txH ?? undefined,
      contractId: params.poolId,
      createdAt: note.createdAt ?? new Date().toISOString(),
      detail,
    });
    knownIds.add(id);
    added += 1;
    if (type === "shield") shields += 1;
    else receives += 1;
  }

  if (added > 0) {
    scanDebug("activity:incomingRecorded", {
      wallet: params.wallet.slice(0, 8),
      receives,
      shields,
    });
  }

  return added;
}
