import { useEffect, useState } from "react";

import {
  fetchEurUsdRate,
  readCachedEurUsdRate,
  readStaleEurUsdRate,
  type FxRateSnapshot,
} from "../lib/fx-rates";

type FxRatesState = {
  eurUsd: number | null;
  source: string | null;
  fetchedAt: number | null;
  loading: boolean;
  error: string | null;
};

export function useFxRates(enabled = true): FxRatesState {
  const [state, setState] = useState<FxRatesState>(() => {
    const cached = readCachedEurUsdRate();
    return {
      eurUsd: cached?.eurUsd ?? null,
      source: cached?.source ?? null,
      fetchedAt: cached?.fetchedAt ?? null,
      loading: enabled && !cached,
      error: null,
    };
  });

  useEffect(() => {
    if (!enabled) {
      setState((s) => ({ ...s, loading: false }));
      return;
    }

    let cancelled = false;

    (async () => {
      try {
        const snapshot: FxRateSnapshot = await fetchEurUsdRate();
        if (cancelled) return;
        setState({
          eurUsd: snapshot.eurUsd,
          source: snapshot.source,
          fetchedAt: snapshot.fetchedAt,
          loading: false,
          error: null,
        });
      } catch (e) {
        if (cancelled) return;
        const stale = readStaleEurUsdRate();
        if (stale) {
          setState({
            eurUsd: stale.eurUsd,
            source: `${stale.source} (cached)`,
            fetchedAt: stale.fetchedAt,
            loading: false,
            error: null,
          });
          return;
        }
        setState((s) => ({
          ...s,
          loading: false,
          error: e instanceof Error ? e.message : "FX rate unavailable",
        }));
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [enabled]);

  return state;
}
