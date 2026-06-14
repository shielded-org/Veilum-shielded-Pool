export function AboutPage() {
  return (
    <div className="card" style={{ margin: "40px 0 80px" }}>
      <h1>About Stellar Shielded</h1>
      <p className="muted">
        Stellar Shielded brings EVM-style shielded pool privacy to Soroban — the same architecture as
        shielded-token, adapted for Stellar accounts, UltraHonk verification, and relayer-submitted
        private transfers.
      </p>
      <div className="grid-2" style={{ marginTop: 24 }}>
        <div>
          <h3>What we built</h3>
          <ul>
            <li>Multi-token shielded pool with Merkle commitments</li>
            <li>Private transfers via relayer (sender identity hidden)</li>
            <li>Partial unshield with private change notes</li>
            <li>ECDH encrypted notes with channel/subchannel routing</li>
            <li>Browser-side UltraHonk proof generation (Noir.js + bb.js)</li>
          </ul>
        </div>
        <div>
          <h3>Privacy boundaries</h3>
          <ul>
            <li>
              <strong>Shield (deposit)</strong> — your Stellar address and amount are public
            </li>
            <li>
              <strong>Private transfer</strong> — relayer signs; amounts and parties stay encrypted
            </li>
            <li>
              <strong>Unshield (withdraw)</strong> — recipient address and public amount are visible
            </li>
          </ul>
        </div>
      </div>
      <p className="muted" style={{ marginTop: 24 }}>
        Contracts are deployed on Stellar testnet. The relayer sponsors gas for private operations so
        users are not linked as transaction signers for transfers and withdrawals.
      </p>
    </div>
  );
}
