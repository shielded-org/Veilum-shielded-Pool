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
import { fetchAspStatus, type AspStatus } from "../lib/asp";
import { loadNetworkConfig } from "../lib/config";
import { executeUnshield } from "../lib/shield-ops";
import { finishNotify, notifyLoading } from "../lib/notify";
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
  const [aspStatus, setAspStatus] = useState<AspStatus | null>(null);
  const [aspEnforced, setAspEnforced] = useState(false);

  useEffect(() => {
    if (!ownerPk) return;
    void loadNetworkConfig(network).then((config) => {
      setAspEnforced(Boolean(config.contracts.aspEnforceShield || config.contracts.aspGate));
      if (config.contracts.aspEnforceShield || config.contracts.aspGate) {
        void fetchAspStatus(ownerPk as Hex32).then((s) => setAspStatus(s.status));
      }
    });
  }, [network, ownerPk]);

  async function onUnshield() {
    if (!wallet || !viewingPub || !ownerPk) throw new Error("Connect wallet first");
    const note = notes.find((n) => n.id === noteId) ?? notes[0];
    if (!note) throw new Error("No unspent note");
    const to = recipient || wallet;
    setBusy(true);
    const txId = crypto.randomUUID();
    const loadingToast = notifyLoading("Submitting withdrawal…");
    addTransaction({
      id: txId,
      type: "unshield",
      status: "pending",
      amount: `${amount} ${registry?.symbolForField(note.token) ?? "token"}`,
      createdAt: new Date().toISOString(),
    });
    try {
      const config = await loadNetworkConfig(network);
      const contractId = config.contracts.aspGate ?? config.contracts.shieldedPool;
      updateTransaction(txId, { contractId });
      setStatus("Generating proof and submitting to relayer…");
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
      await syncShieldedWalletNow({ mode: "incremental" });
      updateTransaction(txId, {
        status: "confirmed",
        txHash: result.txHash ?? undefined,
        contractId,
      });
      finishNotify(loadingToast, {
        ok: true,
        message: "Withdrawal confirmed on-chain",
        txHash: result.txHash,
      });
      setStatus("Withdrawal confirmed on-chain");
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      updateTransaction(txId, {
        status: "failed",
        detail: message,
      });
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
          <FormAsidePanel title="Withdrawal details">
            <FormAsideList
              items={[
                { term: "Public exit", detail: "Recipient address and withdrawn amount appear on-chain." },
                { term: "Private change", detail: "Remaining note value can stay shielded as a change note." },
                { term: "Default recipient", detail: "Leave blank to send to your connected wallet." },
              ]}
            />
          </FormAsidePanel>
        }
      >
        <div className="card form-card">
          <RelayerStatus online={relayerOk} />

          {aspEnforced && aspStatus ? (
            <StatusMessage
              variant={aspStatus === "approved" ? "success" : aspStatus === "denied" ? "error" : "info"}
            >
              {aspStatus === "approved"
                ? "ASP membership active — withdrawal will verify compliance on-chain."
                : aspStatus === "denied"
                  ? "ASP denied — withdrawal blocked."
                  : "ASP compliance required before withdrawal."}
            </StatusMessage>
          ) : null}

          <PrivacyCallout variant="public">
            Exits shielded balance to a public Stellar address. Recipient and amount will be visible
            on-chain. Remaining value can stay as a private change note.
          </PrivacyCallout>

          <div className="field">
            <label htmlFor="unshield-note">Note to spend</label>
            <NoteSelector
              notes={notes}
              value={noteId}
              onChange={setNoteId}
              emptyMessage="No unspent notes — shield tokens or receive a private transfer first."
            />
          </div>
          <div className="field">
            <label htmlFor="unshield-amount">Public amount ({selectedSymbol})</label>
            <input
              id="unshield-amount"
              className="input"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
            />
          </div>
          <div className="field">
            <label htmlFor="unshield-recipient">Recipient Stellar address</label>
            <input
              id="unshield-recipient"
              className="input input--mono"
              value={recipient}
              onChange={(e) => setRecipient(e.target.value)}
              placeholder={wallet ? `${wallet.slice(0, 4)}… (connected wallet)` : "G…"}
            />
            <p className="field-hint">Defaults to your connected wallet if left empty.</p>
          </div>
          <div className="form-actions">
            <button
              className="btn btn-primary"
              disabled={busy || aspStatus === "denied" || !wallet || notes.length === 0}
              onClick={() => void onUnshield()}
            >
              Unshield
            </button>
          </div>
          {status && <StatusMessage variant={statusVariant}>{status}</StatusMessage>}
        </div>
      </FormPageLayout>
      {busy && <ProofLoader message={status} />}
    </>
  );
}
