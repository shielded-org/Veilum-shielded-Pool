import { useShieldedSync } from "../components/ConnectWallet";
import { EmptyState } from "../components/ui/EmptyState";
import { FormAsideList, FormAsidePanel, FormPageLayout } from "../components/ui/FormPageLayout";
import { NotesSummary } from "../components/ui/NotesSummary";
import { TokenAmount } from "../components/ui/TokenAmount";
import { useTokenRegistry } from "../hooks/use-token-registry";
import { TxLink } from "../components/ui/TxLink";
import { useShieldedStore } from "../store/use-shielded-store";

export function NotesPage() {
  useShieldedSync();
  const notes = useShieldedStore((s) => s.notes);
  const scanLoading = useShieldedStore((s) => s.scanLoading);
  const registry = useTokenRegistry();
  const unspent = notes.filter((n) => !n.spent).length;
  const spent = notes.length - unspent;

  return (
    <>
      <FormPageLayout
        aside={
          <FormAsidePanel title="How notes are found">
            <FormAsideList
              items={[
                { term: "Route events", detail: "Pool emits encrypted payloads on each shield and transfer." },
                { term: "Viewing key", detail: "Your browser decrypts events matching your viewing public key." },
                { term: "Spent status", detail: "Nullifiers on-chain mark notes that have been consumed." },
              ]}
            />
          </FormAsidePanel>
        }
      >
        <div className="card notes-card">
          <p className="form-intro">
            Notes are found by scanning pool <code>route</code> events and decrypting with your viewing key.
          </p>

          <NotesSummary total={notes.length} unspent={unspent} spent={spent} loading={scanLoading} />

          {notes.length === 0 ? (
            <EmptyState
              title={scanLoading ? "Scanning pool events…" : "No notes discovered yet"}
              body={
                scanLoading
                  ? "This may take a moment on first load."
                  : "Shield tokens or receive a private transfer"
              }
            />
          ) : (
            <div className="table-wrap">
              <table className="table">
                <thead>
                  <tr>
                    <th>Token</th>
                    <th>Amount</th>
                    <th>Status</th>
                    <th>Tx</th>
                  </tr>
                </thead>
                <tbody>
                  {notes.map((n) => (
                    <tr key={n.id}>
                      <td>{registry?.symbolForField(n.token) ?? "—"}</td>
                      <td className="mono">
                        <TokenAmount amount={n.amount} tokenField={n.token} showSymbol={false} />
                      </td>
                      <td>
                        <span className={`badge ${n.spent ? "err" : "ok"}`}>
                          {n.spent ? "spent" : "unspent"}
                        </span>
                      </td>
                      <td className="mono">{n.txHash ? <TxLink txHash={n.txHash} /> : "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </FormPageLayout>
    </>
  );
}
