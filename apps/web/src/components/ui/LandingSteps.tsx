import { RevealItem } from "./ScrollReveal";
import { IconArrowRightCircle, IconDownloadCloud, IconLock, IconUploadCloud } from "./icons";

const STEPS = [
  {
    icon: IconUploadCloud,
    title: "Add funds",
    body: "Move stablecoins from your wallet into Veilum. This step is public — like any normal deposit.",
  },
  {
    icon: IconLock,
    title: "Send privately",
    body: "Pay someone without broadcasting who sent what to whom. Only you and the recipient see the details.",
  },
  {
    icon: IconDownloadCloud,
    title: "Withdraw",
    body: "Move money back to any Stellar address. Leftover balance can stay private if you don't withdraw it all.",
  },
] as const;

export function LandingSteps() {
  return (
    <div className="landing-steps">
      {STEPS.map(({ icon: Icon, title, body }, i) => (
        <RevealItem key={title} as="article" className="landing-step" index={i}>
          <div className="landing-step__icon" aria-hidden>
            <Icon size={20} />
          </div>
          <h3>{title}</h3>
          <p>{body}</p>
        </RevealItem>
      ))}
    </div>
  );
}
