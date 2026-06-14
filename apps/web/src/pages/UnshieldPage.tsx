import { useState } from "react";

import { ConnectWallet, syncShieldedWalletNow } from "../components/ConnectWallet";
import { useWallet } from "../hooks/use-wallet";
import { ProofLoader } from "../components/ProofLoader";
import { loadNetworkConfig } from "../lib/config";
import { executeUnshield } from "../lib/shield-ops";
import { useUnspentNotes } from "../hooks/use-shielded-selectors";
import { useShieldedStore } from "../store/use-shielded-store";
import { parseTokenAmount } from "../lib/utils";
import type { Hex32 } from "../lib/types";

export function UnshieldPage() {
  const [amount, setAmount] = useState("20");
  const [recipient, setRecipient] = useState("");
  const [status, setStatus] = useState("");
  const [busy, setBusy] = useState(false);
  const { address: wallet } = useWallet();
  const network = useShieldedStore((s) => s.network);
  const notes = useUnspentNotes();
  const merkleLeaves = useShieldedStore((s) => s.merkleLeaves);
  const spendingKey = useShieldedStore((s) => s.spendingKey);
  const viewingKey = useShieldedStore((s) => s.viewingKey);
  const viewingPub = useShieldedStore((s) => s.viewingPub);
  const ownerPk = useShieldedStore((s) => s.ownerPk);
  const bumpRouteCursor = useShieldedStore((s) => s.bumpRouteCursor);
  const addTransaction = useShieldedStore((s) => s.addTransaction);
  const updateTransaction = useShieldedStore((s) => s.updateTransaction);
  const markNoteSpent = useShieldedStore((s) => s.markNoteSpent);
  const addNote = useShieldedStore((s) => s.addNote);
  const [noteId, setNoteId] = useState("");

  async function onUnshield() {
    if (!wallet || !viewingPub || !ownerPk) throw new Error("Connect wallet first");
    const note = notes.find((n) => n.id === noteId) ?? notes[0];
    if (!note) throw new Error("No unspent note");
    const to = recipient || wallet;
    setBusy(true);
    const txId = crypto.randomUUID();
    addTransaction({
      id: txId,
      type: "unshield",
      status: "pending",
      amount,
      createdAt: new Date().toISOString(),
    });
    try {
      const config = await loadNetworkConfig(network);
      const result = await executeUnshield({
        config,
        wallet,
        keys: {
          spendingKey: BigInt(spendingKey),
          viewingPriv: BigInt(viewingKey),
          viewingPub,
          ownerPk: ownerPk as Hex32,
        },
        note,
        recipientAddress: to,
        amount: parseTokenAmount(amount),
        leaves: merkleLeaves,
        routeCursor: bumpRouteCursor(),
        onStatus: setStatus,
      });
      markNoteSpent(note.id);
      if (result.changeNote) addNote(result.changeNote);
      updateTransaction(txId, {
        status: "confirmed",
        txHash: result.txHash ?? undefined,
      });
      await syncShieldedWalletNow({ mode: "incremental" });
      setStatus(`Withdrawal complete (${result.requestId})`);
    } catch (e) {
      updateTransaction(txId, {
        status: "failed",
        detail: e instanceof Error ? e.message : String(e),
      });
      setStatus(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <div className="dashboard-topbar">
        <h1 style={{ margin: 0 }}>Withdraw / Unshield</h1>
        <ConnectWallet />
      </div>
      <div className="card" style={{ maxWidth: 560 }}>
        <p className="muted">
          Exits shielded balance to a public Stellar address. Recipient and amount will be visible
          on-chain. Remaining value can stay as a private change note.
        </p>
        <div className="field">
          <label>Note to spend</label>
          {notes.length === 0 ? (
            <p className="muted">No unspent notes — shield tokens or receive a private transfer first.</p>
          ) : (
            <select value={noteId || notes[0]?.id || ""} onChange={(e) => setNoteId(e.target.value)}>
              {notes.map((n) => (
                <option key={n.id} value={n.id}>
                  {n.amount.toString()} — {n.commitment.slice(0, 10)}…
                </option>
              ))}
            </select>
          )}
        </div>
        <div className="field">
          <label>Public amount</label>
          <input value={amount} onChange={(e) => setAmount(e.target.value)} />
        </div>
        <div className="field">
          <label>Recipient Stellar address (default: connected wallet)</label>
          <input value={recipient} onChange={(e) => setRecipient(e.target.value)} placeholder="G…" />
        </div>
        <button
          className="btn btn-purple"
          disabled={busy || !wallet || notes.length === 0}
          onClick={() => void onUnshield()}
        >
          Unshield
        </button>
        {status && <p style={{ marginTop: 12 }}>{status}</p>}
      </div>
      {busy && <ProofLoader message={status} />}
    </>
  );
}
