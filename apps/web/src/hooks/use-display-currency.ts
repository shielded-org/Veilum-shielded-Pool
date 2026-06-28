import { useAtom } from "jotai";
import { useCallback } from "react";

import type { DisplayCurrency } from "../lib/portfolio-value";
import {
  displayCurrencyAtom,
  persistDisplayCurrency,
} from "../store/display-currency-atoms";

export function useDisplayCurrency() {
  const [displayCurrency, setDisplayCurrencyState] = useAtom(displayCurrencyAtom);

  const setDisplayCurrency = useCallback(
    (next: DisplayCurrency) => {
      setDisplayCurrencyState(next);
      persistDisplayCurrency(next);
    },
    [setDisplayCurrencyState]
  );

  return { displayCurrency, setDisplayCurrency };
}
