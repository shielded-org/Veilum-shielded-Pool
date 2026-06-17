import { IconArrowRightCircle, IconDownloadCloud, IconLock, IconUploadCloud } from "./icons";

const STEPS = [
  {
    icon: IconUploadCloud,
    title: "Shield",
    body: "Deposit public stablecoins into the Veilum pool. Visible on-chain by design.",
  },
  {
    icon: IconLock,
    title: "Send privately",
    body: "Transfer shielded value with ZK proofs. Amount and recipient stay encrypted.",
  },
  {
    icon: IconDownloadCloud,
    title: "Withdraw",
    body: "Unshield to any Stellar address. Remaining change can stay private.",
  },
] as const;

export function LandingSteps() {
  return (
    <div className="landing-steps">
      {STEPS.map(({ icon: Icon, title, body }) => (
        <article key={title} className="landing-step">
          <div className="landing-step__icon" aria-hidden>
            <Icon size={20} />
          </div>
          <h3>{title}</h3>
          <p>{body}</p>
        </article>
      ))}
    </div>
  );
}
