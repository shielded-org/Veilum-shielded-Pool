import { useAtom } from "jotai";
import { createContext, useCallback, useContext, useEffect, type ReactNode } from "react";

import { applyWalletKitTheme } from "../lib/wallet-kit";
import {
  getInitialTheme,
  persistTheme,
  themeAtom,
  type ColorTheme,
} from "../store/theme-atoms";

type ThemeContextValue = {
  theme: ColorTheme;
  setTheme: (theme: ColorTheme) => void;
  toggleTheme: () => void;
  isDark: boolean;
};

const ThemeContext = createContext<ThemeContextValue | null>(null);

function applyDocumentTheme(theme: ColorTheme) {
  document.documentElement.dataset.theme = theme;
  document.documentElement.style.colorScheme = theme;
  applyWalletKitTheme(theme);
}

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [theme, setThemeState] = useAtom(themeAtom);

  const setTheme = useCallback(
    (next: ColorTheme) => {
      setThemeState(next);
      persistTheme(next);
      applyDocumentTheme(next);
    },
    [setThemeState]
  );

  const toggleTheme = useCallback(() => {
    setTheme(theme === "dark" ? "light" : "dark");
  }, [setTheme, theme]);

  useEffect(() => {
    applyDocumentTheme(theme);
  }, [theme]);

  return (
    <ThemeContext.Provider
      value={{
        theme,
        setTheme,
        toggleTheme,
        isDark: theme === "dark",
      }}
    >
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme() {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error("useTheme must be used within ThemeProvider");
  return ctx;
}

/** Apply theme before React hydrates (see index.html). */
export function bootstrapTheme() {
  const theme = getInitialTheme();
  applyDocumentTheme(theme);
}
