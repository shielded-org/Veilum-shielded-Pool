import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
const __dirname = dirname(fileURLToPath(import.meta.url));
const networksPath = join(__dirname, "../../config/networks.json");
export function loadNetworkConfig(name = "futurenet") {
    const raw = JSON.parse(readFileSync(networksPath, "utf8"));
    const base = raw[name];
    if (!base)
        throw new Error(`Unknown network: ${name}`);
    return {
        ...base,
        contracts: {},
    };
}
export function mergeDeployment(config, deployment) {
    return {
        ...config,
        contracts: {
            ...config.contracts,
            ...deployment,
        },
    };
}
