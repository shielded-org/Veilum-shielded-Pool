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
  if (!segment || !txHash) return null;
  return `https://stellar.expert/explorer/${segment}/tx/${txHash}`;
}

/** Stellar Expert account URL. */
export function stellarExpertAccountUrl(network: NetworkName, address: string): string | null {
  const segment = STELLAR_EXPERT_SEGMENT[network];
  if (!segment || !address) return null;
  return `https://stellar.expert/explorer/${segment}/account/${address}`;
}
