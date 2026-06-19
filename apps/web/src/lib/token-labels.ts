import { tokenFieldFromContractId } from "./config";
import type { DeploymentAddresses, Hex32 } from "./types";
import type { NetworkConfig } from "./types";
import { getTokenField } from "./soroban";
import { createRpc } from "./soroban";
import { listStableTokens, STABLE_CATALOG, type ListedStable, type StableSymbol } from "./tokens";

export type TokenFieldRegistry = {
  byField: Map<string, ListedStable>;
  labelForField: (field: Hex32 | string | undefined) => string;
  symbolForField: (field: Hex32 | string | undefined) => string;
  nameForField: (field: Hex32 | string | undefined) => string;
  labelForSymbol: (symbol: StableSymbol) => string;
  labelForContractKey: (key: string) => string;
};

const CONTRACT_LABELS: Record<string, string> = {
  verifier: "UltraHonk Verifier",
  merkleTree: "Merkle Tree",
  shieldedPool: "Shielded Pool",
  network: "Network",
  deployLedger: "Deploy ledger",
  indexedRouteEvents: "Indexed route events",
};

export async function buildTokenFieldRegistry(
  contracts: DeploymentAddresses
): Promise<TokenFieldRegistry> {
  const byField = new Map<string, ListedStable>();

  for (const token of listStableTokens(contracts)) {
    const field = await tokenFieldFromContractId(token.contractId);
    byField.set(field.toLowerCase(), token);
  }

  function lookup(field: Hex32 | string | undefined): ListedStable | undefined {
    if (!field) return undefined;
    return byField.get(field.toLowerCase());
  }

  return {
    byField,
    labelForField(field) {
      const token = lookup(field);
      return token ? `${token.name} (${token.symbol})` : "Unknown token";
    },
    symbolForField(field) {
      return lookup(field)?.symbol ?? "—";
    },
    nameForField(field) {
      return lookup(field)?.name ?? "Unknown token";
    },
    labelForSymbol(symbol) {
      const meta = STABLE_CATALOG[symbol];
      return `${meta.name} (${meta.symbol})`;
    },
    labelForContractKey(key) {
      if (key.startsWith("token.")) {
        const sym = key.slice("token.".length) as StableSymbol;
        if (STABLE_CATALOG[sym]) return STABLE_CATALOG[sym].name;
      }
      return CONTRACT_LABELS[key] ?? key;
    },
  };
}

/** Resolve token fields from the pool contract (matches note.token on shielded notes). */
export async function buildTokenFieldRegistryOnChain(
  config: NetworkConfig,
  wallet: string
): Promise<TokenFieldRegistry> {
  const rpc = createRpc(config);
  const poolId = config.contracts.shieldedPool;
  const byField = new Map<string, ListedStable>();

  for (const token of listStableTokens(config.contracts)) {
    const field = await getTokenField(rpc, config, wallet, poolId, token.contractId);
    byField.set(field.toLowerCase(), token);
  }

  function lookup(field: Hex32 | string | undefined): ListedStable | undefined {
    if (!field) return undefined;
    return byField.get(field.toLowerCase());
  }

  return {
    byField,
    labelForField(field) {
      const token = lookup(field);
      return token ? `${token.name} (${token.symbol})` : "Unknown token";
    },
    symbolForField(field) {
      return lookup(field)?.symbol ?? "—";
    },
    nameForField(field) {
      return lookup(field)?.name ?? "Unknown token";
    },
    labelForSymbol(symbol) {
      const meta = STABLE_CATALOG[symbol];
      return `${meta.name} (${meta.symbol})`;
    },
    labelForContractKey(key) {
      if (key.startsWith("token.")) {
        const sym = key.slice("token.".length) as StableSymbol;
        if (STABLE_CATALOG[sym]) return STABLE_CATALOG[sym].name;
      }
      return CONTRACT_LABELS[key] ?? key;
    },
  };
}

export function summarizeUnspentBySymbol(
  notes: { token: Hex32; amount: bigint; spent?: boolean }[],
  registry: TokenFieldRegistry
): { symbol: string; amount: bigint; count: number }[] {
  const totals = new Map<string, { amount: bigint; count: number }>();

  for (const note of notes) {
    if (note.spent) continue;
    const symbol = registry.symbolForField(note.token);
    if (symbol === "—") continue;
    const prev = totals.get(symbol) ?? { amount: 0n, count: 0 };
    totals.set(symbol, { amount: prev.amount + note.amount, count: prev.count + 1 });
  }

  return Array.from(totals.entries())
    .map(([symbol, { amount, count }]) => ({ symbol, amount, count }))
    .sort((a, b) => (a.symbol < b.symbol ? -1 : 1));
}
