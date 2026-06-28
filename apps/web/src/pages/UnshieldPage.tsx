import { useEffect, useMemo, useState } from "react";

import { AmountField } from "../components/ui/AmountField";
import { NotePicker } from "../components/ui/NotePicker";
import { FormAsideList, FormAsidePanel, FormPageLayout } from "../components/ui/FormPageLayout";
import { useTokenRegistry } from "../hooks/use-token-registry";
import { useWallet } from "../hooks/use-wallet";
import { useWalletTransactions } from "../hooks/use-wallet-transactions";
import { fetchAspStatus, type AspStatus } from "../lib/asp";
import { loadNetworkConfig } from "../lib/config";
import {
  groupUnspentNotesByToken,
  pickNoteForTransfer,
  tokenKey,
} from "../lib/note-groups";
import { runUnshieldJob } from "../lib/shielded-tx-runner";
import { executeUnshield } from "../lib/shield-ops";
import { useUnspentNotes } from "../hooks/use-shielded-selectors";
import { useShieldedStore } from "../store/use-shielded-store";
import { formatStableUsd, parseTokenAmount } from "../lib/utils";
import type { Hex32 } from "../lib/types";

export function UnshieldPage() {
  const [amount, setAmount] = useState("");
  const [recipient, setRecipient] = useState("");
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
  const [aspStatus, setAspStatus] = useState<AspStatus | null>(null);
  const [aspEnforced, setAspEnforced] = useState(false);
  const withdrawPending = transactions.some((t) => t.type === "unshield" && t.status === "pending");

  useEffect(() => {
    if (!ownerPk) return;
    void loadNetworkConfig(network).then((config) => {
      setAspEnforced(Boolean(config.contracts.aspEnforceShield || config.contracts.aspGate));
      if (config.contracts.aspEnforceShield || config.contracts.aspGate) {
        void fetchAspStatus(ownerPk as Hex32).then((s) => setAspStatus(s.status));
      }
    });
  }, [network, ownerPk]);

  useEffect(() => {
    if (groups.length === 0) {
      setSelectedTokenKey("");
      return;
    }
    if (!selectedTokenKey || !groups.some((g) => tokenKey(g.token) === selectedTokenKey)) {
      setSelectedTokenKey(tokenKey(groups[0].token));
    }
  }, [groups, selectedTokenKey]);

  function onUnshield() {
    if (!wallet || !viewingPub || !ownerPk) throw new Error("Connect wallet first");
    const withdrawAmount = parseTokenAmount(amount);
    const note = pickNoteForTransfer(selectedGroup, withdrawAmount);
    if (!note) {
      throw new Error(
        selectedGroup && selectedGroup.noteCount > 1
          ? `No single note covers ${formatStableUsd(withdrawAmount)} — max per withdrawal is ${formatStableUsd(selectedGroup.maxNoteAmount)}`
          : "Amount exceeds available balance"
      );
    }

    const to = recipient.trim() || wallet;
    const txId = crypto.randomUUID();
    const amountLabel = `${amount} ${registry?.symbolForField(note.token) ?? "token"}`;
    const routeCursorAtSubmit = routeCursor;

    addTransaction(wallet, {
      id: txId,
      walletAddress: wallet,
      type: "unshield",
      status: "pending",
      amount: amountLabel,
      createdAt: new Date().toISOString(),
      progressStep: "prepare",
      progressMessage: "Starting withdrawal…",
      progressPercent: 8,
    });

    runUnshieldJob({
      wallet,
      txId,
      amountLabel,
      run: async (onStatus) => {
        const config = await loadNetworkConfig(network);
        const contractId = config.contracts.aspGate ?? config.contracts.shieldedPool;
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
          amount: withdrawAmount,
          leaves: merkleLeaves,
          routeCursor: routeCursorAtSubmit,
          onStatus,
        });
        return {
          txHash: result.txHash,
          spentNoteId: result.spentNoteId,
          contractId,
        };
      },
    });

    setAmount("");
    setRecipient("");
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
      ? `${formatStableUsd(selectedGroup.totalAmount)} private · up to ${formatStableUsd(selectedGroup.maxNoteAmount)} per withdrawal`
      : `${formatStableUsd(selectedGroup.totalAmount)} in private balance`
    : undefined;

  const amountExceedsLargestNote =
    parsedAmount !== null &&
    selectedGroup !== undefined &&
    parsedAmount > selectedGroup.maxNoteAmount;

  const recipientPreview = recipient.trim() || wallet;

  return (
    <>
      <FormPageLayout
        aside={
          <div className="form-layout__aside">
            {aspEnforced && aspStatus ? (
              <FormAsidePanel title="Compliance">
                <p
                  className={`withdraw-asp-status withdraw-asp-status--${aspStatus}`}
                  role="status"
                >
                  {aspStatus === "approved"
                    ? "Membership active — withdrawal will verify compliance on-chain."
                    : aspStatus === "denied"
                      ? "Membership denied — withdrawals are blocked."
                      : "Compliance verification required before withdrawal."}
                </p>
              </FormAsidePanel>
            ) : null}
            <FormAsidePanel title="How withdrawals work">
              <FormAsideList
                items={[
                  {
                    term: "Public exit",
                    detail: "Recipient address and withdrawn amount appear on Stellar.",
                  },
                  {
                    term: "Private change",
                    detail: "Any amount you don't withdraw stays in a new private note.",
                  },
                  {
                    term: "Default recipient",
                    detail: "Leave blank to send to your connected wallet.",
                  },
                ]}
              />
            </FormAsidePanel>
          </div>
        }
      >
        <div className="card form-card withdraw-form">
          {!relayerOk ? (
            <p className="alert-banner alert-banner--error">
              Withdrawals are unavailable right now. Try again in a few minutes.
            </p>
          ) : null}

          {withdrawPending ? (
            <p className="form-notice">
              A withdrawal is processing in the background. Track progress from Recent activity or the dock
              at the bottom of the screen.
            </p>
          ) : null}

          <p className="form-notice form-notice--public">
            <span className="form-notice__label">Public withdrawal</span>
            Moves funds from your private balance to a public Stellar address. The recipient and
            amount will be visible on-chain — unlike shielding or private sends.
          </p>

          <div className="transfer-flow">
            <section className="transfer-flow__step">
              <h3 className="transfer-flow__heading">From</h3>
              <NotePicker
                notes={notes}
                value={selectedTokenKey}
                onChange={setSelectedTokenKey}
                emptyMessage="No private balance — shield tokens or receive a private payment first."
              />
            </section>

            <section className="transfer-flow__step">
              <h3 className="transfer-flow__heading">Amount</h3>
              <AmountField
                id="unshield-amount"
                label={`Withdraw (${selectedSymbol})`}
                value={amount}
                onChange={setAmount}
                symbol={selectedSymbol}
                maxAmount={selectedGroup?.maxNoteAmount}
                disabled={!selectedGroup || !relayerOk || aspStatus === "denied" || withdrawPending}
                hint={amountHint}
              />
            </section>

            <section className="transfer-flow__step">
              <h3 className="transfer-flow__heading">To</h3>
              <div className="field">
                <label htmlFor="unshield-recipient" className="sr-only">
                  Recipient Stellar address
                </label>
                <input
                  id="unshield-recipient"
                  className="input input--mono transfer-flow__recipient"
                  value={recipient}
                  onChange={(e) => setRecipient(e.target.value)}
                  placeholder={wallet ? `${wallet.slice(0, 4)}…${wallet.slice(-4)} (connected wallet)` : "G…"}
                  disabled={!relayerOk || aspStatus === "denied" || withdrawPending}
                />
                <p className="field-hint">
                  Public Stellar address (G…). Defaults to your connected wallet if left empty.
                </p>
              </div>
            </section>
          </div>

          {parsedAmount !== null && spendNote && recipientPreview && !amountExceedsLargestNote ? (
            <div className="transfer-summary withdraw-summary" aria-live="polite">
              <div className="transfer-summary__row">
                <span>Withdraw publicly</span>
                <strong className="mono">{formatStableUsd(parsedAmount)}</strong>
              </div>
              {changeAmount !== null && changeAmount > 0n ? (
                <div className="transfer-summary__row transfer-summary__row--muted">
                  <span>Stays private as change</span>
                  <span className="mono">{formatStableUsd(changeAmount)}</span>
                </div>
              ) : null}
            </div>
          ) : null}

          <div className="form-actions">
            <button
              className="btn btn-primary btn-lg withdraw-form__submit"
              disabled={
                withdrawPending ||
                !relayerOk ||
                aspStatus === "denied" ||
                !wallet ||
                groups.length === 0 ||
                !amount ||
                parsedAmount === null ||
                amountExceedsLargestNote ||
                !spendNote
              }
              onClick={() => void onUnshield()}
            >
              Withdraw publicly
            </button>
          </div>
        </div>
      </FormPageLayout>
    </>
  );
}
