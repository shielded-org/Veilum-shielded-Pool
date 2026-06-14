import { useMemo, useState } from "react";

import { ConnectWallet } from "../components/ConnectWallet";
import { useWallet } from "../hooks/use-wallet";
import { encodeShieldedAddress } from "../lib/shielded-address";
import { toHex32 } from "../lib/utils";
import { useShieldedStore } from "../store/use-shielded-store";

function KeyField({
  label,
  value,
  masked,
  sensitive,
}: {
  label: string;
  value: string;
  masked: boolean;
  sensitive?: boolean;
}) {
  const [copied, setCopied] = useState(false);
  const display = !value ? "Connect wallet to generate" : masked && sensitive ? "••••••••••••••••" : value;

  async function copy() {
    if (!value || (masked && sensitive)) return;
    await navigator.clipboard.writeText(value);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <div className="field">
      <label>{label}</label>
      <div style={{ display: "flex", gap: 8 }}>
        <textarea readOnly rows={sensitive ? 2 : 1} value={display} style={{ fontFamily: "monospace", fontSize: 13 }} />
        <button
          type="button"
          className="btn btn-secondary"
          disabled={!value || (masked && !!sensitive)}
          onClick={() => void copy()}
        >
          {copied ? "Copied" : "Copy"}
        </button>
      </div>
    </div>
  );
}

export function KeysPage() {
  const { address: wallet } = useWallet();
  const spendingKey = useShieldedStore((s) => s.spendingKey);
  const viewingKey = useShieldedStore((s) => s.viewingKey);
  const viewingPub = useShieldedStore((s) => s.viewingPub);
  const ownerPk = useShieldedStore((s) => s.ownerPk);
  const network = useShieldedStore((s) => s.network);
  const reveal = useShieldedStore((s) => s.revealBalances);
  const setReveal = useShieldedStore((s) => s.setRevealBalances);
  const [copied, setCopied] = useState(false);

  const spendingHex = spendingKey ? toHex32(BigInt(spendingKey)) : "";
  const viewingPrivHex = viewingKey ? toHex32(BigInt(viewingKey)) : "";

  const shieldedAddress = useMemo(() => {
    if (!viewingPub || !ownerPk) return "";
    try {
      return encodeShieldedAddress({ ownerPk, viewingPub, network });
    } catch {
      return "";
    }
  }, [viewingPub, ownerPk, network]);

  async function copyAddress() {
    if (!shieldedAddress) return;
    await navigator.clipboard.writeText(shieldedAddress);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  const hasKeys = !!(spendingKey && viewingKey && viewingPub && ownerPk);

  return (
    <>
      <div className="dashboard-topbar">
        <h1 style={{ margin: 0 }}>Viewing keys</h1>
        <ConnectWallet />
      </div>
      <div className="card">
        <p className="muted">
          Share your <strong>shielded receive address</strong> with senders. They paste one string to
          route encrypted notes to you. Private keys are hidden by default — toggle reveal to copy them.
        </p>

        {!hasKeys && wallet && (
          <p className="badge warn" style={{ marginBottom: 16 }}>
            Keys not loaded — connect your wallet and approve the one-time key derivation signature.
          </p>
        )}

        <div className="field">
          <label>Shielded receive address</label>
          <div style={{ display: "flex", gap: 8 }}>
            <input readOnly value={shieldedAddress || "Connect wallet to generate"} />
            <button
              type="button"
              className="btn btn-secondary"
              disabled={!shieldedAddress}
              onClick={() => void copyAddress()}
            >
              {copied ? "Copied" : "Copy"}
            </button>
          </div>
          <p className="muted" style={{ fontSize: 13, marginTop: 8 }}>
            Format: <code>shd_</code> + base64url(owner PK, viewing pub, network id).
          </p>
        </div>

        <label style={{ display: "flex", alignItems: "center", gap: 8, margin: "16px 0" }}>
          <input type="checkbox" checked={reveal} onChange={(e) => setReveal(e.target.checked)} />
          Reveal private keys
        </label>

        <h3 style={{ marginTop: 24 }}>Account</h3>
        <KeyField label="Stellar wallet address" value={wallet ?? ""} masked={false} />

        <h3 style={{ marginTop: 24 }}>Public keys</h3>
        <KeyField label="Viewing public key" value={viewingPub ?? ""} masked={false} />
        <KeyField label="Owner PK (shielded identity)" value={ownerPk ?? ""} masked={false} />

        <h3 style={{ marginTop: 24 }}>Private keys</h3>
        <p className="muted" style={{ fontSize: 13, marginBottom: 12 }}>
          Never share these. The viewing private key decrypts incoming notes; the spending key authorizes
          transfers and withdrawals.
        </p>
        <KeyField label="Viewing private key" value={viewingPrivHex} masked={!reveal} sensitive />
        <KeyField label="Spending private key" value={spendingHex} masked={!reveal} sensitive />
      </div>
    </>
  );
}
