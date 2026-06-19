import { stellarExpertContractUrl } from "../../lib/explorer";
import { useShieldedStore } from "../../store/use-shielded-store";
import { shortenAddress } from "../../lib/utils";
import { IconExternalLink } from "./icons";

type ContractLinkProps = {
  contractId: string;
  label?: string;
  shorten?: number;
  className?: string;
};

/** Link to a Soroban contract on Stellar Expert. */
export function ContractLink({
  contractId,
  label,
  shorten = 6,
  className,
}: ContractLinkProps) {
  const network = useShieldedStore((s) => s.network);
  const url = stellarExpertContractUrl(network, contractId);

  const text = label ?? shortenAddress(contractId, shorten);

  if (!url) {
    return <span className={`mono ${className ?? ""}`}>{text}</span>;
  }

  return (
    <a
      href={url}
      target="_blank"
      rel="noreferrer noopener"
      className={`tx-row__link ${className ?? ""}`}
      title="View contract on Stellar Expert"
    >
      {text}
      <IconExternalLink />
    </a>
  );
}
