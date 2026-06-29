import type { TransactionRecord } from "../lib/types";
import { formatActivityAmount } from "../lib/utils";

const TYPE_LABEL: Record<TransactionRecord["type"], string> = {
  shield: "Deposit",
  transfer: "Outgoing",
  unshield: "Withdraw",
  receive: "Incoming",
};

const STATUS_LABEL: Record<TransactionRecord["status"], string> = {
  confirmed: "Confirmed",
  pending: "Pending",
  failed: "Failed",
};

function flowClass(type: TransactionRecord["type"]): string {
  if (type === "receive" || type === "shield") return "activity-row--in";
  if (type === "transfer" || type === "unshield") return "activity-row--out";
  return "";
}

export function ActivityScreen({ transactions }: { transactions: TransactionRecord[] }) {
  if (transactions.length === 0) {
    return (
      <>
        <h2 className="screen-title">Activity</h2>
        <p className="text-muted">No transactions yet.</p>
        <p className="text-subtle">Incoming private transfers appear here after a balance sync.</p>
      </>
    );
  }

  return (
    <>
      <h2 className="screen-title">Activity</h2>
      <section aria-label="Recent activity">
        {transactions.map((tx) => {
          const flow = flowClass(tx.type);
          return (
          <div
            key={tx.id}
            className={`activity-row activity-row--${tx.type}${flow ? ` ${flow}` : ""}`}
          >
            <div className="activity-row__meta">
              <div className="activity-row__title">{TYPE_LABEL[tx.type]}</div>
              <div className="activity-row__sub">
                {STATUS_LABEL[tx.status]} · {new Date(tx.createdAt).toLocaleString()}
              </div>
              {tx.detail ? <div className="activity-row__detail">{tx.detail}</div> : null}
            </div>
            <div className="activity-row__amount">{formatActivityAmount(tx.type, tx.amount)}</div>
          </div>
          );
        })}
      </section>
    </>
  );
}
