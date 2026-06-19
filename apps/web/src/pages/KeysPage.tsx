import { useMemo, useState } from "react";

import { CopyableField } from "../components/ui/CopyableField";
import { FormAsideList, FormAsidePanel, FormPageLayout } from "../components/ui/FormPageLayout";
import { useWallet } from "../hooks/use-wallet";
import { stellarExpertAccountUrl } from "../lib/explorer";
import { encodeShieldedAddress } from "../lib/shielded-address";
import { toHex32 } from "../lib/utils";
import { useShieldedStore } from "../store/use-shielded-store";

export function KeysPage() {
  const { address: wallet } = useWallet();
  const spendingKey = useShieldedStore((s) => s.spendingKey);
  const viewingKey = useShieldedStore((s) => s.viewingKey);
  const viewingPub = useShieldedStore((s) => s.viewingPub);
  const ownerPk = useShieldedStore((s) => s.ownerPk);
  const network = useShieldedStore((s) => s.network);
  const [revealKeys, setRevealKeys] = useState(false);
  const [pendingReveal, setPendingReveal] = useState(false);

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

  const hasKeys = !!(spendingKey && viewingKey && viewingPub && ownerPk);

  const walletExplorerUrl = wallet ? stellarExpertAccountUrl(network, wallet) : null;

  function handleRevealToggle() {
    if (revealKeys) {
      setRevealKeys(false);
      setPendingReveal(false);
      return;
    }
    setPendingReveal(true);
  }

  function confirmReveal() {
    setRevealKeys(true);
    setPendingReveal(false);
  }

  function cancelReveal() {
    setPendingReveal(false);
  }

  return (
    <FormPageLayout
      aside={
        <div className="form-layout__aside">
          <FormAsidePanel title="Sharing safely">
            <FormAsideList
              items={[
                {
                  term: "Share only shd_ address",
                  detail: "Safe to give senders — routes encrypted notes to you.",
                },
                {
                  term: "Never share private keys",
                  detail: "Viewing and spending keys control your shielded funds.",
                },
                {
                  term: "Same network",
                  detail: "Address includes network id — must match sender's dashboard.",
                },
              ]}
            />
          </FormAsidePanel>
        </div>
      }
    >
      <div className="card form-card keys-form">
        {!hasKeys && wallet ? (
          <p className="alert-banner alert-banner--warn">
            Keys not loaded — connect your wallet and approve the one-time key derivation signature.
          </p>
        ) : null}

        <p className="form-notice form-notice--private">
          <span className="form-notice__label">Private receive address</span>
          Share only your <code>shd_…</code> address with senders. Never share viewing or spending
          private keys — they control your shielded funds.
        </p>

        <section className="keys-section">
          <h3 className="keys-section__heading">Receive address</h3>
          <CopyableField
            id="shielded-receive"
            label="Shielded receive address"
            value={shieldedAddress}
            prominent
            hint="Paste this on the Transfer page. Format: shd_ + base64url(owner PK, viewing pub, network id)."
          />
        </section>

        <section className="keys-section">
          <h3 className="keys-section__heading">Public identity</h3>
          <p className="keys-section__lead">
            Your Stellar wallet and shielded public keys derived from it.
          </p>
          <div className="keys-section__fields">
            <CopyableField
              id="stellar-wallet"
              label="Stellar wallet address"
              value={wallet ?? ""}
              footerLink={
                walletExplorerUrl
                  ? { href: walletExplorerUrl, label: "View on Stellar Expert →" }
                  : undefined
              }
            />
            <CopyableField
              id="viewing-pub"
              label="Viewing public key"
              value={viewingPub ?? ""}
              hint="Used to identify incoming encrypted notes."
            />
            <CopyableField
              id="owner-pk"
              label="Owner PK (shielded identity)"
              value={ownerPk ?? ""}
              hint="Commitment anchor for your shielded notes."
            />
          </div>
        </section>

        <section className="keys-section keys-section--sensitive">
          <div className="keys-section__head-row">
            <div>
              <h3 className="keys-section__heading">Private keys</h3>
              <p className="keys-section__lead">Never share these — they control decryption and spending.</p>
            </div>
            <label className="keys-reveal-toggle">
              <input type="checkbox" checked={revealKeys} onChange={handleRevealToggle} />
              Reveal private keys
            </label>
          </div>

          {pendingReveal ? (
            <div className="key-reveal-confirm" role="alertdialog" aria-labelledby="reveal-title">
              <p id="reveal-title">
                <strong>Reveal sensitive keys?</strong> Your viewing and spending private keys will be
                shown on screen. Never share these with anyone — they control your shielded funds.
              </p>
              <div className="key-reveal-confirm__actions">
                <button type="button" className="btn btn-danger btn-sm" onClick={confirmReveal}>
                  Yes, reveal keys
                </button>
                <button type="button" className="btn btn-secondary btn-sm" onClick={cancelReveal}>
                  Cancel
                </button>
              </div>
            </div>
          ) : null}

          <div className="keys-section__fields">
            <CopyableField
              id="viewing-priv"
              label="Viewing private key"
              value={viewingPrivHex}
              masked={!revealKeys}
              sensitive
              hint="Decrypts incoming route events and notes."
            />
            <CopyableField
              id="spending-priv"
              label="Spending private key"
              value={spendingHex}
              masked={!revealKeys}
              sensitive
              hint="Authorizes transfers and withdrawals from the pool."
            />
          </div>
        </section>
      </div>
    </FormPageLayout>
  );
}
