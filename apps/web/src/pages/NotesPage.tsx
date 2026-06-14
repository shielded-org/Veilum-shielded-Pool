import { ConnectWallet, useShieldedSync } from "../components/ConnectWallet";
import { useShieldedStore } from "../store/use-shielded-store";
import { shortenAddress } from "../lib/utils";

export function NotesPage() {
  useShieldedSync();
  const notes = useShieldedStore((s) => s.notes);
  const scanLoading = useShieldedStore((s) => s.scanLoading);

  return (
    <>
      <div className="dashboard-topbar">
        <h1 style={{ margin: 0 }}>Discovered notes</h1>
        <ConnectWallet />
      </div>
      <div className="card">
        <p className="muted">
          Notes are found by scanning pool <code>route</code> events and decrypting with your viewing
          key. {scanLoading ? "Scanning…" : `${notes.length} total.`}
        </p>
        <table className="table">
          <thead>
            <tr>
              <th>Commitment</th>
              <th>Amount</th>
              <th>Status</th>
              <th>Tx</th>
            </tr>
          </thead>
          <tbody>
            {notes.length === 0 && (
              <tr>
                <td colSpan={4} className="muted">
                  No notes discovered yet — shield tokens or receive a private transfer
                </td>
              </tr>
            )}
            {notes.map((n) => (
              <tr key={n.id}>
                <td>{shortenAddress(n.commitment, 8)}</td>
                <td>{n.amount.toString()}</td>
                <td>
                  <span className={`badge ${n.spent ? "err" : "ok"}`}>{n.spent ? "spent" : "unspent"}</span>
                </td>
                <td>{n.txHash ? shortenAddress(n.txHash, 6) : "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}
