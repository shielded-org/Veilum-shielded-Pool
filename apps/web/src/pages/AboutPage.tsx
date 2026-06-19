import { Link } from "react-router-dom";

import { RevealItem, ScrollReveal } from "../components/ui/ScrollReveal";
import { IconLock, IconUploadCloud, IconDownloadCloud } from "../components/ui/icons";

const BOUNDARIES = [
  {
    icon: IconUploadCloud,
    title: "Adding funds",
    detail: "Your wallet address and the amount you deposit are visible on Stellar — the same as any transfer.",
    tone: "public" as const,
  },
  {
    icon: IconLock,
    title: "Private payments",
    detail: "Who paid whom and how much stays hidden. The network still confirms the payment is valid.",
    tone: "private" as const,
  },
  {
    icon: IconDownloadCloud,
    title: "Withdrawing",
    detail: "The destination address and amount you withdraw are public. Anything you leave behind can stay private.",
    tone: "public" as const,
  },
];

const BUILT = [
  "Hold USDC and other stablecoins in a private balance",
  "Send payments without exposing sender, recipient, or amount",
  "Withdraw part of a balance and keep the rest private",
  "Receive payments with a shareable address — no account setup for the sender",
  "Keys stay on your device; we never see them",
];

export function AboutPage() {
  return (
    <div className="content-page">
      <ScrollReveal className="content-page__hero" as="header" immediate variant="up">
        <h1>About Veilum</h1>
        <p className="content-page__lead">
          Veilum brings private stablecoin payments to Stellar. Use the coins you already trust — with control
          over who can see what you send and receive.
        </p>
      </ScrollReveal>

      <div className="content-grid">
        <RevealItem as="article" className="card content-card" index={0}>
          <h2>What you get</h2>
          <ul className="content-list">
            {BUILT.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
        </RevealItem>

        <RevealItem as="article" className="card content-card" index={1}>
          <h2>What others can see</h2>
          <div className="content-boundaries">
            {BOUNDARIES.map(({ icon: Icon, title, detail, tone }) => (
              <div key={title} className={`content-boundary content-boundary--${tone}`}>
                <span className="content-boundary__icon" aria-hidden>
                  <Icon size={18} />
                </span>
                <div>
                  <strong>{title}</strong>
                  <p>{detail}</p>
                </div>
              </div>
            ))}
          </div>
        </RevealItem>
      </div>

      <ScrollReveal as="article" className="card content-card content-card--wide" variant="up">
        <h2>How it works behind the scenes</h2>
        <div className="content-arch">
          <div>
            <h3>On Stellar</h3>
            <p>
              Your balances live in a shared pool on the Stellar network. Every private payment is checked
              before it is accepted — so you are not relying on blind trust.
            </p>
          </div>
          <div>
            <h3>On your device</h3>
            <p>
              Your browser prepares and encrypts payments locally. Sensitive details never pass through our
              servers.
            </p>
          </div>
          <div>
            <h3>Your keys</h3>
            <p>
              Unlocked with a one-time approval from your wallet. They never leave your browser and are never
              stored by Veilum.
            </p>
          </div>
        </div>
        <p className="content-footnote">
          Veilum is live on Stellar testnet today. Private sends are submitted on your behalf so your wallet
          is not publicly linked to every payment.{" "}
          <Link to="/how-to-use">See the step-by-step guide →</Link>
        </p>
      </ScrollReveal>
    </div>
  );
}
