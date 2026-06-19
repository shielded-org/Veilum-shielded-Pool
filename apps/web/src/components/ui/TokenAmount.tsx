import type { Hex32 } from "../../lib/types";
import { useTokenRegistry } from "../../hooks/use-token-registry";
import { formatStableAmount, maskStableAmount, formatTokenAmount } from "../../lib/utils";

type TokenAmountProps = {
  amount: bigint;
  tokenField: Hex32;
  masked?: boolean;
  showSymbol?: boolean;
  /** Prefix with $ for stablecoin dashboard display. */
  asUsd?: boolean;
  className?: string;
};

export function TokenAmount({
  amount,
  tokenField,
  masked,
  showSymbol = true,
  asUsd = false,
  className,
}: TokenAmountProps) {
  const registry = useTokenRegistry();
  const symbol = registry?.symbolForField(tokenField) ?? "—";
  const value = masked
    ? asUsd
      ? maskStableAmount(symbol)
      : "••••••"
    : asUsd
      ? formatStableAmount(amount, symbol)
      : formatTokenAmount(amount);

  return (
    <span className={className}>
      {value}
      {showSymbol ? ` ${symbol}` : ""}
    </span>
  );
}
