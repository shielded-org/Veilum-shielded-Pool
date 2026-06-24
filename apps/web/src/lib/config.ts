import type { DeploymentAddresses, NetworkConfig, NetworkName } from "./types";

type RawNetwork = {
  networkPassphrase: string;
  rpcUrl: string;
  eventsRpcUrls?: string[];
  horizonUrl?: string;
  friendbotUrl?: string;
};

let cachedNetworks: Record<string, RawNetwork> | null = null;
let cachedDeployment: DeploymentAddresses | null = null;

export function clearConfigCache() {
  cachedNetworks = null;
  cachedDeployment = null;
}

export async function loadNetworks(): Promise<Record<string, RawNetwork>> {
  if (cachedNetworks) return cachedNetworks;
  const res = await fetch("/config/networks.json");
  if (!res.ok) throw new Error("Missing /config/networks.json");
  cachedNetworks = (await res.json()) as Record<string, RawNetwork>;
  return cachedNetworks;
}

export async function loadDeployment(): Promise<DeploymentAddresses> {
  if (cachedDeployment) return cachedDeployment;
  const res = await fetch("/deployment.json", { cache: "no-store" });
  if (!res.ok) throw new Error("Missing /deployment.json");
  cachedDeployment = (await res.json()) as DeploymentAddresses;
  return cachedDeployment;
}

export async function loadNetworkConfig(name: NetworkName = "testnet"): Promise<NetworkConfig> {
  const networks = await loadNetworks();
  const deployment = await loadDeployment();
  const base = networks[name];
  if (!base) throw new Error(`Unknown network: ${name}`);
  const config: NetworkConfig = { ...base, contracts: deployment };
  if (!config.horizonUrl) {
    config.horizonUrl = defaultHorizonUrl(name);
  }
  return config;
}

const HORIZON_DEFAULTS: Record<NetworkName, string> = {
  local: "http://localhost:8000",
  testnet: "https://horizon-testnet.stellar.org",
  futurenet: "https://horizon-futurenet.stellar.org",
  mainnet: "https://horizon.stellar.org",
};

/** Ensure merkle tx recovery always has a Horizon archive endpoint. */
export function defaultHorizonUrl(network: NetworkName = "testnet"): string {
  return HORIZON_DEFAULTS[network] ?? HORIZON_DEFAULTS.testnet;
}

export function resolveHorizonUrl(config: NetworkConfig, network: NetworkName = "testnet"): string {
  return config.horizonUrl?.trim() || defaultHorizonUrl(network);
}

export async function tokenFieldFromContractId(contractId: string): Promise<`0x${string}`> {
  const enc = new TextEncoder().encode(contractId);
  const buf = await crypto.subtle.digest("SHA-256", enc);
  const arr = new Uint8Array(buf);
  arr[0] = 0;
  return `0x${Array.from(arr)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("")}` as `0x${string}`;
}
