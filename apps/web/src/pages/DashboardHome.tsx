import { Link } from "react-router-dom";

import { BalanceOverview } from "../components/ui/BalanceOverview";
import { EmptyState } from "../components/ui/EmptyState";
import { TokenAmount } from "../components/ui/TokenAmount";
import { TxRow } from "../components/ui/TxRow";
import { IconDroplet, IconDownloadCloud, IconList, IconLock } from "../components/ui/icons";
import { useTokenRegistry } from "../hooks/use-token-registry";
import { useWallet } from "../hooks/use-wallet";
import { summarizeUnspentBySymbol } from "../lib/token-labels";
import { useShieldedStore } from "../store/use-shielded-store";

const QUICK_ACTIONS = [
  { to: "/dashboard/shield", icon: IconDroplet, label: "Shield", hint: "Deposit into pool" },
  { to: "/dashboard/transfer", icon: IconLock, label: "Transfer", hint: "Send privately" },
  { to: "/dashboard/unshield", icon: IconDownloadCloud, label: "Withdraw", hint: "Unshield to G…" },
  { to: "/dashboard/notes", icon: IconList, label: "Notes", hint: "View commitments" },
] as const;

export function DashboardHome() {
  const { address: wallet } = useWallet();
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
  const network = useShieldedStore((s) => s.network);
  const registry = useTokenRegistry();

  const unspent = notes.filter((n) => !n.spent);
  const hasKeys = useShieldedStore((s) => !!(s.viewingKey && s.spendingKey && s.viewingPub));
  const ready = !!(wallet && hasKeys);

  const balanceAssets = registry ? summarizeUnspentBySymbol(notes, registry) : [];

  const uniqueTransactions = transactions.filter((tx, i, arr) => {
    return arr.findIndex((t) => t.id === tx.id) === i;
  });

  const scanStatusLabel = scanLoading
    ? "Scanning chain for notes…"
    : scanRefreshing
      ? "Refreshing from chain…"
      : wallet && hasKeys
        ? `${unspent.length} unspent / ${notes.length} total notes`
        : wallet
          ? "Connect to derive keys"
          : "Not connected";

  return (
    <>
      <div className={`system-banner ${relayerOk ? "system-banner--online" : "system-banner--offline"}`}>
        <div>
          <strong>{relayerOk ? "Relayer online" : "Relayer offline"}</strong>
          <div className="system-banner__detail">
            Private transfers and unshields are submitted via relayer
          </div>
        </div>
        <span className="system-banner__badge">{scanStatusLabel}</span>
      </div>

      {wallet && !hasKeys && (
        <p className="alert-banner alert-banner--warn">
          Shield keys missing — connect your wallet and sign the one-time key derivation message.
        </p>
      )}

      {wallet && keyMaterialAddress && wallet !== keyMaterialAddress && (
        <p className="alert-banner alert-banner--warn">
          Connected wallet differs from shield keys — click <strong>Sync keys</strong> in the header.
        </p>
      )}

      {syncError && <p className="alert-banner alert-banner--error">{syncError}</p>}

      {!syncError && syncWarnings.length > 0 && (
        <p className="alert-banner alert-banner--warn">{syncWarnings.join(" · ")}</p>
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
        loading={scanLoading}
        ready={ready}
        unspentCount={unspent.length}
        totalNotes={notes.length}
      />

      <div className="panel-grid">
        <div className="card">
          <h2>Shielded notes</h2>
          <p className="card-desc">
            Decrypted from on-chain route events using your viewing private key.
            {scanLoading ? " Initial scan…" : scanRefreshing ? " Background refresh…" : ""}
          </p>
          {!wallet || !hasKeys ? (
            <EmptyState
              title="No notes yet"
              body="Connect wallet and derive keys to scan notes"
            />
          ) : scanLoading && notes.length === 0 ? (
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
              <div className="table-wrap">
                <table className="table">
                  <thead>
                    <tr>
                      <th>Token</th>
                      <th>Amount</th>
                      <th>Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {notes.slice(0, 8).map((n) => (
                      <tr key={n.id}>
                        <td>{registry?.symbolForField(n.token) ?? "—"}</td>
                        <td>
                          <TokenAmount
                            amount={n.amount}
                            tokenField={n.token}
                            masked={!reveal}
                            showSymbol={false}
                          />
                        </td>
                        <td>
                          <span className={`badge ${n.spent ? "err" : "ok"}`}>
                            {n.spent ? "spent" : "unspent"}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {notes.length > 8 && (
                <p className="card-footnote">
                  Showing 8 of {notes.length} — see <Link to="/dashboard/notes">Notes</Link> for the full list.
                </p>
              )}
            </>
          )}
        </div>

        <div className="card">
          <h2>Recent activity</h2>
          {uniqueTransactions.length === 0 ? (
            <EmptyState title="No transactions yet" body="Shield, transfer, or withdraw to see activity here." />
          ) : (
            <div className="table-wrap">
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
                  {uniqueTransactions.map((tx) => (
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
