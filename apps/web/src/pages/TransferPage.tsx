import { useEffect, useState } from "react";

import { syncShieldedWalletNow } from "../components/ConnectWallet";
import { ProofLoader } from "../components/ProofLoader";
import { NoteSelector } from "../components/ui/NoteSelector";
import { FormAsideList, FormAsidePanel, FormPageLayout } from "../components/ui/FormPageLayout";
import { PrivacyCallout } from "../components/ui/PrivacyCallout";
import { RelayerStatus } from "../components/ui/RelayerStatus";
import { StatusMessage } from "../components/ui/StatusMessage";
import { useTokenRegistry } from "../hooks/use-token-registry";
import { useWallet } from "../hooks/use-wallet";
import { loadNetworkConfig } from "../lib/config";
import { executePrivateTransfer } from "../lib/shield-ops";
import { finishNotify, notifyLoading } from "../lib/notify";
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
  const relayerOk = useShieldedStore((s) => s.relayerOk);
  const notes = useUnspentNotes();
  const merkleLeaves = useShieldedStore((s) => s.merkleLeaves);
  const spendingKey = useShieldedStore((s) => s.spendingKey);
  const viewingKey = useShieldedStore((s) => s.viewingKey);
  const viewingPub = useShieldedStore((s) => s.viewingPub);
  const ownerPk = useShieldedStore((s) => s.ownerPk);
  const bumpRouteCursor = useShieldedStore((s) => s.bumpRouteCursor);
  const addTransaction = useShieldedStore((s) => s.addTransaction);
  const updateTransaction = useShieldedStore((s) => s.updateTransaction);
  const [noteId, setNoteId] = useState("");
  const registry = useTokenRegistry();
  const selectedNote = notes.find((n) => n.id === noteId) ?? notes[0];
  const selectedSymbol = registry?.symbolForField(selectedNote?.token) ?? "token";

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
    const loadingToast = notifyLoading("Submitting private transfer…");
    addTransaction({
      id: txId,
      type: "transfer",
      status: "pending",
      amount: `${amount} ${registry?.symbolForField(note.token) ?? "token"}`,
      createdAt: new Date().toISOString(),
    });
    try {
      const config = await loadNetworkConfig(network);
      updateTransaction(txId, { contractId: config.contracts.shieldedPool });
      setStatus("Generating proof and submitting to relayer…");
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
      setStatus("Refreshing wallet from chain…");
      await syncShieldedWalletNow({ mode: "incremental" });
      updateTransaction(txId, {
        status: "confirmed",
        txHash: result.txHash ?? undefined,
        contractId: config.contracts.shieldedPool,
      });
      finishNotify(loadingToast, {
        ok: true,
        message: "Private transfer confirmed on-chain",
        txHash: result.txHash,
      });
      setStatus("Transfer confirmed on-chain");
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      updateTransaction(txId, { status: "failed", detail: message });
      finishNotify(loadingToast, { ok: false, message });
      setStatus(message);
    } finally {
      setBusy(false);
    }
  }

  const statusVariant =
    status.toLowerCase().includes("error") ||
    status.toLowerCase().includes("fail") ||
    status.toLowerCase().includes("not applied") ||
    status.toLowerCase().includes("did not succeed")
      ? "error"
      : status.toLowerCase().includes("confirmed")
        ? "success"
        : "info";

  return (
    <>
      <FormPageLayout
        aside={
          <FormAsidePanel title="Private transfer checklist">
            <FormAsideList
              items={[
                { term: "Relayer required", detail: "Proof is submitted by the relayer — your wallet is not the tx signer." },
                { term: "Recipient address", detail: "Paste a shd_… address from the recipient's Viewing Keys page." },
                { term: "Change note", detail: "Any leftover value returns to you as a new private note." },
              ]}
            />
          </FormAsidePanel>
        }
      >
        <div className="card form-card">
          <RelayerStatus online={relayerOk} />

          <PrivacyCallout variant="private">
            Relayer submits the proof. Your wallet is not the transaction signer — sender identity stays
            off-chain.
          </PrivacyCallout>

          <div className="field">
            <label htmlFor="transfer-note">Source note</label>
            <NoteSelector
              notes={notes}
              value={noteId}
              onChange={setNoteId}
              emptyMessage="No unspent notes — shield tokens or receive a private transfer first."
            />
          </div>
          <div className="field">
            <label htmlFor="transfer-amount">Amount ({selectedSymbol})</label>
            <input
              id="transfer-amount"
              className="input"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
            />
          </div>
          <div className="field">
            <label htmlFor="transfer-recipient">Recipient shielded address</label>
            <input
              id="transfer-recipient"
              className="input input--mono"
              value={recipientAddress}
              onChange={(e) => setRecipientAddress(e.target.value)}
              placeholder="shd_…"
            />
            <p className="field-hint">
              Ask the recipient for their address from Dashboard → Viewing Keys.
            </p>
          </div>
          <div className="form-actions">
            <button
              className="btn btn-primary"
              disabled={busy || !wallet || notes.length === 0}
              onClick={() => void onTransfer()}
            >
              Send privately
            </button>
          </div>
          {status && <StatusMessage variant={statusVariant}>{status}</StatusMessage>}
        </div>
      </FormPageLayout>
      {busy && <ProofLoader message={status} />}
    </>
  );
}
