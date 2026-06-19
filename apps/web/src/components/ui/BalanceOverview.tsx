import { Link } from "react-router-dom";

import { BalanceItemSkeleton } from "./BalanceItemSkeleton";
import { IconEye, IconEyeOff } from "./icons";
import { PortfolioChart } from "./PortfolioChart";
import { PortfolioChartSkeleton } from "./PortfolioChartSkeleton";
import { STABLE_CATALOG, type StableSymbol } from "../../lib/tokens";
import { formatStableAmount, maskStableAmount } from "../../lib/utils";

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

const LOADING_PLACEHOLDERS = 3;

function tokenName(symbol: string): string {
  if (symbol in STABLE_CATALOG) {
    return STABLE_CATALOG[symbol as StableSymbol].name;
  }
  return symbol;
}

function maskAmount(value: string, symbol: string, reveal: boolean) {
  return reveal ? value : maskStableAmount(symbol);
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
  const showPortfolio = ready && (loading || assets.length > 0);

  return (
    <div className="balance-panel">
      {showPortfolio ? (
        <section className="portfolio-section card" aria-label="Portfolio allocation">
          <header className="portfolio-section__header">
            <h2>Allocation</h2>
            <p className="portfolio-section__meta">
              {loading ? "Calculating split…" : "Share of your shielded balance by asset"}
            </p>
          </header>
          {loading ? (
            <PortfolioChartSkeleton />
          ) : (
            <PortfolioChart assets={assets} reveal={reveal} />
          )}
        </section>
      ) : null}

      <section className="balance-overview card" aria-label="Shielded balances">
        <header className="balance-overview__header">
          <div>
            <h2>Shielded balance</h2>
            <p className="balance-overview__meta">
              {loading
                ? "Loading balances…"
                : ready
                  ? `${unspentCount} available · ${totalNotes} notes total`
                  : "Connect wallet to view balances"}
            </p>
          </div>
          {ready && !loading && (
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
            {Array.from({ length: LOADING_PLACEHOLDERS }, (_, i) => (
              <BalanceItemSkeleton key={i} />
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
                  {maskAmount(formatStableAmount(amount, symbol), symbol, reveal)}
                </p>
              </article>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
