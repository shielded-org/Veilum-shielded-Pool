import { Link } from "react-router-dom";
import { useState, type CSSProperties } from "react";

import { BalanceOverview } from "../components/ui/BalanceOverview";
import { EmptyState } from "../components/ui/EmptyState";
import { TokenAmount } from "../components/ui/TokenAmount";
import { TxRow } from "../components/ui/TxRow";
import { IconDroplet, IconDownloadCloud, IconList, IconLock } from "../components/ui/icons";
import { useTokenRegistry } from "../hooks/use-token-registry";
import { DashboardConnectScreen } from "../components/ui/DashboardConnectScreen";
import { useWalletConnection } from "../hooks/use-wallet-connection";
import { humanizeSyncError, noteStatusLabel } from "../lib/user-messages";
import { summarizeUnspentBySymbol } from "../lib/token-labels";
import { formatStableAmount, shortenAddress } from "../lib/utils";
import { stableDenominationSymbol } from "../lib/tokens";
import { useShieldedStore } from "../store/use-shielded-store";

const QUICK_ACTIONS = [
  { to: "/dashboard/shield", icon: IconDroplet, label: "Shield", hint: "Deposit into pool" },
  { to: "/dashboard/transfer", icon: IconLock, label: "Transfer", hint: "Send privately" },
  { to: "/dashboard/unshield", icon: IconDownloadCloud, label: "Withdraw", hint: "Unshield to G…" },
  { to: "/dashboard/notes", icon: IconList, label: "Notes", hint: "View balances" },
] as const;

const PANEL_SCROLL_ROWS = 14;

function sortNewestFirst<T extends { createdAt?: string }>(items: T[]): T[] {
  return [...items].sort((a, b) => {
    const ta = a.createdAt ? Date.parse(a.createdAt) : 0;
    const tb = b.createdAt ? Date.parse(b.createdAt) : 0;
    return tb - ta;
  });
}

export function DashboardHome() {
  const { wallet, busy, error, connectWallet, openKeySign, hasShieldKeys } = useWalletConnection();
  const reveal = useShieldedStore((s) => s.revealBalances);
  const setReveal = useShieldedStore((s) => s.setRevealBalances);
  const relayerOk = useShieldedStore((s) => s.relayerOk);
  const scanLoading = useShieldedStore((s) => s.scanLoading);
  const scanRefreshing = useShieldedStore((s) => s.scanRefreshing);
  const syncError = useShieldedStore((s) => s.syncError);
  const syncWarnings = useShieldedStore((s) => s.syncWarnings);
  const keyMaterialAddress = useShieldedStore((s) => s.keyMaterialAddress);
  const notes = useShieldedStore((s) => s.notes);
  const transactions = useShieldedStore((s) => s.transactions);
  const registry = useTokenRegistry();
  const [showNoteDetails, setShowNoteDetails] = useState(true);

  const unspent = notes.filter((n) => !n.spent);
  const hasKeys = hasShieldKeys;
  const ready = !!(wallet && hasKeys);

  const balanceAssets = registry ? summarizeUnspentBySymbol(notes, registry) : [];
  const initialScan = scanLoading && notes.length === 0;
  const balancesLoading = !ready || registry === null || initialScan;

  const uniqueTransactions = transactions.filter((tx, i, arr) => {
    return arr.findIndex((t) => t.id === tx.id) === i;
  });

  const sortedNotes = sortNewestFirst(notes);
  const sortedTransactions = sortNewestFirst(uniqueTransactions);

  const noteSummary = balanceAssets
    .map((a) => `${a.symbol} ${formatSummaryAmount(a.amount, a.symbol, reveal)}`)
    .join(" · ");

  function formatSummaryAmount(amount: bigint, symbol: string, show: boolean) {
    if (!show) return `${stableDenominationSymbol(symbol)}••••`;
    return formatStableAmount(amount, symbol);
  }

  if (!wallet) {
    return (
      <DashboardConnectScreen
        busy={busy}
        error={error}
        onConnect={() => void connectWallet()}
      />
    );
  }

  if (!hasKeys) {
    return (
      <DashboardConnectScreen
        mode="sign"
        busy={busy}
        error={error}
        onConnect={openKeySign}
      />
    );
  }

  return (
    <>
      {!relayerOk && (
        <p className="alert-banner alert-banner--error">
          Private sends and withdrawals are unavailable right now. Try again in a few minutes.
        </p>
      )}

      {wallet && !hasKeys && (
        <p className="alert-banner alert-banner--warn">
          Sign the one-time key derivation message to enable your shielded wallet.
        </p>
      )}

      {wallet && keyMaterialAddress && wallet !== keyMaterialAddress && (
        <p className="alert-banner alert-banner--warn">
          Connected wallet differs from shield keys — click <strong>Sync keys</strong> in the header.
        </p>
      )}

      {syncError && (
        <p className="alert-banner alert-banner--error">{humanizeSyncError(syncError)}</p>
      )}

      {!syncError && syncWarnings.length > 0 && (
        <p className="alert-banner alert-banner--warn">
          {syncWarnings.map(humanizeSyncError).join(" · ")}
        </p>
      )}

      <div className="dashboard-quick-actions">
        {QUICK_ACTIONS.map(({ to, icon: Icon, label, hint }) => (
          <Link key={to} to={to} className="dashboard-quick-action">
            <span className="dashboard-quick-action__icon" aria-hidden>
              <Icon size={18} />
            </span>
            <strong>{label}</strong>
            <span>{hint}</span>
          </Link>
        ))}
      </div>

      <BalanceOverview
        assets={balanceAssets}
        reveal={reveal}
        onToggleReveal={() => setReveal(!reveal)}
        loading={balancesLoading}
        refreshing={scanRefreshing && !initialScan}
        ready={ready}
        unspentCount={unspent.length}
        totalNotes={notes.length}
      />

      <div className="dashboard-metrics">
        <div className="dashboard-metric">
          <span className="dashboard-metric__label">Available notes</span>
          <span className="dashboard-metric__value">{ready && !initialScan ? unspent.length : "—"}</span>
        </div>
        <div className="dashboard-metric">
          <span className="dashboard-metric__label">Total notes</span>
          <span className="dashboard-metric__value">{ready && !initialScan ? notes.length : "—"}</span>
        </div>
        <div className="dashboard-metric">
          <span className="dashboard-metric__label">Wallet</span>
          <span className="dashboard-metric__value mono">
            {wallet ? shortenAddress(wallet, 4) : "—"}
          </span>
        </div>
      </div>

      <div className="panel-grid">
        <div className="card">
          <h2>Notes</h2>
          <p className="card-desc">
            Balances discovered from encrypted route events on-chain.
            {initialScan ? " Initial scan…" : scanRefreshing ? " Updating in background…" : ""}
          </p>
          {!wallet || !hasKeys ? (
            <EmptyState
              title="No notes yet"
              body="Connect wallet and derive keys to scan notes"
            />
          ) : initialScan ? (
            <EmptyState title="Scanning pool events…" body="This may take a moment on first load." />
          ) : notes.length === 0 ? (
            <EmptyState
              title="No notes found"
              body="Shield tokens or receive a private transfer"
              action={
                <Link to="/dashboard/shield" className="btn btn-primary btn-sm">
                  Shield tokens
                </Link>
              }
            />
          ) : (
            <>
              {!showNoteDetails && noteSummary ? (
                <p className="notes-summary-line mono">{noteSummary}</p>
              ) : null}
              <button
                type="button"
                className="notes-advanced-toggle"
                onClick={() => setShowNoteDetails((v) => !v)}
              >
                {showNoteDetails ? "Hide details" : "Show note details"}
              </button>
              {showNoteDetails ? (
                <div
                  className={`table-wrap${sortedNotes.length > PANEL_SCROLL_ROWS ? " table-wrap--scroll" : ""}`}
                  style={
                    sortedNotes.length > PANEL_SCROLL_ROWS
                      ? ({ ["--scroll-rows" as string]: PANEL_SCROLL_ROWS } as CSSProperties)
                      : undefined
                  }
                >
                  <table className="table">
                    <thead>
                      <tr>
                        <th>Token</th>
                        <th>Amount</th>
                        <th>Status</th>
                      </tr>
                    </thead>
                    <tbody>
                      {sortedNotes.map((n) => (
                        <tr key={n.id}>
                          <td>{registry?.symbolForField(n.token) ?? "—"}</td>
                          <td>
                            <TokenAmount
                              amount={n.amount}
                              tokenField={n.token}
                              masked={!reveal}
                              showSymbol={false}
                              asUsd
                            />
                          </td>
                          <td>
                            <span className={`badge ${n.spent ? "err" : "ok"}`}>
                              {noteStatusLabel(n.spent)}
                            </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : null}
              {sortedNotes.length > PANEL_SCROLL_ROWS && showNoteDetails ? (
                <p className="card-footnote">
                  {sortedNotes.length} notes — scroll to see all, or open{" "}
                  <Link to="/dashboard/notes">Notes</Link> for the full page.
                </p>
              ) : null}
            </>
          )}
        </div>

        <div className="card">
          <h2>Recent activity</h2>
          {sortedTransactions.length === 0 ? (
            <EmptyState title="No transactions yet" body="Shield, transfer, or withdraw to see activity here." />
          ) : (
            <div
              className={`table-wrap${sortedTransactions.length > PANEL_SCROLL_ROWS ? " table-wrap--scroll" : ""}`}
              style={
                sortedTransactions.length > PANEL_SCROLL_ROWS
                  ? ({ ["--scroll-rows" as string]: PANEL_SCROLL_ROWS } as CSSProperties)
                  : undefined
              }
            >
              <table className="table table--activity">
                <thead>
                  <tr>
                    <th aria-label="Type" />
                    <th>Description</th>
                    <th>Amount</th>
                    <th>Status</th>
                    <th>Tx</th>
                  </tr>
                </thead>
                <tbody>
                  {sortedTransactions.map((tx) => (
                    <TxRow key={tx.id} tx={tx} />
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </>
  );
}
