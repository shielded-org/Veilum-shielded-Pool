import { useEffect, useMemo, useState } from "react";

import { AmountField } from "../components/ui/AmountField";
import { NotePicker } from "../components/ui/NotePicker";
import { FormAsideList, FormAsidePanel, FormPageLayout } from "../components/ui/FormPageLayout";
import { useTokenRegistry } from "../hooks/use-token-registry";
import { useWallet } from "../hooks/use-wallet";
import { useWalletTransactions } from "../hooks/use-wallet-transactions";
import { loadNetworkConfig } from "../lib/config";
import {
  groupUnspentNotesByToken,
  pickNoteForTransfer,
  tokenKey,
} from "../lib/note-groups";
import { runTransferJob } from "../lib/shielded-tx-runner";
import {
  NETWORK_IDS,
  networkNameFromId,
  parseRecipientInput,
} from "../lib/shielded-address";
import { executePrivateTransfer } from "../lib/shield-ops";
import { useUnspentNotes } from "../hooks/use-shielded-selectors";
import { useShieldedStore } from "../store/use-shielded-store";
import { formatStableUsd, parseTokenAmount } from "../lib/utils";
import type { Hex32 } from "../lib/types";

export function TransferPage() {
  const [amount, setAmount] = useState("");
  const [recipientAddress, setRecipientAddress] = useState("");
  const { address: wallet } = useWallet();
  const network = useShieldedStore((s) => s.network);
  const relayerOk = useShieldedStore((s) => s.relayerOk);
  const notes = useUnspentNotes();
  const merkleLeaves = useShieldedStore((s) => s.merkleLeaves);
  const spendingKey = useShieldedStore((s) => s.spendingKey);
  const viewingKey = useShieldedStore((s) => s.viewingKey);
  const viewingPub = useShieldedStore((s) => s.viewingPub);
  const ownerPk = useShieldedStore((s) => s.ownerPk);
  const routeCursor = useShieldedStore((s) => s.routeCursor);
  const addTransaction = useShieldedStore((s) => s.addTransaction);
  const transactions = useWalletTransactions();
  const [selectedTokenKey, setSelectedTokenKey] = useState("");
  const registry = useTokenRegistry();
  const groups = useMemo(() => groupUnspentNotesByToken(notes), [notes]);
  const selectedGroup =
    groups.find((g) => tokenKey(g.token) === selectedTokenKey) ?? groups[0];
  const selectedSymbol = registry?.symbolForField(selectedGroup?.token) ?? "token";
  const transferPending = transactions.some((t) => t.type === "transfer" && t.status === "pending");

  useEffect(() => {
    if (groups.length === 0) {
      setSelectedTokenKey("");
      return;
    }
    if (!selectedTokenKey || !groups.some((g) => tokenKey(g.token) === selectedTokenKey)) {
      setSelectedTokenKey(tokenKey(groups[0].token));
    }
  }, [groups, selectedTokenKey]);

  function onTransfer() {
    if (!wallet || !viewingPub || !ownerPk) throw new Error("Connect wallet first");
    const sendAmount = parseTokenAmount(amount);
    const note = pickNoteForTransfer(selectedGroup, sendAmount);
    if (!note) {
      throw new Error(
        selectedGroup && selectedGroup.noteCount > 1
          ? `No single note covers ${formatStableUsd(sendAmount)} — max per send is ${formatStableUsd(selectedGroup.maxNoteAmount)}`
          : "Amount exceeds available balance"
      );
    }

    const recipient = parseRecipientInput(recipientAddress);
    if (recipient.networkId != null && recipient.networkId !== NETWORK_IDS[network]) {
      const other = networkNameFromId(recipient.networkId) ?? `id ${recipient.networkId}`;
      throw new Error(`Recipient address is for ${other}, but dashboard is on ${network}`);
    }

    const txId = crypto.randomUUID();
    const amountLabel = `${amount} ${registry?.symbolForField(note.token) ?? "token"}`;
    const routeCursorAtSubmit = routeCursor;

    addTransaction(wallet, {
      id: txId,
      walletAddress: wallet,
      type: "transfer",
      status: "pending",
      amount: amountLabel,
      createdAt: new Date().toISOString(),
      progressStep: "prepare",
      progressMessage: "Starting private transfer…",
      progressPercent: 8,
    });

    runTransferJob({
      wallet,
      txId,
      amountLabel,
      run: async (onStatus) => {
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
          sendAmount,
          recipientViewingPub: recipient.viewingPub,
          recipientOwnerPk: recipient.ownerPk,
          leaves: merkleLeaves,
          senderRouteCursor: routeCursorAtSubmit,
          recipientRouteCursor: 0,
          onStatus,
        });
        return {
          txHash: result.txHash,
          spentNoteId: result.spentNoteId,
          contractId: config.contracts.shieldedPool,
        };
      },
    });

    setAmount("");
    setRecipientAddress("");
  }

  const parsedAmount = (() => {
    try {
      return amount ? parseTokenAmount(amount) : null;
    } catch {
      return null;
    }
  })();

  const spendNote =
    parsedAmount !== null
      ? pickNoteForTransfer(selectedGroup, parsedAmount)
      : selectedGroup?.notes[selectedGroup.notes.length - 1];

  const changeAmount =
    spendNote && parsedAmount !== null && parsedAmount < spendNote.amount
      ? spendNote.amount - parsedAmount
      : null;

  const amountHint = selectedGroup
    ? selectedGroup.noteCount > 1
      ? `${formatStableUsd(selectedGroup.totalAmount)} available · up to ${formatStableUsd(selectedGroup.maxNoteAmount)} per send`
      : `${formatStableUsd(selectedGroup.totalAmount)} available`
    : undefined;

  const amountExceedsLargestNote =
    parsedAmount !== null &&
    selectedGroup !== undefined &&
    parsedAmount > selectedGroup.maxNoteAmount;

  return (
    <FormPageLayout
      aside={
        <div className="form-layout__aside">
          <FormAsidePanel title="How private sends work">
            <FormAsideList
              items={[
                {
                  term: "Sender stays hidden",
                  detail: "Your wallet does not sign the on-chain transaction.",
                },
                {
                  term: "Recipient address",
                  detail: "Paste a shd_… address from the recipient's Keys page.",
                },
                {
                  term: "Change",
                  detail: "If you don't send the full note, the rest returns to you privately.",
                },
              ]}
            />
          </FormAsidePanel>
        </div>
      }
    >
      <div className="card form-card transfer-form">
        {!relayerOk ? (
          <p className="alert-banner alert-banner--error">
            Private sends are unavailable right now. Try again in a few minutes.
          </p>
        ) : null}

        {transferPending ? (
          <p className="form-notice">
            A private transfer is processing in the background. You can leave this page — track progress from
            Recent activity or the dock at the bottom of the screen.
          </p>
        ) : null}

        <p className="form-notice form-notice--private">
          <span className="form-notice__label">Private payment</span>
          Amount and recipient stay confidential. A network service submits the proof — your wallet is not
          linked as the sender on-chain.
        </p>

        <div className="transfer-flow">
          <section className="transfer-flow__step">
            <h3 className="transfer-flow__heading">From</h3>
            <NotePicker
              notes={notes}
              value={selectedTokenKey}
              onChange={setSelectedTokenKey}
              emptyMessage="No available balance — add funds or receive a private payment first."
            />
          </section>

          <section className="transfer-flow__step">
            <h3 className="transfer-flow__heading">Amount</h3>
            <AmountField
              id="transfer-amount"
              label={`Send (${selectedSymbol})`}
              value={amount}
              onChange={setAmount}
              symbol={selectedSymbol}
              maxAmount={selectedGroup?.maxNoteAmount}
              disabled={!selectedGroup || !relayerOk || transferPending}
              hint={amountHint}
            />
          </section>

          <section className="transfer-flow__step">
            <h3 className="transfer-flow__heading">To</h3>
            <div className="field">
              <label htmlFor="transfer-recipient" className="sr-only">
                Recipient address
              </label>
              <input
                id="transfer-recipient"
                className="input input--mono transfer-flow__recipient"
                value={recipientAddress}
                onChange={(e) => setRecipientAddress(e.target.value)}
                placeholder="shd_…"
                disabled={!relayerOk || transferPending}
              />
              <p className="field-hint">
                Ask the recipient for their Veilum address from Dashboard → Keys.
              </p>
            </div>
          </section>
        </div>

        {parsedAmount !== null && spendNote && recipientAddress.trim() && !amountExceedsLargestNote ? (
          <div className="transfer-summary" aria-live="polite">
            <div className="transfer-summary__row">
              <span>Send</span>
              <strong className="mono">{formatStableUsd(parsedAmount)}</strong>
            </div>
            {changeAmount !== null && changeAmount > 0n ? (
              <div className="transfer-summary__row transfer-summary__row--muted">
                <span>Change back to you</span>
                <span className="mono">{formatStableUsd(changeAmount)}</span>
              </div>
            ) : null}
          </div>
        ) : null}

        <div className="form-actions">
          <button
            className="btn btn-primary btn-lg"
            disabled={
              transferPending ||
              !relayerOk ||
              !wallet ||
              groups.length === 0 ||
              !recipientAddress.trim() ||
              !amount ||
              parsedAmount === null ||
              amountExceedsLargestNote ||
              !spendNote
            }
            onClick={() => void onTransfer()}
          >
            Send privately
          </button>
        </div>
      </div>
    </FormPageLayout>
  );
}
