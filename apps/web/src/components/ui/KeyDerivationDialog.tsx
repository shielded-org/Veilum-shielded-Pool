import { motion, AnimatePresence } from "framer-motion";

import { IconSpinner, IconVeilumMark } from "./icons";

type KeyDerivationDialogProps = {
  open: boolean;
  busy: boolean;
  error?: string | null;
  onProceed: () => void;
  onCancel: () => void;
};

const STEPS = [
  { label: "Connect wallet", done: true },
  { label: "Unlock balance", done: false, current: true },
  { label: "Open dashboard", done: false },
] as const;

export function KeyDerivationDialog({
  open,
  busy,
  error,
  onProceed,
  onCancel,
}: KeyDerivationDialogProps) {
  return (
    <AnimatePresence>
      {open ? (
        <motion.div
          className="onboarding-overlay"
          role="dialog"
          aria-modal="true"
          aria-labelledby="onboarding-title"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
        >
          <motion.div
            className="onboarding-dialog"
            initial={{ opacity: 0, y: 16, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 8, scale: 0.98 }}
            transition={{ duration: 0.22 }}
          >
            <div className="onboarding-dialog__head">
              <span className="onboarding-dialog__mark" aria-hidden>
                <IconVeilumMark size={22} />
              </span>
              <div>
                <p className="onboarding-dialog__eyebrow">Step 2 of 3</p>
                <h2 id="onboarding-title" className="onboarding-dialog__title">
                  Unlock your private balance
                </h2>
              </div>
            </div>

            <ol className="onboarding-steps" aria-label="Getting started">
              {STEPS.map((step) => (
                <li
                  key={step.label}
                  className={
                    "current" in step && step.current
                      ? "onboarding-steps__item onboarding-steps__item--current"
                      : step.done
                        ? "onboarding-steps__item onboarding-steps__item--done"
                        : "onboarding-steps__item"
                  }
                >
                  <span className="onboarding-steps__dot" aria-hidden />
                  <span>{step.label}</span>
                </li>
              ))}
            </ol>

            <p className="onboarding-dialog__lead">
              Signature required. Veilum uses it once, on your
              device, to set up the keys that power your shielded balance.
            </p>

            <div className="onboarding-trust">
              <div className="onboarding-trust__item">
                <span className="onboarding-trust__icon" aria-hidden>✓</span>
                <span>Keys never leave your browser</span>
              </div>
              <div className="onboarding-trust__item">
                <span className="onboarding-trust__icon" aria-hidden>✓</span>
                <span>No transaction · no fees</span>
              </div>
              <div className="onboarding-trust__item">
                <span className="onboarding-trust__icon" aria-hidden>✓</span>
                <span>Same step every time you use Veilum</span>
              </div>
            </div>

            <details className="onboarding-details">
              <summary>What will my wallet show?</summary>
              <p>
                A short consent message confirming you want Veilum to derive your private payment
                keys. It does not move funds or approve a transfer.
              </p>
            </details>

            {error ? <p className="badge err onboarding-dialog__error">{error}</p> : null}

            <div className="onboarding-dialog__actions">
              <button type="button" className="btn btn-secondary" onClick={onCancel} disabled={busy}>
                Not now
              </button>
              <button type="button" className="btn btn-primary" onClick={onProceed} disabled={busy}>
                {busy ? (
                  <>
                    <IconSpinner size={16} /> Waiting in wallet…
                  </>
                ) : (
                  "Sign message"
                )}
              </button>
            </div>
          </motion.div>
        </motion.div>
      ) : null}
    </AnimatePresence>
  );
}
