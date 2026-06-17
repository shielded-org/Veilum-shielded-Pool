import { Link } from "react-router-dom";

import { IconEye, IconEyeOff } from "./icons";
import { STABLE_CATALOG, type StableSymbol } from "../../lib/tokens";
import { formatTokenAmount } from "../../lib/utils";

export type BalanceAsset = {
  symbol: string;
  amount: bigint;
  count: number;
};

type BalanceOverviewProps = {
  assets: BalanceAsset[];
  reveal: boolean;
  onToggleReveal: () => void;
  loading?: boolean;
  ready?: boolean;
  unspentCount: number;
  totalNotes: number;
};

function tokenName(symbol: string): string {
  if (symbol in STABLE_CATALOG) {
    return STABLE_CATALOG[symbol as StableSymbol].name;
  }
  return symbol;
}

function maskAmount(value: string, reveal: boolean) {
  return reveal ? value : "••••••";
}

export function BalanceOverview({
  assets,
  reveal,
  onToggleReveal,
  loading,
  ready,
  unspentCount,
  totalNotes,
}: BalanceOverviewProps) {
  const showEmpty = ready && !loading && assets.length === 0;

  return (
    <section className="balance-overview card" aria-label="Shielded balances">
      <header className="balance-overview__header">
        <div>
          <h2>Shielded balances</h2>
          <p className="balance-overview__meta">
            {loading
              ? "Scanning notes…"
              : ready
                ? `${unspentCount} unspent · ${totalNotes} total notes`
                : "Connect wallet to view balances"}
          </p>
        </div>
        {ready && (
          <button
            type="button"
            className="balance-overview__toggle"
            onClick={onToggleReveal}
            aria-label={reveal ? "Hide balances" : "Show balances"}
            aria-pressed={reveal}
          >
            {reveal ? <IconEye size={18} /> : <IconEyeOff size={18} />}
            {reveal ? "Hide" : "Show"}
          </button>
        )}
      </header>

      {!ready ? (
        <p className="balance-overview__empty">Connect your wallet and derive shield keys to scan notes.</p>
      ) : loading ? (
        <div className="balance-overview__grid balance-overview__grid--loading">
          {[0, 1, 2].map((i) => (
            <div key={i} className="balance-item balance-item--skeleton" aria-hidden />
          ))}
        </div>
      ) : showEmpty ? (
        <div className="balance-overview__empty">
          <p>No shielded balance yet.</p>
          <Link to="/dashboard/shield" className="btn btn-primary btn-sm">
            Shield tokens
          </Link>
        </div>
      ) : (
        <div className="balance-overview__grid">
          {assets.map(({ symbol, amount, count }) => (
            <article key={symbol} className="balance-item">
              <div className="balance-item__top">
                <span className="balance-item__symbol">{symbol}</span>
                <span className="balance-item__notes">
                  {count} {count === 1 ? "note" : "notes"}
                </span>
              </div>
              <p className="balance-item__name">{tokenName(symbol)}</p>
              <p className={`balance-item__amount${!reveal ? " balance-item__amount--masked" : ""}`}>
                {maskAmount(formatTokenAmount(amount), reveal)}
              </p>
            </article>
          ))}
        </div>
      )}
    </section>
  );
}
