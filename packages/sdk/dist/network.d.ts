import type { NetworkConfig, NetworkName } from "./types.js";
export declare function loadNetworkConfig(name?: NetworkName): NetworkConfig;
export declare function mergeDeployment(config: NetworkConfig, deployment: Partial<NetworkConfig["contracts"]>): NetworkConfig;
