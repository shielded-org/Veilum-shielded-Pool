import { txProgressLabel, txProgressSteps, stepIndex } from "../../lib/tx-progress";
import { humanizeTxDetail } from "../../lib/user-messages";
import type { TransactionRecord, TxProgressStep } from "../../lib/types";
import { TxLink } from "./TxLink";
import { useWalletTransaction } from "../../hooks/use-wallet-transactions";
import { useTxPanelStore } from "../../store/use-tx-panel-store";

const TYPE_TITLE: Record<TransactionRecord["type"], string> = {
  shield: "Shield deposit",
  transfer: "Private transfer",
  unshield: "Withdrawal",
  receive: "Private receive",
};

type TransactionProgressPanelProps = {
  txId: string | null;
};

function activeStep(tx: TransactionRecord): TxProgressStep {
  if (tx.status === "confirmed") return "done";
  if (tx.status === "failed") return "done";
  return tx.progressStep ?? "prepare";
}

export function TransactionProgressPanel({ txId }: TransactionProgressPanelProps) {
  const tx = useWalletTransaction(txId);
  const minimized = useTxPanelStore((s) => s.minimized);
  const minimizePanel = useTxPanelStore((s) => s.minimizePanel);
  const expandPanel = useTxPanelStore((s) => s.expandPanel);
  const closePanel = useTxPanelStore((s) => s.closePanel);

  if (!tx || !txId) return null;

  const step = activeStep(tx);
  const steps = txProgressSteps();
  const currentIdx = stepIndex(step);
  const percent = tx.progressPercent ?? (step === "done" ? 100 : 30);
  const processing = tx.status === "pending";
  const title = TYPE_TITLE[tx.type];

  if (minimized) {
    return (
      <button
        type="button"
        className="tx-progress-dock"
        onClick={expandPanel}
        aria-label={`${title} — ${processing ? "processing" : tx.status}`}
      >
        <span className={`tx-progress-dock__dot${processing ? " tx-progress-dock__dot--pulse" : ""}`} />
        <span className="tx-progress-dock__label">
          {processing ? "Processing…" : tx.status === "confirmed" ? "Complete" : "Failed"}
        </span>
        <span className="tx-progress-dock__amount mono">{tx.amount}</span>
      </button>
    );
  }

  return (
    <div
      className="tx-progress-overlay"
      role="dialog"
      aria-modal="true"
      aria-labelledby="tx-progress-title"
      onClick={processing ? minimizePanel : closePanel}
    >
      <div className="tx-progress-card" onClick={(e) => e.stopPropagation()}>
        <header className="tx-progress-card__header">
          <div>
            <p className="tx-progress-card__kicker">{processing ? "Processing" : "Transaction"}</p>
            <h2 id="tx-progress-title" className="tx-progress-card__title">
              {title}
            </h2>
            <p className="tx-progress-card__amount mono">{tx.amount}</p>
          </div>
          <div className="tx-progress-card__actions">
            {processing ? (
              <button type="button" className="btn btn-ghost btn-sm" onClick={minimizePanel}>
                Minimize
              </button>
            ) : (
              <button type="button" className="btn btn-ghost btn-sm" onClick={closePanel} aria-label="Close">
                Close
              </button>
            )}
          </div>
        </header>

        <div
          className="tx-progress-card__track"
          role="progressbar"
          aria-valuenow={percent}
          aria-valuemin={0}
          aria-valuemax={100}
        >
          <div className="tx-progress-card__fill" style={{ transform: `scaleX(${percent / 100})` }} />
        </div>

        <ol className="tx-progress-steps">
          {steps.map((s) => {
            const idx = stepIndex(s);
            const done = tx.status === "confirmed" || idx < currentIdx;
            const active = processing && s === step;
            const failed = tx.status === "failed" && s === step;
            return (
              <li
                key={s}
                className={`tx-progress-steps__item${done ? " tx-progress-steps__item--done" : ""}${active ? " tx-progress-steps__item--active" : ""}${failed ? " tx-progress-steps__item--failed" : ""}`}
              >
                <span className="tx-progress-steps__marker" aria-hidden>
                  {done ? "✓" : failed ? "✗" : active ? "…" : ""}
                </span>
                <span>{txProgressLabel(s)}</span>
              </li>
            );
          })}
        </ol>

        {tx.progressMessage ? (
          <p className="tx-progress-card__status mono" aria-live="polite">
            {tx.progressMessage}
          </p>
        ) : null}

        {tx.status === "confirmed" ? (
          <p className="tx-progress-card__outcome tx-progress-card__outcome--ok">Transaction successful</p>
        ) : null}
        {tx.status === "failed" ? (
          <p className="tx-progress-card__outcome tx-progress-card__outcome--err">
            {tx.detail ? humanizeTxDetail(tx.detail) : "Transaction failed"}
          </p>
        ) : null}

        {tx.txHash ? (
          <p className="tx-progress-card__hash">
            Tx: <TxLink txHash={tx.txHash} shorten={4} />
          </p>
        ) : null}

        {processing ? (
          <p className="tx-progress-card__hint">
            You can minimize this panel and keep using the app. Balance updates when the indexer confirms your spend.
          </p>
        ) : null}

        {!processing ? (
          <div className="tx-progress-card__footer">
            <button type="button" className="btn btn-primary btn-sm" onClick={closePanel}>
              Done
            </button>
          </div>
        ) : null}
      </div>
    </div>
  );
}
