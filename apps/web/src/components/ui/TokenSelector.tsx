import type { ListedStable, StableSymbol } from "../../lib/tokens";

type TokenSelectorProps = {
  tokens: ListedStable[];
  value: StableSymbol;
  onChange: (symbol: StableSymbol) => void;
  emptyMessage?: string;
};

export function TokenSelector({ tokens, value, onChange, emptyMessage }: TokenSelectorProps) {
  if (tokens.length === 0) {
    return <p className="empty-inline">{emptyMessage ?? "No tokens available."}</p>;
  }

  return (
    <select className="input" value={value} onChange={(e) => onChange(e.target.value as StableSymbol)}>
      {tokens.map((t) => (
        <option key={t.symbol} value={t.symbol}>
          {t.symbol} — {t.name}
        </option>
      ))}
    </select>
  );
}
