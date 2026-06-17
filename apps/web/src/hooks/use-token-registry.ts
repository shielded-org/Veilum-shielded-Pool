import { useEffect, useState } from "react";

import { loadNetworkConfig } from "../lib/config";
import { buildTokenFieldRegistry, type TokenFieldRegistry } from "../lib/token-labels";
import { useShieldedStore } from "../store/use-shielded-store";

export function useTokenRegistry() {
  const network = useShieldedStore((s) => s.network);
  const [registry, setRegistry] = useState<TokenFieldRegistry | null>(null);

  useEffect(() => {
    let cancelled = false;
    void loadNetworkConfig(network).then(async (config) => {
      const next = await buildTokenFieldRegistry(config.contracts);
      if (!cancelled) setRegistry(next);
    });
    return () => {
      cancelled = true;
    };
  }, [network]);

  return registry;
}
