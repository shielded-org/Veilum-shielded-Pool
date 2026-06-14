import { useState } from "react";

import { ConnectWallet, syncShieldedWalletNow } from "../components/ConnectWallet";
import { useWallet } from "../hooks/use-wallet";
import { ProofLoader } from "../components/ProofLoader";
import { loadNetworkConfig } from "../lib/config";
import { executePrivateTransfer } from "../lib/shield-ops";
import {
  NETWORK_IDS,
  networkNameFromId,
  parseRecipientInput,
} from "../lib/shielded-address";
import { useUnspentNotes } from "../hooks/use-shielded-selectors";
import { useShieldedStore } from "../store/use-shielded-store";
import { parseTokenAmount } from "../lib/utils";
import type { Hex32 } from "../lib/types";

export function TransferPage() {
  const [amount, setAmount] = useState("40");
  const [recipientAddress, setRecipientAddress] = useState("");
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
  const markNoteSpent = useShieldedStore((s) => s.markNoteSpent);
  const addNote = useShieldedStore((s) => s.addNote);
  const addTransaction = useShieldedStore((s) => s.addTransaction);
  const updateTransaction = useShieldedStore((s) => s.updateTransaction);
  const [noteId, setNoteId] = useState("");

  async function onTransfer() {
    if (!wallet || !viewingPub || !ownerPk) throw new Error("Connect wallet first");
    const note = notes.find((n) => n.id === noteId) ?? notes[0];
    if (!note) throw new Error("No unspent note");

    const recipient = parseRecipientInput(recipientAddress);
    if (recipient.networkId != null && recipient.networkId !== NETWORK_IDS[network]) {
      const other = networkNameFromId(recipient.networkId) ?? `id ${recipient.networkId}`;
      throw new Error(`Recipient address is for ${other}, but dashboard is on ${network}`);
    }

    setBusy(true);
    const txId = crypto.randomUUID();
    addTransaction({
      id: txId,
      type: "transfer",
      status: "pending",
      amount,
      createdAt: new Date().toISOString(),
    });
    try {
      const config = await loadNetworkConfig(network);
      const result = await executePrivateTransfer({
        config,
        wallet,
        keys: {
          spendingKey: BigInt(spendingKey),
          viewingPriv: BigInt(viewingKey),
          viewingPub,
          ownerPk: ownerPk as Hex32,
        },
        note,
        sendAmount: parseTokenAmount(amount),
        recipientViewingPub: recipient.viewingPub,
        recipientOwnerPk: recipient.ownerPk,
        leaves: merkleLeaves,
        senderRouteCursor: bumpRouteCursor(),
        recipientRouteCursor: 0,
        onStatus: setStatus,
      });
      markNoteSpent(note.id);
      if (result.changeNote) addNote(result.changeNote);
      updateTransaction(txId, {
        status: "confirmed",
        txHash: result.txHash ?? undefined,
      });
      await syncShieldedWalletNow({ mode: "incremental" });
      setStatus(`Transfer submitted (${result.requestId})`);
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
        <h1 style={{ margin: 0 }}>Private Transfer</h1>
        <ConnectWallet />
      </div>
      <div className="card" style={{ maxWidth: 560 }}>
        <p className="muted">
          Relayer submits the proof. Your wallet is not the transaction signer — sender identity stays
          off-chain.
        </p>
        <div className="field">
          <label>Source note</label>
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
          <label>Amount</label>
          <input value={amount} onChange={(e) => setAmount(e.target.value)} />
        </div>
        <div className="field">
          <label>Recipient shielded address</label>
          <input
            value={recipientAddress}
            onChange={(e) => setRecipientAddress(e.target.value)}
            placeholder="shd_…"
          />
          <p className="muted" style={{ fontSize: 13, marginTop: 6 }}>
            Ask the recipient for their address from Dashboard → Viewing Keys.
          </p>
        </div>
        <button
          className="btn btn-purple"
          disabled={busy || !wallet || notes.length === 0}
          onClick={() => void onTransfer()}
        >
          Send privately
        </button>
        {status && <p style={{ marginTop: 12 }}>{status}</p>}
      </div>
      {busy && <ProofLoader message={status} />}
    </>
  );
}
