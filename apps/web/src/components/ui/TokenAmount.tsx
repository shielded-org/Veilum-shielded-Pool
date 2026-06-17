import type { Hex32 } from "../../lib/types";
import { useTokenRegistry } from "../../hooks/use-token-registry";
import { formatTokenAmount } from "../../lib/utils";

type TokenAmountProps = {
  amount: bigint;
  tokenField: Hex32;
  masked?: boolean;
  showSymbol?: boolean;
  className?: string;
};

export function TokenAmount({
  amount,
  tokenField,
  masked,
  showSymbol = true,
  className,
}: TokenAmountProps) {
  const registry = useTokenRegistry();
  const symbol = registry?.symbolForField(tokenField) ?? "—";
  const value = masked ? "••••••" : formatTokenAmount(amount);

  return (
    <span className={className}>
      {value}
      {showSymbol ? ` ${symbol}` : ""}
    </span>
  );
}
