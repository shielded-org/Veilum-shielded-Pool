import { Link } from "react-router-dom";

import { RevealItem, ScrollReveal } from "../ui/ScrollReveal";
import { LandingSteps } from "../ui/LandingSteps";
import { IconLock, IconUploadCloud } from "../ui/icons";
import { STABLE_CATALOG, type StableSymbol } from "../../lib/tokens";

const ASSETS = ["USDC", "EURC", "YLDS", "MGUSD"] as const satisfies readonly StableSymbol[];

const FAQ = [
  {
    q: "What can other people see when I add money?",
    a: "Your wallet address and how much you deposited. Adding funds is a normal Stellar payment — that part is public by design, so you always know exactly what shows up on the ledger.",
  },
  {
    q: "What stays private when I send to someone?",
    a: "Who sent it, who received it, and how much moved. The payment is verified without exposing those details to the public blockchain.",
  },
  {
    q: "Do I need to set anything up to send privately?",
    a: "Just connect your wallet and open the dashboard. Veilum handles the technical work behind the scenes so you can focus on sending.",
  },
  {
    q: "Where are my keys kept?",
    a: "On your device, in your browser. You approve a one-time message from your wallet to unlock your private balance — nothing is stored on our servers.",
  },
] as const;

export function LandingTrustBar() {
  return (
    <div className="landing-trust" aria-label="Built on">
      <span>Built on Stellar</span>
      <span className="landing-trust__dot" aria-hidden />
      <span>Cryptographically verified</span>
      <span className="landing-trust__dot" aria-hidden />
      <span>USDC &amp; stablecoins</span>
    </div>
  );
}

export function LandingPrivacySection() {
  return (
    <section className="landing-section landing-section--alt">
      <ScrollReveal as="div" className="landing-section__head">
        <h2>Privacy you can see, not guess</h2>
        <p className="landing-section__lead">
          Every action tells you what is public and what stays between you and the recipient. No fine print.
        </p>
      </ScrollReveal>
      <div className="landing-compare">
        <RevealItem as="article" className="landing-compare__card landing-compare__card--pub" index={0}>
          <span className="landing-compare__tag">Regular Stellar payment</span>
          <ul>
            <li>✗ Sender visible to everyone</li>
            <li>✗ Recipient visible to everyone</li>
            <li>✗ Amount visible to everyone</li>
            <li>✗ Easy to trace payment history</li>
          </ul>
        </RevealItem>
        <RevealItem as="article" className="landing-compare__card landing-compare__card--pri" index={1}>
          <span className="landing-compare__tag">
            <IconLock size={14} /> Veilum private payment
          </span>
          <ul>
            <li>✓ Sender not linked to the transaction</li>
            <li>✓ Recipient address hidden</li>
            <li>✓ Amount kept confidential</li>
            <li>✓ Still verified as valid on-chain</li>
          </ul>
        </RevealItem>
      </div>
      <ScrollReveal as="p" className="landing-compare__note" variant="fade" delay={120}>
        Adding and withdrawing funds works like any Stellar transfer. Private sends hide what happens in between.
      </ScrollReveal>
    </section>
  );
}

export function LandingFlowSection() {
  const steps = [
    { label: "Connect your wallet", detail: "Freighter, xBull, Albedo, or Lobstr" },
    { label: "Unlock your private balance", detail: "One quick approval — keys stay on your device" },
    { label: "Add stablecoins", detail: "Move USDC or other stables into your private balance" },
    { label: "Pay someone privately", detail: "Share your receive address — they paste it to send" },
    { label: "Withdraw anytime", detail: "Cash out to any Stellar wallet you choose" },
  ];

  return (
    <section className="landing-section">
      <ScrollReveal as="div" className="landing-section__head">
        <h2>From your wallet to a private payment</h2>
        <p className="landing-section__lead">Five steps. Same flow on testnet today and mainnet when we launch.</p>
      </ScrollReveal>
      <ol className="landing-flow">
        {steps.map((step, i) => (
          <RevealItem key={step.label} as="li" className="landing-flow__step" index={i}>
            <span className="landing-flow__num" aria-hidden>
              {String(i + 1).padStart(2, "0")}
            </span>
            <div>
              <strong>{step.label}</strong>
              <p>{step.detail}</p>
            </div>
          </RevealItem>
        ))}
      </ol>
      <ScrollReveal as="div" className="landing-section__cta" variant="fade" delay={80}>
        <Link to="/about" className="btn btn-secondary">
          About Veilum
        </Link>
      </ScrollReveal>
    </section>
  );
}

export function LandingStepsSection() {
  return (
    <section className="landing-section landing-section--alt">
      <ScrollReveal as="div" className="landing-section__head">
        <h2>Three things you can do</h2>
        <p className="landing-section__lead">Add funds, pay privately, or withdraw — each with clear rules about what others can see.</p>
      </ScrollReveal>
      <LandingSteps />
    </section>
  );
}

export function LandingAssetsSection() {
  return (
    <section className="landing-section">
      <div className="landing-split">
        <RevealItem index={0}>
          <h2>Hold the stablecoins you already use</h2>
          <p className="landing-section__lead">
            USDC, EURC, and other Stellar stables — each kept separate so you always know what you hold.
          </p>
          <div className="landing-assets">
            {ASSETS.map((sym) => (
              <span key={sym} className="landing-assets__pill" title={STABLE_CATALOG[sym].name}>
                {STABLE_CATALOG[sym].name}
                <span className="landing-assets__sym">{sym}</span>
              </span>
            ))}
          </div>
        </RevealItem>
        <RevealItem as="div" className="landing-tech card" index={1}>
          <h3>Built to be trustworthy</h3>
          <ul className="landing-tech__list">
            <li>
              <IconUploadCloud size={16} /> Every payment checked on-chain before it counts
            </li>
            <li>
              <IconLock size={16} /> Balances encrypted — only you can read them
            </li>
            <li>Each coin tracked separately in one shared pool</li>
            <li>Spent balances can&apos;t be used twice</li>
            <li>Works with standard Stellar wallets</li>
          </ul>
        </RevealItem>
      </div>
    </section>
  );
}

export function LandingFaqSection() {
  return (
    <section className="landing-section landing-section--alt landing-faq-section">
      <ScrollReveal as="div" className="landing-section__head landing-section__head--left">
        <h2>Frequently asked questions</h2>
      </ScrollReveal>
      <div className="landing-faq">
        {FAQ.map(({ q, a }, i) => (
          <RevealItem key={q} as="details" className="landing-faq__item" index={i} variant="fade">
            <summary>{q}</summary>
            <p>{a}</p>
          </RevealItem>
        ))}
      </div>
    </section>
  );
}

export function LandingCtaSection() {
  return (
    <ScrollReveal className="landing-cta">
      <div className="landing-cta__inner">
        <h2>Try your first private payment</h2>
        <p>Connect on testnet, grab some play money from the faucet, and send a payment only you and the recipient can see.</p>
        <div className="landing-actions">
          <Link to="/dashboard" className="btn btn-primary btn-lg">
            Open Dashboard
          </Link>
          <Link to="/about" className="btn btn-secondary btn-lg">
            Learn more
          </Link>
        </div>
      </div>
    </ScrollReveal>
  );
}
