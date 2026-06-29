import { stableCurrencyForSymbol, STABLE_CATALOG, type StableSymbol } from "./tokens";
import { formatTokenAmount } from "./utils";

export type DisplayCurrency = "USD" | "EUR";

const DEFAULT_DECIMALS = 7;

export function tokenAmountToNumber(raw: bigint, decimals = DEFAULT_DECIMALS): number {
  const n = Number(formatTokenAmount(raw, decimals));
  return Number.isFinite(n) ? n : 0;
}

export function isEurStable(symbol: string): boolean {
  return stableCurrencyForSymbol(symbol) === "EUR";
}

/** Convert a stable balance to USD (EUR stables use live EUR/USD). */
export function amountToUsd(raw: bigint, symbol: string, eurUsd: number): number {
  const amount = tokenAmountToNumber(raw, decimalsFor(symbol));
  if (isEurStable(symbol)) return amount * eurUsd;
  return amount;
}

export function portfolioTotalUsd(
  assets: { symbol: string; amount: bigint }[],
  eurUsd: number
): number {
  return assets.reduce((sum, asset) => sum + amountToUsd(asset.amount, asset.symbol, eurUsd), 0);
}

export function portfolioTotalInDisplay(
  assets: { symbol: string; amount: bigint }[],
  display: DisplayCurrency,
  eurUsd: number
): number {
  const usd = portfolioTotalUsd(assets, eurUsd);
  return display === "USD" ? usd : usd / eurUsd;
}

export function formatDisplayCurrency(value: number, display: DisplayCurrency): string {
  return value.toLocaleString("en-US", {
    style: "currency",
    currency: display,
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

export function maskDisplayTotal(display: DisplayCurrency): string {
  return display === "USD" ? "$••••••" : "€••••••";
}

export function maskUsdApprox(): string {
  return "≈ $••••";
}

export function formatEurcUsdApprox(amount: bigint, eurUsd: number, reveal: boolean): string {
  if (!reveal) return maskUsdApprox();
  const usd = amountToUsd(amount, "EURC", eurUsd);
  return `≈ ${formatDisplayCurrency(usd, "USD")}`;
}

function decimalsFor(symbol: string): number {
  if (symbol in STABLE_CATALOG) {
    return STABLE_CATALOG[symbol as StableSymbol].decimals;
  }
  return DEFAULT_DECIMALS;
}

export function portfolioNeedsFxRate(assets: { symbol: string }[]): boolean {
  return assets.some((a) => isEurStable(a.symbol));
}
