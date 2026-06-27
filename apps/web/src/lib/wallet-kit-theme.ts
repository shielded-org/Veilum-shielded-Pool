import type { SwkAppTheme } from "@creit.tech/stellar-wallets-kit";

import type { ColorTheme } from "../store/theme-atoms";

/** Stellar Wallets Kit theme aligned with Veilum (dark + teal accent). */
export const VEILUM_WALLET_KIT_THEME_DARK: SwkAppTheme = {
  background: "oklch(13% 0.014 75)",
  "background-secondary": "oklch(8% 0.012 75)",
  "foreground-strong": "oklch(96% 0.01 90)",
  foreground: "oklch(96% 0.01 90)",
  "foreground-secondary": "oklch(68% 0.02 90)",
  primary: "oklch(78% 0.14 175)",
  "primary-foreground": "oklch(8% 0.012 75)",
  transparent: "rgba(0, 0, 0, 0)",
  lighter: "oklch(13% 0.014 75)",
  light: "oklch(11% 0.02 200)",
  "light-gray": "oklch(52% 0.02 90)",
  gray: "oklch(68% 0.02 90)",
  danger: "oklch(62% 0.18 25)",
  border: "oklch(24% 0.015 75 / 0.85)",
  shadow: "0 24px 48px -12px oklch(0% 0 0 / 0.55), 0 0 0 1px oklch(78% 0.14 175 / 0.12)",
  "border-radius": "1rem",
  "font-family": 'Inter, system-ui, -apple-system, "Segoe UI", Roboto, sans-serif',
};

/** Light wallet modal — readable on bright backgrounds. */
export const VEILUM_WALLET_KIT_THEME_LIGHT: SwkAppTheme = {
  background: "oklch(100% 0.006 90)",
  "background-secondary": "oklch(97% 0.008 90)",
  "foreground-strong": "oklch(18% 0.02 75)",
  foreground: "oklch(22% 0.02 75)",
  "foreground-secondary": "oklch(42% 0.02 75)",
  primary: "oklch(48% 0.14 175)",
  "primary-foreground": "oklch(99% 0.006 90)",
  transparent: "rgba(0, 0, 0, 0)",
  lighter: "oklch(97% 0.008 90)",
  light: "oklch(94% 0.01 200)",
  "light-gray": "oklch(55% 0.02 75)",
  gray: "oklch(42% 0.02 75)",
  danger: "oklch(50% 0.16 25)",
  border: "oklch(88% 0.012 75)",
  shadow: "0 20px 40px -12px oklch(20% 0.02 75 / 0.15), 0 0 0 1px oklch(48% 0.14 175 / 0.1)",
  "border-radius": "1rem",
  "font-family": 'Inter, system-ui, -apple-system, "Segoe UI", Roboto, sans-serif',
};

/** @deprecated Use theme-specific export or walletKitThemeFor(). */
export const VEILUM_WALLET_KIT_THEME = VEILUM_WALLET_KIT_THEME_DARK;

export function walletKitThemeFor(theme: ColorTheme): SwkAppTheme {
  return theme === "light" ? VEILUM_WALLET_KIT_THEME_LIGHT : VEILUM_WALLET_KIT_THEME_DARK;
}
