import { Link } from "react-router-dom";

import { FadeInSection } from "../ui/FadeInSection";
import { LandingSteps } from "../ui/LandingSteps";
import { IconLock, IconUploadCloud } from "../ui/icons";
import { STABLE_CATALOG, type StableSymbol } from "../../lib/tokens";

const ASSETS = ["USDC", "EURC", "YLDS", "MGUSD"] as const satisfies readonly StableSymbol[];

const FAQ = [
  {
    q: "What is visible on-chain when I shield tokens?",
    a: "Your Stellar wallet address and the deposit amount. Shielding is intentionally public — it moves funds from your public balance into the encrypted note pool.",
  },
  {
    q: "What stays private during a transfer?",
    a: "Sender identity, recipient Stellar address, and transfer amount. The relayer submits the transaction so your wallet is not the on-chain signer.",
  },
  {
    q: "Do I need to run a relayer?",
    a: "Private transfers and withdrawals require a relayer on testnet. Shield deposits are signed directly by your wallet. Run npm run dev:relayer locally or point VITE_RELAYER_URL to a hosted instance.",
  },
  {
    q: "Where are my keys stored?",
    a: "Spending and viewing keys are derived locally from a one-time wallet signature. They never leave your browser.",
  },
] as const;

export function LandingTrustBar() {
  return (
    <div className="landing-trust" aria-label="Built on">
      <span>Built on Stellar Soroban</span>
      <span className="landing-trust__dot" aria-hidden />
      <span>UltraHonk verified</span>
      <span className="landing-trust__dot" aria-hidden />
      <span>Poseidon2 Merkle tree</span>
    </div>
  );
}

export function LandingPrivacySection() {
  return (
    <FadeInSection className="landing-section landing-section--alt">
      <div className="landing-section__head">
        <h2>Privacy you can read, not guess</h2>
        <p className="landing-section__lead">
          Veilum separates public rails from private payments. Every action tells you exactly what appears on-chain.
        </p>
      </div>
      <div className="landing-compare">
        <article className="landing-compare__card landing-compare__card--pub">
          <span className="landing-compare__tag">Public Stellar transfer</span>
          <ul>
            <li>Sender address visible</li>
            <li>Recipient address visible</li>
            <li>Amount visible</li>
            <li>Full payment graph linkable</li>
          </ul>
        </article>
        <article className="landing-compare__card landing-compare__card--pri">
          <span className="landing-compare__tag">
            <IconLock size={14} /> Veilum private transfer
          </span>
          <ul>
            <li>Sender wallet not the tx signer</li>
            <li>Recipient Stellar address hidden</li>
            <li>Amount encrypted in note</li>
            <li>ZK proof verified on-chain</li>
          </ul>
        </article>
      </div>
      <p className="landing-compare__note">
        Deposits and withdrawals remain public by design. Private transfers hide value movement between shielded notes.
      </p>
    </FadeInSection>
  );
}

export function LandingFlowSection() {
  const steps = [
    { label: "Connect wallet", detail: "Freighter, xBull, Albedo, Lobstr" },
    { label: "Derive shielded keys", detail: "One signature, keys stay local" },
    { label: "Shield USDC", detail: "Public deposit into the pool" },
    { label: "Send privately", detail: "Paste recipient shd_ address" },
    { label: "Withdraw anytime", detail: "Exit to any G… address" },
  ];

  return (
    <FadeInSection className="landing-section">
      <div className="landing-section__head">
        <h2>From public balance to private payment</h2>
        <p className="landing-section__lead">Five steps on testnet. Same flow on mainnet when deployed.</p>
      </div>
      <ol className="landing-flow">
        {steps.map((step, i) => (
          <li key={step.label} className="landing-flow__step">
            <span className="landing-flow__num">{i + 1}</span>
            <div>
              <strong>{step.label}</strong>
              <p>{step.detail}</p>
            </div>
          </li>
        ))}
      </ol>
      <div className="landing-section__cta">
        <Link to="/how-to-use" className="btn btn-secondary">
          Read the full guide
        </Link>
      </div>
    </FadeInSection>
  );
}

export function LandingStepsSection() {
  return (
    <FadeInSection className="landing-section landing-section--alt">
      <div className="landing-section__head">
        <h2>Three actions, clear boundaries</h2>
        <p className="landing-section__lead">Shield, send, and withdraw — each with explicit visibility rules.</p>
      </div>
      <LandingSteps />
    </FadeInSection>
  );
}

export function LandingAssetsSection() {
  return (
    <FadeInSection className="landing-section">
      <div className="landing-split">
        <div>
          <h2>Multi-asset shielded pool</h2>
          <p className="landing-section__lead">
            One pool custodies multiple Stellar stablecoins. Each note is bound to a specific asset — no cross-token confusion.
          </p>
          <div className="landing-assets">
            {ASSETS.map((sym) => (
              <span key={sym} className="landing-assets__pill" title={STABLE_CATALOG[sym].name}>
                {STABLE_CATALOG[sym].name}
                <span className="landing-assets__sym">{sym}</span>
              </span>
            ))}
          </div>
        </div>
        <div className="landing-tech card">
          <h3>Verified on-chain</h3>
          <ul className="landing-tech__list">
            <li>
              <IconUploadCloud size={16} /> Noir circuits compiled to UltraHonk
            </li>
            <li>
              <IconLock size={16} /> Soroban verifier contract
            </li>
            <li>Incremental Poseidon2 Merkle tree</li>
            <li>ECDH encrypted note routing</li>
            <li>Nullifier set prevents double-spend</li>
          </ul>
        </div>
      </div>
    </FadeInSection>
  );
}

export function LandingFaqSection() {
  return (
    <FadeInSection className="landing-section landing-section--alt">
      <div className="landing-section__head landing-section__head--left">
        <h2>Common questions</h2>
      </div>
      <div className="landing-faq">
        {FAQ.map(({ q, a }) => (
          <details key={q} className="landing-faq__item">
            <summary>{q}</summary>
            <p>{a}</p>
          </details>
        ))}
      </div>
    </FadeInSection>
  );
}

export function LandingCtaSection() {
  return (
    <FadeInSection className="landing-cta">
      <div className="landing-cta__inner">
        <h2>Ready to try private payments?</h2>
        <p>Connect on Stellar testnet, mint from the faucet, and send your first shielded transfer.</p>
        <div className="landing-actions">
          <Link to="/dashboard" className="btn btn-primary btn-lg">
            Open Dashboard
          </Link>
          <Link to="/about" className="btn btn-secondary btn-lg">
            Protocol overview
          </Link>
        </div>
      </div>
    </FadeInSection>
  );
}
