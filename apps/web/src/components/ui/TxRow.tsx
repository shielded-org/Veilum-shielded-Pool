import type { TransactionRecord } from "../../lib/types";
import { humanizeTxDetail } from "../../lib/user-messages";
import { formatTxAmount } from "../../lib/utils";
import { IconArrowRightCircle, IconDownloadCloud, IconUploadCloud } from "./icons";
import { ContractLink } from "./ContractLink";
import { TxLink } from "./TxLink";

type TxRowProps = {
  tx: TransactionRecord;
};

function TypeIcon({ type }: { type: TransactionRecord["type"] }) {
  if (type === "shield") return <IconUploadCloud size={18} />;
  if (type === "unshield") return <IconDownloadCloud size={18} />;
  return <IconArrowRightCircle size={18} />;
}

const TYPE_LABEL: Record<TransactionRecord["type"], string> = {
  shield: "Shield deposit",
  transfer: "Private transfer",
  unshield: "Withdrawal",
};

const STATUS_LABEL: Record<TransactionRecord["status"], string> = {
  confirmed: "Confirmed",
  pending: "Pending",
  failed: "Failed",
};

export function TxRow({ tx }: TxRowProps) {
  const detail =
    tx.status === "failed" && tx.detail ? humanizeTxDetail(tx.detail) : null;

  return (
    <tr className="tx-row">
      <td>
        <span className="tx-row__type">
          <TypeIcon type={tx.type} />
        </span>
      </td>
      <td className="tx-row__desc">
        <span className="tx-row__title">{TYPE_LABEL[tx.type]}</span>
        {detail ? (
          <span className="tx-row__detail mono" title={tx.detail}>
            {detail}
          </span>
        ) : null}
      </td>
      <td className="tx-row__amount mono">{formatTxAmount(tx.amount)}</td>
      <td className="tx-row__status">
        <span className={`status-pill status-pill--${tx.status}`}>
          <span className="status-pill__icon" aria-hidden>
            {tx.status === "confirmed" ? "✓" : tx.status === "failed" ? "✗" : "…"}
          </span>
          {STATUS_LABEL[tx.status]}
        </span>
      </td>
      <td className="tx-row__hash mono">
        {tx.txHash ? (
          <TxLink txHash={tx.txHash} shorten={3} />
        ) : tx.contractId ? (
          <ContractLink contractId={tx.contractId} label="contract" />
        ) : (
          "—"
        )}
      </td>
    </tr>
  );
}
