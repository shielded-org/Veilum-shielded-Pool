import { stellarExpertTxUrl } from "../../lib/explorer";
import { useShieldedStore } from "../../store/use-shielded-store";
import { shortenAddress } from "../../lib/utils";
import { IconExternalLink } from "./icons";

type TxLinkProps = {
  txHash: string;
  shorten?: number;
  className?: string;
};

export function TxLink({ txHash, shorten = 6, className }: TxLinkProps) {
  const network = useShieldedStore((s) => s.network);
  const url = stellarExpertTxUrl(network, txHash);

  if (!url) {
    return <span className={`mono ${className ?? ""}`}>{shortenAddress(txHash, shorten)}</span>;
  }

  return (
    <a
      href={url}
      target="_blank"
      rel="noreferrer noopener"
      className={`tx-row__link ${className ?? ""}`}
      title="View on Stellar Expert"
    >
      {shortenAddress(txHash, shorten)}
      <IconExternalLink />
    </a>
  );
}
