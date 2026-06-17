import { Link } from "react-router-dom";

import {
  LandingAssetsSection,
  LandingCtaSection,
  LandingFaqSection,
  LandingFlowSection,
  LandingPrivacySection,
  LandingStepsSection,
  LandingTrustBar,
} from "../components/landing/LandingSections";

export function LandingPage() {
  return (
    <>
      <section className="landing-hero">
        <div className="landing-hero__copy">
          <LandingTrustBar />
          <h1>
            Private stablecoin payments, <em>on Stellar.</em>
          </h1>
          <p className="landing-hero__lead">
            Veilum shields USDC and stablecoins into encrypted notes, sends value privately with zero-knowledge
            proofs, and lets you withdraw to any Stellar address — verified on Soroban, not blind trust.
          </p>
          <div className="landing-actions">
            <Link to="/dashboard" className="btn btn-primary btn-lg">
              Open Dashboard
            </Link>
            <Link to="/how-to-use" className="btn btn-secondary btn-lg">
              How it works
            </Link>
          </div>
          <dl className="landing-stats">
            <div>
              <dt>Proof system</dt>
              <dd>UltraHonk</dd>
            </div>
            <div>
              <dt>Tree depth</dt>
              <dd>2²⁰ notes</dd>
            </div>
            <div>
              <dt>Network</dt>
              <dd>Stellar testnet</dd>
            </div>
          </dl>
        </div>
        <div className="landing-card-stack" aria-hidden>
          <div className="landing-card landing-card--back-2">
            <div className="landing-card__chip" />
            <div className="landing-card__label">Shielded · USDC</div>
            <div className="landing-card__balance">••••••</div>
            <div className="landing-card__meta">Encrypted note</div>
          </div>
          <div className="landing-card landing-card--back-1">
            <div className="landing-card__chip" />
            <div className="landing-card__label">Shielded · USDC</div>
            <div className="landing-card__balance">••••••</div>
            <div className="landing-card__meta">Private balance</div>
          </div>
          <div className="landing-card landing-card--front">
            <div className="landing-card__chip landing-card__chip--brand" />
            <div className="landing-card__label">Veilum wallet</div>
            <div className="landing-card__balance landing-card__balance--show">2,400.00</div>
            <div className="landing-card__meta">USDC shielded</div>
          </div>
        </div>
      </section>

      <LandingPrivacySection />
      <LandingStepsSection />
      <LandingFlowSection />
      <LandingAssetsSection />
      <LandingFaqSection />
      <LandingCtaSection />
    </>
  );
}
