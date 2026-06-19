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
import { ScrollReveal } from "../components/ui/ScrollReveal";

const ACTIVITY_ROWS = [
  ["Deposited", "2,400.00 USDC"],
  ["Private payment", "confirmed"],
  ["Withdrawal", "recorded on-chain"],
] as const;

export function LandingPage() {
  return (
    <>
      <section className="landing-hero">
        <ScrollReveal className="landing-hero__copy" as="div" immediate variant="up" delay={0}>
          <LandingTrustBar />
          <h1>
            Private stablecoin payments on <em>Stellar</em>
          </h1>
          <p className="landing-hero__lead">
            Veilum lets you hold, send, and receive USDC and other stablecoins without broadcasting every
            payment to the world. Add and withdraw like normal — what happens in between stays yours.
          </p>
          <div className="landing-actions">
            <Link to="/dashboard" className="btn btn-primary btn-lg">
              Open Dashboard
            </Link>
            <Link to="/how-to-use" className="btn btn-secondary btn-lg">
              How it works
            </Link>
          </div>
        </ScrollReveal>

        <ScrollReveal className="landing-hero__visual" as="div" immediate variant="right" delay={120}>
          <div className="terminal-panel">
            <div className="terminal-panel__titlebar">your activity</div>
            <dl className="terminal-panel__body">
              {ACTIVITY_ROWS.map(([label, value]) => (
                <div key={label} className="terminal-row">
                  <dt>{label}</dt>
                  <dd>{value}</dd>
                </div>
              ))}
            </dl>
          </div>
          <div className="terminal-preview">
            <div className="terminal-line terminal-line--ok">✓ Balance secured · 2,400.00 USDC</div>
            <div className="terminal-line terminal-line--ok">✓ Private payment · delivered</div>
            <div className="terminal-line">— Ready to withdraw to your wallet</div>
          </div>
        </ScrollReveal>
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
