import type { NetworkName } from "./types";

const STELLAR_EXPERT_SEGMENT: Record<NetworkName, string | null> = {
  testnet: "testnet",
  mainnet: "public",
  futurenet: "futurenet",
  local: null,
};

/** Stellar Expert transaction URL for the active network. */
export function stellarExpertTxUrl(network: NetworkName, txHash: string): string | null {
  const segment = STELLAR_EXPERT_SEGMENT[network];
  const hash = txHash.replace(/^0x/i, "").toLowerCase();
  if (!segment || !/^[0-9a-f]{64}$/.test(hash)) return null;
  return `https://stellar.expert/explorer/${segment}/tx/${hash}`;
}

/** Stellar Expert Soroban contract URL. */
export function stellarExpertContractUrl(network: NetworkName, contractId: string): string | null {
  const segment = STELLAR_EXPERT_SEGMENT[network];
  if (!segment || !contractId?.startsWith("C")) return null;
  return `https://stellar.expert/explorer/${segment}/contract/${contractId}`;
}

/** Stellar Expert account URL. */
export function stellarExpertAccountUrl(network: NetworkName, address: string): string | null {
  const segment = STELLAR_EXPERT_SEGMENT[network];
  if (!segment || !address) return null;
  return `https://stellar.expert/explorer/${segment}/account/${address}`;
}
