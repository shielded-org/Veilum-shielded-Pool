import type { ListedStable, StableSymbol } from "../../lib/tokens";
import { formatStableUsd } from "../../lib/utils";

type TokenSelectorProps = {
  tokens: ListedStable[];
  value: StableSymbol;
  onChange: (symbol: StableSymbol) => void;
  emptyMessage?: string;
  balances?: Partial<Record<StableSymbol, bigint>>;
  balancesLoading?: boolean;
};

function TokenMark({ symbol }: { symbol: string }) {
  return (
    <span className="token-mark" aria-hidden>
      {symbol.slice(0, 1)}
    </span>
  );
}

export function TokenSelector({
  tokens,
  value,
  onChange,
  emptyMessage,
  balances,
  balancesLoading,
}: TokenSelectorProps) {
  if (tokens.length === 0) {
    return <p className="empty-inline">{emptyMessage ?? "No tokens available."}</p>;
  }

  return (
    <div className="token-picker" role="listbox" aria-label="Select token">
      {tokens.map((t) => {
        const selected = t.symbol === value;
        const bal = balances?.[t.symbol];
        return (
          <button
            key={t.symbol}
            type="button"
            role="option"
            aria-selected={selected}
            className={`token-picker__option${selected ? " token-picker__option--active" : ""}`}
            onClick={() => onChange(t.symbol)}
          >
            <TokenMark symbol={t.symbol} />
            <span className="token-picker__main">
              <span className="token-picker__symbol">{t.symbol}</span>
              <span className="token-picker__name">{t.name}</span>
            </span>
            <span className="token-picker__balance mono">
              {balancesLoading ? "…" : bal !== undefined ? formatStableUsd(bal) : "—"}
            </span>
          </button>
        );
      })}
    </div>
  );
}
