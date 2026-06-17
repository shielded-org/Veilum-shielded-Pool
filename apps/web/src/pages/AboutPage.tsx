import { Link } from "react-router-dom";

import { FadeInSection } from "../components/ui/FadeInSection";
import { IconLock, IconUploadCloud, IconDownloadCloud } from "../components/ui/icons";

const BOUNDARIES = [
  {
    icon: IconUploadCloud,
    title: "Shield (deposit)",
    detail: "Your Stellar address and deposit amount are public on-chain.",
    tone: "public" as const,
  },
  {
    icon: IconLock,
    title: "Private transfer",
    detail: "Relayer signs the tx. Amount, sender, and recipient stay encrypted.",
    tone: "private" as const,
  },
  {
    icon: IconDownloadCloud,
    title: "Unshield (withdraw)",
    detail: "Recipient address and withdrawn amount are visible. Change can stay private.",
    tone: "public" as const,
  },
];

const BUILT = [
  "Multi-token shielded pool with Merkle commitments",
  "Private transfers via relayer (sender identity hidden)",
  "Partial unshield with private change notes",
  "ECDH encrypted notes with channel/subchannel routing",
  "Browser-side UltraHonk proof generation (Noir.js + bb.js)",
];

export function AboutPage() {
  return (
    <FadeInSection className="content-page">
      <header className="content-page__hero">
        <h1>About Veilum</h1>
        <p className="content-page__lead">
          Veilum brings selective privacy to Stellar stablecoin payments — shielded-pool architecture
          with UltraHonk verification and relayer-submitted private transfers.
        </p>
      </header>

      <div className="content-grid">
        <article className="card content-card">
          <h2>What we built</h2>
          <ul className="content-list">
            {BUILT.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
        </article>

        <article className="card content-card">
          <h2>Privacy boundaries</h2>
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
        </article>
      </div>

      <article className="card content-card content-card--wide">
        <h2>Architecture at a glance</h2>
        <div className="content-arch">
          <div>
            <h3>On-chain</h3>
            <p>Soroban shielded pool, incremental Poseidon2 Merkle tree, UltraHonk verifier, nullifier set.</p>
          </div>
          <div>
            <h3>Off-chain</h3>
            <p>Browser proof generation, ECDH note encryption, relayer submission for private ops.</p>
          </div>
          <div>
            <h3>Keys</h3>
            <p>Derived locally from a one-time wallet signature. Never sent to a server.</p>
          </div>
        </div>
        <p className="content-footnote">
          Contracts are deployed on Stellar testnet. The relayer sponsors gas for private operations so users
          are not linked as transaction signers for transfers and withdrawals.{" "}
          <Link to="/how-to-use">Read the guide →</Link>
        </p>
      </article>
    </FadeInSection>
  );
}
