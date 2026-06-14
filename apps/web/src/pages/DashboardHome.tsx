import { useEffect, useMemo, useState } from "react";

import { ConnectWallet } from "../components/ConnectWallet";
import { useWallet } from "../hooks/use-wallet";
import { loadNetworkConfig } from "../lib/config";
import { useShieldedStore } from "../store/use-shielded-store";
import { formatTokenAmount, shortenAddress } from "../lib/utils";

function maskAmount(v: string, reveal: boolean) {
  return reveal ? v : "••••••";
}

export function DashboardHome() {
  const { address: wallet } = useWallet();
  const shieldedBalance = useShieldedStore((s) => s.shieldedBalance);
  const reveal = useShieldedStore((s) => s.revealBalances);
  const relayerOk = useShieldedStore((s) => s.relayerOk);
  const scanLoading = useShieldedStore((s) => s.scanLoading);
  const scanRefreshing = useShieldedStore((s) => s.scanRefreshing);
  const syncError = useShieldedStore((s) => s.syncError);
  const syncWarnings = useShieldedStore((s) => s.syncWarnings);
  const keyMaterialAddress = useShieldedStore((s) => s.keyMaterialAddress);
  const notes = useShieldedStore((s) => s.notes);
  const transactions = useShieldedStore((s) => s.transactions);
  const network = useShieldedStore((s) => s.network);

  const uniqueTransactions = useMemo(() => {
    const seen = new Set<string>();
    return transactions.filter((tx) => {
      if (seen.has(tx.id)) return false;
      seen.add(tx.id);
      return true;
    });
  }, [transactions]);

  const unspent = notes.filter((n) => !n.spent);
  const hasKeys = useShieldedStore((s) => !!(s.viewingKey && s.spendingKey && s.viewingPub));

  return (
    <>
      <div className="dashboard-topbar">
        <div>
          <h1 style={{ margin: 0 }}>Dashboard</h1>
          <p className="muted" style={{ margin: "6px 0 0" }}>
            {network} · pool operations & balances
          </p>
        </div>
        <ConnectWallet />
      </div>

      <div className="banner">
        <div>
          <strong>{relayerOk ? "Relayer online" : "Relayer offline"}</strong>
          <div style={{ opacity: 0.9, fontSize: 14 }}>
            Private transfers and unshields are submitted via relayer
          </div>
        </div>
        <span className="badge ok">
          {scanLoading
            ? "Scanning chain for notes…"
            : scanRefreshing
              ? "Refreshing from chain…"
              : wallet && hasKeys
                ? `${unspent.length} unspent / ${notes.length} total notes`
                : wallet
                  ? "Connect to derive keys"
                  : "Not connected"}
        </span>
      </div>

      {wallet && !hasKeys && (
        <p className="badge warn" style={{ marginBottom: 16 }}>
          Shield keys missing — connect your wallet and sign the one-time key derivation message.
        </p>
      )}

      {wallet && keyMaterialAddress && wallet !== keyMaterialAddress && (
        <p className="badge warn" style={{ marginBottom: 16 }}>
          Connected wallet differs from shield keys — click <strong>Sync keys</strong> in the header.
        </p>
      )}

      {syncError && (
        <p className="badge err" style={{ marginBottom: 16 }}>
          {syncError}
        </p>
      )}

      {!syncError && syncWarnings.length > 0 && (
        <p className="badge warn" style={{ marginBottom: 16 }}>
          {syncWarnings.join(" · ")}
        </p>
      )}

      <div className="stat-grid">
        <div className="stat-card">
          <h3>Shielded balance</h3>
          <p>
            {wallet && hasKeys
              ? scanLoading
                ? "…"
                : maskAmount(formatTokenAmount(shieldedBalance), reveal)
              : "—"}
          </p>
        </div>
        <div className="stat-card">
          <h3>Unspent notes</h3>
          <p>{wallet && hasKeys ? (scanLoading ? "…" : unspent.length) : "—"}</p>
        </div>
        <div className="stat-card">
          <h3>Connected</h3>
          <p style={{ fontSize: "1rem" }}>{wallet ? shortenAddress(wallet, 5) : "—"}</p>
        </div>
      </div>

      <div className="panel-grid">
        <div className="card">
          <h2>Shielded notes</h2>
          <p className="muted" style={{ fontSize: 14 }}>
            Decrypted from on-chain route events using your viewing private key.
            {scanLoading ? " Initial scan…" : scanRefreshing ? " Background refresh…" : ""}
          </p>
          <table className="table">
            <thead>
              <tr>
                <th>Commitment</th>
                <th>Amount</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {!wallet || !hasKeys ? (
                <tr>
                  <td colSpan={3} className="muted">
                    Connect wallet and derive keys to scan notes
                  </td>
                </tr>
              ) : scanLoading && notes.length === 0 ? (
                <tr>
                  <td colSpan={3} className="muted">
                    Scanning pool events…
                  </td>
                </tr>
              ) : notes.length === 0 ? (
                <tr>
                  <td colSpan={3} className="muted">
                    No notes found — shield tokens or receive a private transfer
                  </td>
                </tr>
              ) : (
                notes.slice(0, 8).map((n) => (
                  <tr key={n.id}>
                    <td>{shortenAddress(n.commitment, 8)}</td>
                    <td>{maskAmount(formatTokenAmount(n.amount), reveal)}</td>
                    <td>
                      <span className={`badge ${n.spent ? "err" : "ok"}`}>{n.spent ? "spent" : "unspent"}</span>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
          {notes.length > 8 && (
            <p className="muted" style={{ fontSize: 13, marginTop: 8 }}>
              Showing 8 of {notes.length} — see Notes for the full list.
            </p>
          )}
        </div>
        <div className="card">
          <h2>Recent activity</h2>
          <table className="table">
            <thead>
              <tr>
                <th>Type</th>
                <th>Amount</th>
                <th>Status</th>
                <th>Tx</th>
              </tr>
            </thead>
            <tbody>
              {uniqueTransactions.length === 0 && (
                <tr>
                  <td colSpan={4} className="muted">
                    No transactions yet
                  </td>
                </tr>
              )}
              {uniqueTransactions.map((tx) => (
                <tr key={tx.id}>
                  <td>{tx.type}</td>
                  <td>{tx.amount}</td>
                  <td>
                    <span className={`badge ${tx.status === "confirmed" ? "ok" : tx.status === "failed" ? "err" : "warn"}`}>
                      {tx.status}
                    </span>
                  </td>
                  <td>{tx.txHash ? shortenAddress(tx.txHash, 6) : "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div className="card" style={{ marginTop: 16 }}>
        <h2>Contracts</h2>
        <ContractList />
      </div>
    </>
  );
}

function ContractList() {
  const network = useShieldedStore((s) => s.network);
  const [entries, setEntries] = useState<{ label: string; value: string }[]>([]);

  useEffect(() => {
    void loadNetworkConfig(network).then((c) => {
      const rows: { label: string; value: string }[] = [];
      const { tokens, ...rest } = c.contracts;
      for (const [k, v] of Object.entries(rest)) {
        if (typeof v === "string") rows.push({ label: k, value: v });
        else if (typeof v === "number") rows.push({ label: k, value: String(v) });
      }
      if (tokens) {
        for (const [sym, id] of Object.entries(tokens)) {
          if (id) rows.push({ label: `token.${sym}`, value: id });
        }
      }
      setEntries(rows);
    });
  }, [network]);

  return (
    <ul style={{ paddingLeft: 18, lineHeight: 1.8, fontSize: 13 }}>
      {entries.map(({ label, value }) => (
        <li key={label}>
          <strong>{label}</strong>: {shortenAddress(value, 8)}
        </li>
      ))}
    </ul>
  );
}
