import { Link } from "react-router-dom";

export function HowToUsePage() {
  return (
    <div className="card" style={{ margin: "40px 0 80px" }}>
      <h1>How to use</h1>
      <ol style={{ lineHeight: 1.8 }}>
        <li>
          Connect a Stellar wallet (Freighter, xBull, Albedo, Lobstr, etc.) and switch to <strong>Testnet</strong>.
        </li>
        <li>
          Open the <Link to="/dashboard">Dashboard</Link> and connect your wallet.
        </li>
        <li>
          Sign the one-time key derivation consent — this creates your shielded spending and viewing
          keys locally (never sent to a server).
        </li>
        <li>
          <strong>Shield / Deposit</strong> — move public tokens into the pool. This step is visible
          on-chain (your address + amount).
        </li>
        <li>
          <strong>Private Transfer</strong> — paste the recipient&apos;s <code>shd_…</code> shielded
          address from Viewing Keys. Relayer submits the proof; your wallet is not the tx signer.
        </li>
        <li>
          <strong>Withdraw / Unshield</strong> — exit shielded balance to a Stellar address. Recipient
          and amount are public; remaining change stays private.
        </li>
        <li>
          Use <strong>Notes</strong> to scan encrypted route events and see discovered balances.
        </li>
      </ol>
      <h3>Requirements</h3>
      <ul>
        <li>Relayer running at <code>http://127.0.0.1:8787</code> (or set <code>VITE_RELAYER_URL</code>)</li>
        <li>Contracts from <code>public/deployment.json</code></li>
        <li>Browser with SharedArrayBuffer support (COOP/COEP headers enabled in dev server)</li>
      </ul>
    </div>
  );
}
