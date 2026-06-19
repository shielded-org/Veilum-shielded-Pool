import { useEffect, useState } from "react";

import { loadNetworkConfig } from "../lib/config";
import {
  buildTokenFieldRegistry,
  buildTokenFieldRegistryOnChain,
  type TokenFieldRegistry,
} from "../lib/token-labels";
import { useWallet } from "./use-wallet";
import { useShieldedStore } from "../store/use-shielded-store";

export function useTokenRegistry() {
  const network = useShieldedStore((s) => s.network);
  const { address: wallet } = useWallet();
  const [registry, setRegistry] = useState<TokenFieldRegistry | null>(null);

  useEffect(() => {
    let cancelled = false;
    void loadNetworkConfig(network).then(async (config) => {
      const next = wallet
        ? await buildTokenFieldRegistryOnChain(config, wallet).catch(() =>
            buildTokenFieldRegistry(config.contracts)
          )
        : await buildTokenFieldRegistry(config.contracts);
      if (!cancelled) setRegistry(next);
    });
    return () => {
      cancelled = true;
    };
  }, [network, wallet]);

  return registry;
}
