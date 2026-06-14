import { Link } from "react-router-dom";

export function LandingPage() {
  return (
    <section className="landing-hero">
      <div>
        <div className="landing-shield">✓ UltraHonk verified shielded pool</div>
        <h1>
          Go further with <span>Shielded.</span>
        </h1>
        <p>
          Private payments on Stellar Soroban. Shield tokens into encrypted notes, send privately via
          relayer, and withdraw to any account — with zero-knowledge proofs verified on-chain.
        </p>
        <div className="landing-actions">
          <Link to="/dashboard" className="btn btn-primary">
            Open Dashboard
          </Link>
          <Link to="/how-to-use" className="btn btn-secondary">
            How it works
          </Link>
        </div>
      </div>
      <div className="landing-card-stack">
        <div className="landing-card back">
          <div className="chip" />
          <div>•••• •••• •••• 2026</div>
          <div style={{ marginTop: 40, opacity: 0.8 }}>Shielded balance</div>
        </div>
        <div className="landing-card front">
          <div className="chip" />
          <div>STELLAR SHIELDED</div>
          <div style={{ marginTop: 40, fontSize: 28, fontWeight: 800 }}>Private by default</div>
        </div>
      </div>
    </section>
  );
}
