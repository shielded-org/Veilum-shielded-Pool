import { useState } from "react";

import { shortenAddress } from "../lib/utils";

type AddressPillProps = {
  address: string;
  disabled?: boolean;
};

export function AddressPill({ address, disabled }: AddressPillProps) {
  const [copied, setCopied] = useState(false);

  if (!address) return null;

  return (
    <button
      type="button"
      className="address-pill"
      disabled={disabled}
      title={address}
      aria-label={`Copy address ${shortenAddress(address, 4)}`}
      onClick={() => {
        void navigator.clipboard.writeText(address).then(() => {
          setCopied(true);
          window.setTimeout(() => setCopied(false), 2000);
        });
      }}
    >
      <span className="address-pill__dot" aria-hidden />
      <span className="address-pill__addr">{copied ? "Copied" : shortenAddress(address, 4)}</span>
    </button>
  );
}
