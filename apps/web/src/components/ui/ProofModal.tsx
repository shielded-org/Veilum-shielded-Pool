const STEPS = [
  { match: /merkle/i, label: "Syncing merkle tree…", progress: 20 },
  { match: /circuit|input|path|building/i, label: "Building circuit inputs…", progress: 40 },
  { match: /proof|generat|noir|ultrahonk|honk/i, label: "Generating zero-knowledge proof…", progress: 65 },
  { match: /relay|submit|send/i, label: "Submitting to relayer…", progress: 85 },
  { match: /refresh|confirm|wait|balanc/i, label: "Finalizing transaction…", progress: 95 },
] as const;

function resolveStep(message: string) {
  const m = message || "";
  for (const step of STEPS) {
    if (step.match.test(m)) return step;
  }
  if (m.toLowerCase().includes("proof")) return STEPS[2];
  return { label: m || "Working…", progress: 30 };
}

type ProofModalProps = {
  message: string;
};

export function ProofModal({ message }: ProofModalProps) {
  const step = resolveStep(message);
  const isProof = step.label.toLowerCase().includes("zero-knowledge");

  return (
    <div className="proof-overlay" role="dialog" aria-modal="true" aria-labelledby="proof-modal-title">
      <div className="proof-modal">
        <div className="proof-modal__icon-wrap">
          <div className={`proof-modal__icon ${isProof ? "proof-modal__icon--spin" : ""}`}>
            <svg width="32" height="32" viewBox="0 0 32 32" fill="none" aria-hidden>
              <path d="M16 4 26 10v12L16 28 6 22V10L16 4Z" stroke="currentColor" strokeWidth="1.5" />
              <path d="M16 4v24M6 10l10 6 10-6" stroke="currentColor" strokeWidth="1.5" opacity="0.5" />
            </svg>
          </div>
        </div>
        <h3 id="proof-modal-title" className="proof-modal__title">
          {isProof ? "Generating proof" : "Working…"}
        </h3>
        <p className="proof-modal__step" key={step.label}>
          {step.label}
        </p>
        <div className="proof-modal__track" role="progressbar" aria-valuenow={step.progress} aria-valuemin={0} aria-valuemax={100}>
          <div className="proof-modal__fill" style={{ transform: `scaleX(${step.progress / 100})` }} />
        </div>
        <p className="proof-modal__hint">Usually 30–90 seconds. Don&apos;t close this tab.</p>
      </div>
    </div>
  );
}
