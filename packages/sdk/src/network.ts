import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import type { NetworkConfig, NetworkName } from "./types.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const networksPath = join(__dirname, "../../config/networks.json");

type RawNetworks = Record<
  string,
  {
    networkPassphrase: string;
    rpcUrl: string;
    horizonUrl: string;
    friendbotUrl?: string;
    sourceAccount: string;
    containerName?: string;
  }
>;

export function loadNetworkConfig(name: NetworkName = "futurenet"): NetworkConfig {
  const raw = JSON.parse(readFileSync(networksPath, "utf8")) as RawNetworks;
  const base = raw[name];
  if (!base) throw new Error(`Unknown network: ${name}`);
  return {
    ...base,
    contracts: {},
  };
}

export function mergeDeployment(
  config: NetworkConfig,
  deployment: Partial<NetworkConfig["contracts"]>
): NetworkConfig {
  return {
    ...config,
    contracts: {
      ...config.contracts,
      ...deployment,
    },
  };
}
