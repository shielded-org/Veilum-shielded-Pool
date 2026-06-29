import { groupUnspentNotesByToken, tokenKey } from "../lib/note-groups";
import {
  formatDisplayCurrency,
  formatEurcUsdApprox,
  isEurStable,
  maskDisplayTotal,
  portfolioNeedsFxRate,
  portfolioTotalUsd,
} from "../lib/portfolio-value";
import { STABLE_CATALOG, type StableSymbol } from "../lib/tokens";
import { formatStableAmount, formatTokenAmount } from "../lib/utils";
import { useFxRates } from "../hooks/use-fx-rates";
import type { WalletBalanceMode } from "../components/WalletModeToggle";
import { Button } from "../components/ui/Button";
import { IconEye, IconEyeOff } from "../components/ui/icons";

const DEFAULT_EUR_USD = 1.08;

type NoteGroup = ReturnType<typeof groupUnspentNotesByToken>[number] & { symbol: string };

type PublicStable = {
  symbol: string;
  contractId: string;
  decimals: number;
  balance: bigint;
};

function decimalsForSymbol(symbol: string): number {
  if (symbol in STABLE_CATALOG) {
    return STABLE_CATALOG[symbol as StableSymbol].decimals;
  }
  return 7;
}

function formatRateAge(fetchedAt: number | null): string | null {
  if (!fetchedAt) return null;
  const mins = Math.max(0, Math.round((Date.now() - fetchedAt) / 60_000));
  if (mins < 1) return "just now";
  if (mins === 1) return "1 min ago";
  return `${mins} min ago`;
}

function maskStable(symbol: string, reveal: boolean, formatted: string): string {
  if (reveal) return formatted;
  return symbol === "EURC" ? "€••••" : "$••••";
}

export function HomeScreen({
  accountOnChain,
  mode,
  reveal,
  onToggleReveal,
  publicXlm,
  publicStables,
  noteGroups,
  syncing,
  onRefresh,
  onOpenFaucet,
  onOpenShield,
  onFundAccount,
  fundingAccount,
}: {
  accountOnChain: boolean | null;
  mode: WalletBalanceMode;
  reveal: boolean;
  onToggleReveal: () => void;
  publicXlm: bigint;
  publicStables: PublicStable[];
  noteGroups: NoteGroup[];
  syncing: boolean;
  onRefresh: () => void;
  onOpenFaucet: () => void;
  onOpenShield: () => void;
  onFundAccount: () => void;
  fundingAccount: boolean;
}) {
  const privateAssets = noteGroups.map((g) => ({ symbol: g.symbol, amount: g.totalAmount }));
  const publicAssets = publicStables.map((t) => ({ symbol: t.symbol, amount: t.balance }));
  const assets = mode === "private" ? privateAssets : publicAssets;

  const needsFx = portfolioNeedsFxRate(assets);
  const fx = useFxRates(needsFx);
  const effectiveEurUsd = fx.eurUsd ?? DEFAULT_EUR_USD;
  const totalLoading = needsFx && fx.loading && fx.eurUsd === null;

  const totalUsd = portfolioTotalUsd(assets, effectiveEurUsd);
  const totalLabel = totalLoading
    ? null
    : reveal
      ? formatDisplayCurrency(totalUsd, "USD")
      : maskDisplayTotal("USD");

  const rateFootnote =
    needsFx && fx.eurUsd !== null && fx.source
      ? `EUR/USD ${fx.eurUsd.toFixed(4)} via ${fx.source}${formatRateAge(fx.fetchedAt) ? ` · ${formatRateAge(fx.fetchedAt)}` : ""}`
      : needsFx && fx.error
        ? "EUR/USD estimate uses fallback rate"
        : null;

  const isPrivate = mode === "private";
  const hasBalances = isPrivate ? noteGroups.length > 0 : publicStables.length > 0 || publicXlm > 0n;
  const needsFunding = accountOnChain === false;

  return (
    <>
      {needsFunding ? (
        <div className="alert-banner alert-banner--info alert-banner--compact">
          <p className="alert-banner__text">
            This account is not on testnet yet. Fund it with Friendbot to activate and use shielding.
          </p>
          <Button
            variant="primary"
            size="sm"
            fullWidth
            loading={fundingAccount}
            onClick={onFundAccount}
          >
            Fund with Friendbot
          </Button>
        </div>
      ) : null}

      <div
        className={`balance-hero balance-hero--${mode}`}
        aria-label={isPrivate ? "Private portfolio total" : "Public portfolio total"}
      >
        <div className="balance-hero__top">
          <div className="balance-hero__label">
            {isPrivate ? "Private balance" : "Public balance"}
          </div>
          {hasBalances ? (
            <button
              type="button"
              className="balance-hero__reveal"
              onClick={onToggleReveal}
              aria-label={reveal ? "Hide balances" : "Show balances"}
              aria-pressed={reveal}
            >
              {reveal ? <IconEye size={16} /> : <IconEyeOff size={16} />}
            </button>
          ) : null}
        </div>
        <div className={`balance-hero__value${!reveal && hasBalances ? " balance-hero__value--masked" : ""}`}>
          {totalLoading ? (
            <span className="balance-hero__skeleton" aria-busy="true" />
          ) : hasBalances ? (
            totalLabel
          ) : (
            formatDisplayCurrency(0, "USD")
          )}
        </div>
        {reveal && rateFootnote ? (
          <p className="balance-hero__footnote">{rateFootnote}</p>
        ) : null}
        <p className="balance-hero__meta">
          {isPrivate
            ? "Shielded stablecoins — amounts hidden on-chain"
            : "On-chain balances — visible to anyone"}
        </p>
      </div>

      <div className="balance-section-header">
        <h2 className="screen-title">{isPrivate ? "Shielded assets" : "Public assets"}</h2>
        <Button variant="ghost" size="sm" loading={syncing} onClick={onRefresh}>
          Refresh
        </Button>
      </div>

      {isPrivate ? (
        <PrivateAssetList
          noteGroups={noteGroups}
          reveal={reveal}
          effectiveEurUsd={effectiveEurUsd}
          onOpenShield={onOpenShield}
        />
      ) : (
        <PublicAssetList
          publicXlm={publicXlm}
          publicStables={publicStables}
          reveal={reveal}
          effectiveEurUsd={effectiveEurUsd}
          onOpenFaucet={onOpenFaucet}
        />
      )}

    </>
  );
}

function PrivateAssetList({
  noteGroups,
  reveal,
  effectiveEurUsd,
  onOpenShield,
}: {
  noteGroups: NoteGroup[];
  reveal: boolean;
  effectiveEurUsd: number;
  onOpenShield: () => void;
}) {
  if (noteGroups.length === 0) {
    return (
      <section className="balance-empty">
        <p className="text-muted">No shielded balance yet.</p>
        <p className="text-subtle">Shield public stablecoins to start holding privately.</p>
        <Button variant="primary" size="sm" className="mt-2" onClick={onOpenShield}>
          Shield funds →
        </Button>
      </section>
    );
  }

  return (
    <section aria-label="Shielded asset balances">
      {noteGroups.map((g) => {
        const decimals = decimalsForSymbol(g.symbol);
        const formatted = formatStableAmount(g.totalAmount, g.symbol, decimals);
        return (
          <div key={tokenKey(g.token)} className="token-row">
            <div>
              <div className="token-row__symbol">{g.symbol}</div>
              <div className="token-row__sub">
                {g.noteCount} note{g.noteCount === 1 ? "" : "s"}
              </div>
            </div>
            <div className="token-row__amounts">
              <div className="token-row__amount">
                {maskStable(g.symbol, reveal, formatted)}
              </div>
              {isEurStable(g.symbol) ? (
                <div className="token-row__fiat">
                  {formatEurcUsdApprox(g.totalAmount, effectiveEurUsd, reveal)}
                </div>
              ) : null}
            </div>
          </div>
        );
      })}
    </section>
  );
}

function PublicAssetList({
  publicXlm,
  publicStables,
  reveal,
  effectiveEurUsd,
  onOpenFaucet,
}: {
  publicXlm: bigint;
  publicStables: PublicStable[];
  reveal: boolean;
  effectiveEurUsd: number;
  onOpenFaucet: () => void;
}) {
  const hasStables = publicStables.some((t) => t.balance > 0n);

  return (
    <section aria-label="Public asset balances">
      <div className="token-row">
        <div>
          <div className="token-row__symbol">XLM</div>
          <div className="token-row__sub">Network fees</div>
        </div>
        <div className="token-row__amounts">
          <div className="token-row__amount">
            {reveal ? formatTokenAmount(publicXlm, 7) : "••••••"}
          </div>
        </div>
      </div>

      {publicStables.length === 0 ? (
        <p className="text-muted mt-2">No stablecoins yet — use the faucet to mint test tokens.</p>
      ) : (
        publicStables.map((t) => {
          const formatted = formatStableAmount(t.balance, t.symbol, t.decimals);
          return (
            <div key={t.contractId} className="token-row">
              <div>
                <div className="token-row__symbol">{t.symbol}</div>
                <div className="token-row__sub">On-chain</div>
              </div>
              <div className="token-row__amounts">
                <div className="token-row__amount">
                  {maskStable(t.symbol, reveal, formatted)}
                </div>
                {isEurStable(t.symbol) ? (
                  <div className="token-row__fiat">
                    {formatEurcUsdApprox(t.balance, effectiveEurUsd, reveal)}
                  </div>
                ) : null}
              </div>
            </div>
          );
        })
      )}

      {!hasStables ? (
        <Button variant="ghost" size="sm" className="mt-2" onClick={onOpenFaucet}>
          Get test tokens from faucet →
        </Button>
      ) : null}
    </section>
  );
}
