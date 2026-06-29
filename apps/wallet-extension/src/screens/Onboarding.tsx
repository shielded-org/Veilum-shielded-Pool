import { useEffect, useState } from "react";
import { Keypair } from "@stellar/stellar-sdk";

import { Button } from "../components/ui/Button";
import { ResetVaultDialog } from "../components/ResetVaultDialog";
import { VeilumLogo } from "../components/VeilumLogo";
import { IconSpinner, IconVeilumMark } from "../components/ui/icons";
import { setSessionPassword } from "../vault/session";
import {
  clearVault,
  generateMnemonic,
  getLastAccountId,
  hasVault,
  keypairFromMnemonic,
  storeKeypair,
  unlockLastAccount,
} from "../vault/storage";

type OnboardingProps = {
  onUnlocked: (keypair: Keypair, accountId: string) => void;
};

type Step = "checking" | "welcome" | "create" | "import" | "mnemonic" | "fund" | "unlock";

export function Onboarding({ onUnlocked }: OnboardingProps) {
  const [step, setStep] = useState<Step>("checking");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [secretInput, setSecretInput] = useState("");
  const [mnemonic, setMnemonic] = useState("");
  const [mnemonicAck, setMnemonicAck] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [pendingKeypair, setPendingKeypair] = useState<Keypair | null>(null);
  const [resetDialogOpen, setResetDialogOpen] = useState(false);

  useEffect(() => {
    void hasVault().then((exists) => {
      setStep(exists ? "unlock" : "welcome");
    });
  }, []);

  async function handleUnlock(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const unlocked = await unlockLastAccount(password);
      setSessionPassword(password);
      onUnlocked(unlocked.keypair, unlocked.id);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unlock failed");
    } finally {
      setLoading(false);
    }
  }

  async function finishCreate(keypair: Keypair, phrase: string) {
    await storeKeypair(keypair, password, {
      mnemonic: phrase,
      kind: "created",
      derivationIndex: 0,
      name: "Account 1",
    });
    setSessionPassword(password);
    setPendingKeypair(keypair);
    setStep("fund");
  }

  if (step === "checking") {
    return (
      <div className="onboarding-screen onboarding-screen--centered">
        <VeilumLogo size="lg" centered />
        <p className="onboarding-loading">Loading…</p>
      </div>
    );
  }

  if (step === "welcome") {
    return (
      <WelcomeScreen
        onCreate={() => {
          setError(null);
          setStep("create");
        }}
        onImport={() => {
          setError(null);
          setStep("import");
        }}
      />
    );
  }

  if (step === "unlock") {
    return (
      <>
        <WelcomeBackScreen
          password={password}
          error={error}
          loading={loading}
          onPasswordChange={setPassword}
          onSubmit={handleUnlock}
          onResetRequest={() => setResetDialogOpen(true)}
        />
        <ResetVaultDialog
          open={resetDialogOpen}
          onCancel={() => setResetDialogOpen(false)}
          onConfirm={async () => {
            setResetDialogOpen(false);
            setPassword("");
            setError(null);
            await clearVault();
            setStep("welcome");
          }}
        />
      </>
    );
  }

  if (step === "create") {
    return (
      <div className="onboarding-screen">
        <h1>Create wallet</h1>
        <p className="screen-lead">Set a password to encrypt your keys on this device.</p>
        <form
          className="form-stack"
          onSubmit={async (e) => {
            e.preventDefault();
            setError(null);
            if (password.length < 8) {
              setError("Use at least 8 characters");
              return;
            }
            if (password !== confirmPassword) {
              setError("Passwords do not match");
              return;
            }
            try {
              const phrase = await generateMnemonic();
              setMnemonic(phrase);
              setStep("mnemonic");
            } catch (err) {
              setError(err instanceof Error ? err.message : "Could not generate phrase");
            }
          }}
        >
          <div className="field">
            <label htmlFor="create-password">Password</label>
            <input
              id="create-password"
              type="password"
              autoComplete="new-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
            />
          </div>
          <div className="field">
            <label htmlFor="create-confirm">Confirm password</label>
            <input
              id="create-confirm"
              type="password"
              autoComplete="new-password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              required
            />
          </div>
          {error ? <p className="alert-banner alert-banner--error">{error}</p> : null}
          <Button type="submit" fullWidth>
            Continue
          </Button>
          <Button type="button" variant="ghost" fullWidth onClick={() => setStep("welcome")}>
            Back
          </Button>
        </form>
      </div>
    );
  }

  if (step === "mnemonic") {
    return (
      <div className="onboarding-screen">
        <h1>Save recovery phrase</h1>
        <p className="screen-lead">
          Write these 12 words down. They are the only way to recover your Stellar account.
        </p>
        <div className="mnemonic-box">{mnemonic}</div>
        <label className="text-subtle mt-2" style={{ display: "flex", gap: 8, alignItems: "flex-start" }}>
          <input
            type="checkbox"
            checked={mnemonicAck}
            onChange={(e) => setMnemonicAck(e.target.checked)}
          />
          I have saved my recovery phrase in a secure place
        </label>
        <div className="onboarding-actions">
          <Button
            fullWidth
            disabled={!mnemonicAck}
            loading={loading}
            onClick={async () => {
              setLoading(true);
              setError(null);
              try {
                const keypair = await keypairFromMnemonic(mnemonic, 0);
                await finishCreate(keypair, mnemonic);
              } catch (err) {
                setError(err instanceof Error ? err.message : "Could not create wallet");
              } finally {
                setLoading(false);
              }
            }}
          >
            Continue
          </Button>
        </div>
        {error ? <p className="alert-banner alert-banner--error">{error}</p> : null}
      </div>
    );
  }

  if (step === "import") {
    return (
      <div className="onboarding-screen">
        <h1>Import wallet</h1>
        <p className="screen-lead">Paste your Stellar secret key (S…) or 12-word recovery phrase.</p>
        <form
          className="form-stack"
          onSubmit={async (e) => {
            e.preventDefault();
            setError(null);
            if (password.length < 8) {
              setError("Use at least 8 characters");
              return;
            }
            setLoading(true);
            try {
              const trimmed = secretInput.trim();
              let keypair: Keypair;
              if (trimmed.startsWith("S")) {
                keypair = Keypair.fromSecret(trimmed);
              } else {
                keypair = await keypairFromMnemonic(trimmed, 0);
              }
              await storeKeypair(keypair, password, {
                mnemonic: trimmed.includes(" ") ? trimmed : undefined,
                kind: "imported",
                derivationIndex: trimmed.includes(" ") ? 0 : undefined,
                name: trimmed.includes(" ") ? "Account 1" : undefined,
              });
              setSessionPassword(password);
              setPendingKeypair(keypair);
              setStep("fund");
            } catch (err) {
              setError(err instanceof Error ? err.message : "Invalid secret or phrase");
            } finally {
              setLoading(false);
            }
          }}
        >
          <div className="field">
            <label htmlFor="import-secret">Secret key or phrase</label>
            <textarea
              id="import-secret"
              value={secretInput}
              onChange={(e) => setSecretInput(e.target.value)}
              required
            />
          </div>
          <div className="field">
            <label htmlFor="import-password">Password</label>
            <input
              id="import-password"
              type="password"
              autoComplete="new-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
            />
          </div>
          {error ? <p className="alert-banner alert-banner--error">{error}</p> : null}
          <Button type="submit" fullWidth loading={loading}>
            Import wallet
          </Button>
          <Button type="button" variant="ghost" fullWidth onClick={() => setStep("welcome")}>
            Back
          </Button>
        </form>
      </div>
    );
  }

  if (step === "fund" && pendingKeypair) {
    return (
      <FundScreen
        publicKey={pendingKeypair.publicKey()}
        onDone={async () => {
          const lastId = (await getLastAccountId()) ?? "";
          onUnlocked(pendingKeypair, lastId);
        }}
        onSkip={async () => {
          const lastId = (await getLastAccountId()) ?? "";
          onUnlocked(pendingKeypair, lastId);
        }}
      />
    );
  }

  return null;
}

function WelcomeBackScreen({
  password,
  error,
  loading,
  onPasswordChange,
  onSubmit,
  onResetRequest,
}: {
  password: string;
  error: string | null;
  loading: boolean;
  onPasswordChange: (value: string) => void;
  onSubmit: (e: React.FormEvent) => void;
  onResetRequest: () => void;
}) {
  return (
    <div className="onboarding-screen onboarding-screen--welcome-back">
      <button type="button" className="welcome-back__reset" onClick={onResetRequest}>
        Reset
      </button>

      <div className="welcome-back__body">
        <div className="welcome-back__brand">
          <span className="welcome-back__logo" aria-hidden>
            <IconVeilumMark size={44} />
          </span>
          <h1 className="welcome-back__title">Welcome back</h1>
          <p className="welcome-back__lead">Unlock your wallet to continue</p>
        </div>

        <form className="welcome-back__form" onSubmit={onSubmit}>
          <div className="field field--welcome-back">
            <label className="sr-only" htmlFor="unlock-password">
              Password
            </label>
            <input
              id="unlock-password"
              className="welcome-back__input"
              type="password"
              autoComplete="current-password"
              placeholder="Password"
              value={password}
              onChange={(e) => onPasswordChange(e.target.value)}
              autoFocus
              required
            />
          </div>
          {error ? <p className="welcome-back__error">{error}</p> : null}
          <button
            type="submit"
            className="welcome-back__unlock"
            disabled={!password || loading}
            aria-busy={loading}
          >
            {loading ? <IconSpinner size={16} aria-hidden /> : "Unlock"}
          </button>
        </form>
      </div>
    </div>
  );
}

function WelcomeScreen({
  onCreate,
  onImport,
}: {
  onCreate: () => void;
  onImport: () => void;
}) {
  return (
    <div className="onboarding-screen onboarding-screen--centered">
      <div className="welcome-first__hero">
        <VeilumLogo size="lg" centered />
        <p className="welcome-first__lead">
          Shield, send, and receive stablecoins privately on Stellar testnet.
        </p>
        <span className="privacy-pill privacy-pill--private">Private transfers</span>
      </div>
      <div className="onboarding-actions">
        <Button fullWidth onClick={onCreate}>
          Create new wallet
        </Button>
        <Button fullWidth variant="secondary" onClick={onImport}>
          Import wallet
        </Button>
      </div>
    </div>
  );
}

function FundScreen({
  publicKey,
  onDone,
  onSkip,
}: {
  publicKey: string;
  onDone: () => void;
  onSkip: () => void;
}) {
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  return (
    <div className="onboarding-screen">
      <h1>Fund testnet account</h1>
      <p className="screen-lead">
        Your account needs XLM for network fees. Friendbot sends free testnet XLM — this step is{" "}
        <strong>public on-chain</strong>.
      </p>
      <span className="privacy-pill privacy-pill--public">Public · Friendbot</span>
      <p className="mono text-subtle mt-2">{publicKey}</p>
      {message ? <p className="alert-banner alert-banner--info">{message}</p> : null}
      {error ? <p className="alert-banner alert-banner--error">{error}</p> : null}
      <div className="onboarding-actions">
        <Button
          fullWidth
          loading={loading}
          onClick={async () => {
            setLoading(true);
            setError(null);
            try {
              const { fundTestnetAccount } = await import("../lib/wallet-session");
              const hash = await fundTestnetAccount(publicKey, "testnet");
              setMessage(hash ? `Funded — tx ${hash.slice(0, 12)}…` : "Account funded with test XLM");
            } catch (err) {
              setError(err instanceof Error ? err.message : "Friendbot failed");
            } finally {
              setLoading(false);
            }
          }}
        >
          Fund with Friendbot
        </Button>
        <Button fullWidth variant="secondary" onClick={onDone}>
          Continue to wallet
        </Button>
        <Button fullWidth variant="ghost" onClick={onSkip}>
          Skip for now
        </Button>
      </div>
    </div>
  );
}
