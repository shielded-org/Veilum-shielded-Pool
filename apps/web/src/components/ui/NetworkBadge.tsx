import type { NetworkName } from "../../lib/types";

const LABELS: Record<NetworkName, string> = {
  local: "Local",
  futurenet: "Futurenet",
  testnet: "Testnet",
  mainnet: "Mainnet",
};

type NetworkBadgeProps = {
  network: NetworkName;
};

export function NetworkBadge({ network }: NetworkBadgeProps) {
  const isMainnet = network === "mainnet";
  return (
    <span className={`network-badge network-badge--${isMainnet ? "mainnet" : "testnet"}`}>
      <span className="network-badge__dot" aria-hidden />
      {LABELS[network]}
    </span>
  );
}
