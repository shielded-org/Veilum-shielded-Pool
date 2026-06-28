import { atom } from "jotai";

export type ColorTheme = "light" | "dark";

const STORAGE_KEY = "veilum-color-theme";

function readStoredTheme(): ColorTheme {
  if (typeof window === "undefined") return "light";
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored === "light" || stored === "dark") return stored;
  } catch {
    /* private browsing */
  }
  return "light";
}

export const themeAtom = atom<ColorTheme>(readStoredTheme());

export function persistTheme(theme: ColorTheme) {
  try {
    localStorage.setItem(STORAGE_KEY, theme);
  } catch {
    /* ignore */
  }
}

export function getInitialTheme(): ColorTheme {
  return readStoredTheme();
}
