import { atom } from "jotai";

import type { DisplayCurrency } from "../lib/portfolio-value";

const STORAGE_KEY = "veilum-display-currency";

function readStoredDisplayCurrency(): DisplayCurrency {
  if (typeof window === "undefined") return "USD";
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored === "USD" || stored === "EUR") return stored;
  } catch {
    /* private browsing */
  }
  return "USD";
}

export const displayCurrencyAtom = atom<DisplayCurrency>(readStoredDisplayCurrency());

export function persistDisplayCurrency(currency: DisplayCurrency) {
  try {
    localStorage.setItem(STORAGE_KEY, currency);
  } catch {
    /* ignore */
  }
}
