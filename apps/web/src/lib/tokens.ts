import type { DeploymentAddresses, Hex32, NetworkConfig } from "./types";
import { tokenFieldFromContractId } from "./config";
import { createRpc, getTokenDecimals, getTokenField } from "./soroban";

export type StableSymbol = "USDC" | "EURC" | "YLDS" | "MGUSD";

export type StableTokenMeta = {
  symbol: StableSymbol;
  name: string;
  description: string;
  decimals: number;
};

export const STABLE_CATALOG: Record<StableSymbol, StableTokenMeta> = {
  USDC: {
    symbol: "USDC",
    name: "USD Coin",
    description: "Circle's flagship USD stablecoin (mock testnet)",
    decimals: 7,
  },
  EURC: {
    symbol: "EURC",
    name: "Euro Coin",
    description: "Circle's euro-pegged stablecoin (mock testnet)",
    decimals: 7,
  },
  YLDS: {
    symbol: "YLDS",
    name: "Figure YLDS",
    description: "Regulated yield-bearing dollar (mock testnet)",
    decimals: 7,
  },
  MGUSD: {
    symbol: "MGUSD",
    name: "MoneyGram USD",
    description: "MoneyGram USD-backed stablecoin (mock testnet)",
    decimals: 7,
  },
};

export type ListedStable = StableTokenMeta & { contractId: string };

/** All stable tokens with contract IDs from deployment. */
export function listStableTokens(contracts: DeploymentAddresses): ListedStable[] {
  const tokens = contracts.tokens ?? {};
  const out: ListedStable[] = [];

  for (const symbol of Object.keys(STABLE_CATALOG) as StableSymbol[]) {
    const contractId = tokens[symbol];
    if (!contractId) continue;
    out.push({ ...STABLE_CATALOG[symbol], contractId });
  }

  return out;
}

export function defaultStableSymbol(contracts: DeploymentAddresses): StableSymbol {
  const listed = listStableTokens(contracts);
  return listed[0]?.symbol ?? "USDC";
}

export function resolveStableContract(
  contracts: DeploymentAddresses,
  symbol: StableSymbol
): string {
  const token = listStableTokens(contracts).find((t) => t.symbol === symbol);
  if (!token) throw new Error(`Stable token ${symbol} not deployed`);
  return token.contractId;
}

/** Load stables from deployment and resolve decimals from each token contract. */
export async function loadStableTokensWithDecimals(
  config: NetworkConfig,
  source: string
): Promise<ListedStable[]> {
  const rpc = createRpc(config);
  const listed = listStableTokens(config.contracts);
  return Promise.all(
    listed.map(async (token) => {
      try {
        const decimals = await getTokenDecimals(rpc, config, source, token.contractId);
        return { ...token, decimals };
      } catch {
        return token;
      }
    })
  );
}

/** Map a note's token field back to a contract id via the pool's token_field registry. */
export async function resolveContractForTokenField(
  config: NetworkConfig,
  wallet: string,
  tokenField: Hex32
): Promise<string> {
  const rpc = createRpc(config);
  const poolId = config.contracts.shieldedPool;
  for (const stable of listStableTokens(config.contracts)) {
    const field = await getTokenField(rpc, config, wallet, poolId, stable.contractId);
    if (field.toLowerCase() === tokenField.toLowerCase()) return stable.contractId;
  }
  throw new Error("Unknown token field on note — redeploy stables or refresh config");
}

/** Client-side token field for a contract (matches on-chain pool mapping). */
export async function tokenFieldForContract(contractId: string): Promise<Hex32> {
  return tokenFieldFromContractId(contractId);
}
