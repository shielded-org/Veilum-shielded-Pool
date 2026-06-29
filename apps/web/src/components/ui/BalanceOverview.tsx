import { Link } from "react-router-dom";
import { useCallback, useState } from "react";

import { BalanceItemSkeleton } from "./BalanceItemSkeleton";
import { DisplayCurrencyToggle } from "./DisplayCurrencyToggle";
import { IconEye, IconEyeOff, IconRefresh, IconSpinner } from "./icons";
import { PortfolioChart } from "./PortfolioChart";
import { PortfolioChartSkeleton } from "./PortfolioChartSkeleton";
import { useDisplayCurrency } from "../../hooks/use-display-currency";
import { useFxRates } from "../../hooks/use-fx-rates";
import {
  formatDisplayCurrency,
  formatEurcUsdApprox,
  isEurStable,
  maskDisplayTotal,
  portfolioNeedsFxRate,
  portfolioTotalInDisplay,
} from "../../lib/portfolio-value";
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
  /** Background sync in progress — show hint without replacing balances. */
  refreshing?: boolean;
  onRefresh?: () => void | Promise<void>;
  ready?: boolean;
  unspentCount: number;
  totalNotes: number;
};

const LOADING_PLACEHOLDERS = 3;
const DEFAULT_EUR_USD = 1.08;

function tokenName(symbol: string): string {
  if (symbol in STABLE_CATALOG) {
    return STABLE_CATALOG[symbol as StableSymbol].name;
  }
  return symbol;
}

function maskAmount(value: string, symbol: string, reveal: boolean) {
  return reveal ? value : maskStableAmount(symbol);
}

function formatRateAge(fetchedAt: number | null): string | null {
  if (!fetchedAt) return null;
  const mins = Math.max(0, Math.round((Date.now() - fetchedAt) / 60_000));
  if (mins < 1) return "just now";
  if (mins === 1) return "1 min ago";
  return `${mins} min ago`;
}

export function BalanceOverview({
  assets,
  reveal,
  onToggleReveal,
  loading,
  refreshing,
  onRefresh,
  ready,
  unspentCount,
  totalNotes,
}: BalanceOverviewProps) {
  const [manualBusy, setManualBusy] = useState(false);

  const handleRefresh = useCallback(() => {
    if (!onRefresh || manualBusy) return;
    setManualBusy(true);
    Promise.resolve(onRefresh())
      .catch(() => {})
      .finally(() => setManualBusy(false));
  }, [onRefresh, manualBusy]);
  const { displayCurrency } = useDisplayCurrency();
  const needsFx = portfolioNeedsFxRate(assets);
  const fx = useFxRates(ready && needsFx);
  const effectiveEurUsd = fx.eurUsd ?? DEFAULT_EUR_USD;
  const portfolioLoading = Boolean(loading || (needsFx && fx.loading && fx.eurUsd === null));

  const showEmpty = ready && !loading && assets.length === 0;
  const showPortfolio = ready && (loading || assets.length > 0);

  const totalLabel =
    !portfolioLoading
      ? reveal
        ? formatDisplayCurrency(
            portfolioTotalInDisplay(assets, displayCurrency, effectiveEurUsd),
            displayCurrency
          )
        : maskDisplayTotal(displayCurrency)
      : null;

  const rateFootnote =
    needsFx && fx.eurUsd !== null && fx.source
      ? `EUR/USD ${fx.eurUsd.toFixed(4)} via ${fx.source}${formatRateAge(fx.fetchedAt) ? ` · ${formatRateAge(fx.fetchedAt)}` : ""}`
      : needsFx && fx.error
        ? `EUR/USD estimate uses fallback rate — live quote unavailable`
        : null;

  return (
    <div className="balance-panel">
      {showPortfolio ? (
        <section className="portfolio-section card" aria-label="Private portfolio">
          <header className="portfolio-section__header">
            <div className="portfolio-section__title-row">
              <div>
                <h2>Private portfolio</h2>
                <p className="portfolio-section__meta">
                  {portfolioLoading
                    ? "Updating your balance…"
                    : "total private balance"}
                </p>
              </div>
              {!portfolioLoading && assets.length > 0 ? <DisplayCurrencyToggle /> : null}
            </div>
          </header>
          <div className="portfolio-section__body">
            <div className="portfolio-section__total-block" aria-live="polite">
              {portfolioLoading ? (
                <span className="balance-skeleton portfolio-section__total-skeleton-amount" />
              ) : totalLabel ? (
                <>
                  <p
                    className={`portfolio-section__total mono${!reveal ? " portfolio-section__total--masked" : ""}`}
                  >
                    {totalLabel}
                  </p>
                  {reveal && rateFootnote ? (
                    <p className="portfolio-section__rate-note">{rateFootnote}</p>
                  ) : null}
                  {fx.error && needsFx && !fx.eurUsd ? (
                    <p className="portfolio-section__rate-note portfolio-section__rate-note--warn">
                      {fx.error} — showing approximate total
                    </p>
                  ) : null}
                </>
              ) : null}
            </div>
            {portfolioLoading ? (
              <PortfolioChartSkeleton />
            ) : (
              <PortfolioChart assets={assets} reveal={reveal} eurUsd={effectiveEurUsd} />
            )}
          </div>
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
                  ? `${unspentCount} available · ${totalNotes} notes total${refreshing ? " · updating…" : ""}`
                  : "Connect wallet to view balances"}
            </p>
          </div>
          {ready && !loading && (
            <div className="balance-overview__actions">
              {onRefresh ? (
                <button
                  type="button"
                  className="balance-overview__toggle"
                  onClick={handleRefresh}
                  disabled={manualBusy}
                  aria-label="Refresh shielded balance"
                  aria-busy={manualBusy}
                >
                  {manualBusy ? <IconSpinner size={18} /> : <IconRefresh size={18} />}
                  {manualBusy ? "Refreshing…" : "Refresh"}
                </button>
              ) : null}
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
            </div>
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
                {isEurStable(symbol) ? (
                  <p className="balance-item__fiat">
                    {formatEurcUsdApprox(amount, effectiveEurUsd, reveal)}
                  </p>
                ) : null}
              </article>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
