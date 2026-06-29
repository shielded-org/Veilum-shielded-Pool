import { useMemo, useState } from "react";

import { Button } from "../components/ui/Button";
import { CopyField } from "../components/ui/CopyField";
import { getShieldedReceiveAddress } from "../lib/wallet-session";
import { encodeShieldedAddress } from "../lib/shielded-address";
import { toHex32 } from "../lib/utils";
import { useShieldedStore } from "../store/use-shielded-store";
import { findAccountByPublicKey, readMnemonic, unlockAccount } from "../vault/storage";
import type { NetworkName } from "../lib/types";

type KeysScreenProps = {
  wallet: string;
  network: NetworkName;
};

export function KeysScreen({ wallet, network }: KeysScreenProps) {
  const spendingKey = useShieldedStore((s) => s.spendingKey);
  const viewingKey = useShieldedStore((s) => s.viewingKey);
  const viewingPub = useShieldedStore((s) => s.viewingPub);
  const ownerPk = useShieldedStore((s) => s.ownerPk);

  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [revealed, setRevealed] = useState(false);
  const [pendingReveal, setPendingReveal] = useState(false);
  const [secretKey, setSecretKey] = useState<string | null>(null);
  const [mnemonic, setMnemonic] = useState<string | null>(null);

  const shieldedAddress = useMemo(() => {
    if (!viewingPub || !ownerPk) return "";
    try {
      return encodeShieldedAddress({ ownerPk, viewingPub, network });
    } catch {
      return getShieldedReceiveAddress(network, ownerPk, viewingPub);
    }
  }, [viewingPub, ownerPk, network]);

  const spendingHex = spendingKey ? toHex32(BigInt(spendingKey)) : "";
  const viewingPrivHex = viewingKey ? toHex32(BigInt(viewingKey)) : "";
  const hasShieldKeys = !!(spendingKey && viewingKey && viewingPub && ownerPk);

  async function unlockSecrets() {
    setError(null);
    setLoading(true);
    try {
      const account = await findAccountByPublicKey(wallet);
      if (!account) throw new Error("Account not found in vault");
      const keypair = await unlockAccount(account.id, password);
      if (keypair.publicKey() !== wallet) throw new Error("Vault account mismatch");
      setSecretKey(keypair.secret());
      const phrase = await readMnemonic(password);
      setMnemonic(phrase);
      setRevealed(true);
      setPendingReveal(false);
      setPassword("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not unlock secrets");
    } finally {
      setLoading(false);
    }
  }

  function hideSecrets() {
    setRevealed(false);
    setPendingReveal(false);
    setSecretKey(null);
    setMnemonic(null);
    setPassword("");
    setError(null);
  }

  return (
    <>
      <h2 className="screen-title">Keys & backup</h2>
      <p className="screen-lead">
        Your Stellar and shielded identities. Share only your shielded receive address with senders.
      </p>

      {!hasShieldKeys ? (
        <p className="alert-banner alert-banner--warn">Shielded keys are not loaded for this session.</p>
      ) : null}

      <section className="keys-section">
        <h3 className="keys-section__heading">Receive</h3>
        <CopyField
          id="keys-shielded"
          label="Shielded address"
          value={shieldedAddress}
          hint="Safe to share — routes private payments to you."
        />
      </section>

      <section className="keys-section">
        <h3 className="keys-section__heading">Public identity</h3>
        <CopyField id="keys-wallet" label="Stellar address" value={wallet} />
        <CopyField
          id="keys-viewing-pub"
          label="Viewing public key"
          value={viewingPub ?? ""}
          hint="Identifies incoming encrypted notes."
        />
        <CopyField
          id="keys-owner-pk"
          label="Owner PK"
          value={ownerPk ?? ""}
          hint="Shielded identity anchor for your notes."
        />
      </section>

      <section className="keys-section keys-section--sensitive">
        <h3 className="keys-section__heading">Private keys</h3>
        <p className="text-subtle">Never share these — they control your shielded funds.</p>

        {!revealed ? (
          pendingReveal ? (
            <div className="key-reveal-confirm">
              <p>
                <strong>Reveal sensitive material?</strong> Your Stellar secret, recovery phrase, and shielded
                private keys will appear on screen. Only continue in a private place.
              </p>
              <div className="field">
                <label htmlFor="keys-password">Wallet password</label>
                <input
                  id="keys-password"
                  type="password"
                  autoComplete="current-password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                />
              </div>
              {error ? <p className="alert-banner alert-banner--error">{error}</p> : null}
              <div className="wallet-dialog__actions">
                <Button variant="danger" loading={loading} onClick={() => void unlockSecrets()}>
                  Reveal keys
                </Button>
                <Button variant="secondary" onClick={() => setPendingReveal(false)}>
                  Cancel
                </Button>
              </div>
            </div>
          ) : (
            <Button variant="secondary" fullWidth onClick={() => setPendingReveal(true)}>
              Reveal secret key & recovery phrase
            </Button>
          )
        ) : (
          <>
            <CopyField id="keys-secret" label="Stellar secret key" value={secretKey ?? ""} />
            {mnemonic ? (
              <div className="field">
                <label>Recovery phrase</label>
                <div className="mnemonic-box">{mnemonic}</div>
              </div>
            ) : (
              <p className="text-subtle">No recovery phrase stored for this account (imported via secret key).</p>
            )}
            <CopyField
              id="keys-viewing-priv"
              label="Viewing private key"
              value={viewingPrivHex}
              hint="Decrypts incoming route events."
            />
            <CopyField
              id="keys-spending-priv"
              label="Spending private key"
              value={spendingHex}
              hint="Authorizes shielded transfers."
            />
            <Button variant="ghost" fullWidth onClick={hideSecrets}>
              Hide sensitive keys
            </Button>
          </>
        )}
      </section>
    </>
  );
}
