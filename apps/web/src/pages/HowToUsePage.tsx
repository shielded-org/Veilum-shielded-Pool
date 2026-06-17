import { Link } from "react-router-dom";

import { FadeInSection } from "../components/ui/FadeInSection";

const STEPS = [
  {
    title: "Connect wallet",
    detail: "Use Freighter, xBull, Albedo, or Lobstr on Stellar Testnet.",
  },
  {
    title: "Derive shielded keys",
    detail: "Sign the one-time consent — spending and viewing keys stay in your browser.",
  },
  {
    title: "Mint test tokens",
    detail: "Use the Testnet Faucet to mint mock USDC before shielding.",
  },
  {
    title: "Shield / Deposit",
    detail: "Move public tokens into the pool. Your address and amount are visible on-chain.",
  },
  {
    title: "Private transfer",
    detail: "Paste the recipient's shd_… address. Relayer submits the ZK proof.",
  },
  {
    title: "Withdraw / Unshield",
    detail: "Exit to any G… address. Recipient and amount are public; change stays private.",
  },
  {
    title: "Scan notes",
    detail: "Notes page decrypts route events so you can track balances and commitments.",
  },
];

const REQUIREMENTS = [
  {
    term: "Relayer",
    detail: "Running at http://127.0.0.1:8787 or set VITE_RELAYER_URL",
  },
  {
    term: "Contracts",
    detail: "Deployed addresses in public/deployment.json",
  },
  {
    term: "Browser",
    detail: "SharedArrayBuffer support (COOP/COEP headers in dev server)",
  },
];

export function HowToUsePage() {
  return (
    <FadeInSection className="content-page">
      <header className="content-page__hero">
        <h1>How to use Veilum</h1>
        <p className="content-page__lead">
          Seven steps from wallet connect to your first private transfer on Stellar testnet.
        </p>
        <Link to="/dashboard" className="btn btn-primary">
          Open Dashboard
        </Link>
      </header>

      <ol className="guide-steps">
        {STEPS.map((step, i) => (
          <li key={step.title} className="guide-step card">
            <span className="guide-step__num">{i + 1}</span>
            <div>
              <strong>{step.title}</strong>
              <p>{step.detail}</p>
            </div>
          </li>
        ))}
      </ol>

      <article className="card content-card content-card--wide">
        <h2>Requirements</h2>
        <dl className="form-aside__list form-aside__list--inline">
          {REQUIREMENTS.map(({ term, detail }) => (
            <div key={term}>
              <dt>{term}</dt>
              <dd>{detail}</dd>
            </div>
          ))}
        </dl>
        <p className="content-footnote">
          Need protocol context? See the <Link to="/about">About page</Link> for privacy boundaries and
          architecture.
        </p>
      </article>
    </FadeInSection>
  );
}
