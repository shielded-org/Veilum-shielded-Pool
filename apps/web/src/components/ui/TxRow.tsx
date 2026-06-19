import type { TransactionRecord } from "../../lib/types";
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

export function TxRow({ tx }: TxRowProps) {
  return (
    <tr className="tx-row">
      <td>
        <span className="tx-row__type">
          <TypeIcon type={tx.type} />
        </span>
      </td>
      <td className="tx-row__desc">
        {TYPE_LABEL[tx.type]}
        {tx.status === "failed" && tx.detail ? (
          <span className="tx-row__detail" title={tx.detail}>
            {" "}
            — {tx.detail}
          </span>
        ) : null}
      </td>
      <td className="tx-row__amount">{tx.amount}</td>
      <td>
        <span className={`status-pill status-pill--${tx.status}`}>{tx.status}</span>
      </td>
      <td className="tx-row__hash">
        {tx.txHash ? (
          <TxLink txHash={tx.txHash} />
        ) : tx.contractId ? (
          <ContractLink contractId={tx.contractId} label="contract" />
        ) : (
          "—"
        )}
      </td>
    </tr>
  );
}
