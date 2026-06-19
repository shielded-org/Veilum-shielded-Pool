import { Link } from "react-router-dom";

import { RevealItem, ScrollReveal } from "../components/ui/ScrollReveal";

const STEPS = [
  {
    title: "Connect your wallet",
    detail: "Use Freighter, xBull, Albedo, or Lobstr on Stellar Testnet.",
  },
  {
    title: "Unlock your private balance",
    detail: "Approve one message from your wallet. Your keys stay in the browser — we never see them.",
  },
  {
    title: "Get test tokens",
    detail: "Open the Faucet in the dashboard and mint play-money USDC for testing.",
  },
  {
    title: "Add funds",
    detail: "Move tokens into Veilum. Your address and the amount will show on Stellar, like any deposit.",
  },
  {
    title: "Send a private payment",
    detail: "Paste the recipient's Veilum address from their Keys page. They'll see the payment in their balance.",
  },
  {
    title: "Withdraw to your wallet",
    detail: "Cash out to any Stellar address. The withdrawal is public; leftover balance can stay private.",
  },
  {
    title: "Check your balance",
    detail: "The Notes page shows everything you've received. Refresh anytime to pick up new payments.",
  },
];

const BEFORE_YOU_START = [
  {
    term: "A Stellar wallet",
    detail: "Freighter or another supported wallet on Testnet",
  },
  {
    term: "Testnet tokens",
    detail: "Free from the in-app Faucet — no real money needed",
  },
  {
    term: "A modern browser",
    detail: "Chrome, Firefox, Safari, or Edge — latest version recommended",
  },
];

export function HowToUsePage() {
  return (
    <div className="content-page">
      <ScrollReveal className="content-page__hero" as="header" immediate variant="up">
        <h1>How to use Veilum</h1>
        <p className="content-page__lead">
          Seven steps from connecting your wallet to sending a payment only you and the recipient can see.
        </p>
        <Link to="/dashboard" className="btn btn-primary">
          Open Dashboard
        </Link>
      </ScrollReveal>

      <ol className="guide-steps">
        {STEPS.map((step, i) => (
          <RevealItem key={step.title} as="li" className="guide-step card" index={i}>
            <span className="guide-step__num">{i + 1}</span>
            <div>
              <strong>{step.title}</strong>
              <p>{step.detail}</p>
            </div>
          </RevealItem>
        ))}
      </ol>

      <ScrollReveal as="article" className="card content-card content-card--wide" variant="up">
        <h2>Before you start</h2>
        <dl className="form-aside__list form-aside__list--inline">
          {BEFORE_YOU_START.map(({ term, detail }) => (
            <div key={term}>
              <dt>{term}</dt>
              <dd>{detail}</dd>
            </div>
          ))}
        </dl>
        <p className="content-footnote">
          Want the bigger picture? Read <Link to="/about">About Veilum</Link> for how privacy works across
          deposits, sends, and withdrawals.
        </p>
      </ScrollReveal>
    </div>
  );
}
