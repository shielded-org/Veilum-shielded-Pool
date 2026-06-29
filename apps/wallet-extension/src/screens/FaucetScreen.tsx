import { useState } from "react";

import { Button } from "../components/ui/Button";
import { formatTokenAmount } from "../lib/utils";
import { fundTestnetAccount } from "../lib/wallet-session";

type FaucetScreenProps = {
  wallet: string;
  publicXlm: bigint;
  publicStables: Array<{ symbol: string; contractId: string; decimals: number; balance: bigint }>;
  onMint: (symbol: string) => Promise<void>;
  onFunded: () => Promise<void>;
};

export function FaucetScreen({
  wallet,
  publicXlm,
  publicStables,
  onMint,
  onFunded,
}: FaucetScreenProps) {
  const [minting, setMinting] = useState<string | null>(null);
  const [fundingXlm, setFundingXlm] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  return (
    <>
      <h2 className="screen-title">Testnet faucet</h2>
      <p className="screen-lead">
        Mint test stablecoins and fund XLM for fees. All faucet activity is public on-chain.
      </p>
      <span className="privacy-pill privacy-pill--public">Public · testnet only</span>

      {message ? <p className="alert-banner alert-banner--info mt-4">{message}</p> : null}
      {error ? <p className="alert-banner alert-banner--error">{error}</p> : null}

      <section className="mt-4">
        <h3 className="keys-section__heading">Network fees (XLM)</h3>
        <div className="token-row">
          <div>
            <div className="token-row__symbol">XLM</div>
            <div className="token-row__sub">Current balance</div>
          </div>
          <div className="token-row__amount">{formatTokenAmount(publicXlm, 7)}</div>
        </div>
        <Button
          fullWidth
          variant="secondary"
          className="mt-2"
          loading={fundingXlm}
          onClick={async () => {
            setFundingXlm(true);
            setError(null);
            setMessage(null);
            try {
              const hash = await fundTestnetAccount(wallet, "testnet");
              setMessage(hash ? `Funded with test XLM — tx ${hash.slice(0, 12)}…` : "Account funded with test XLM");
              await onFunded();
            } catch (err) {
              setError(err instanceof Error ? err.message : "Friendbot failed");
            } finally {
              setFundingXlm(false);
            }
          }}
        >
          Fund with Friendbot
        </Button>
      </section>

      <section className="mt-4">
        <h3 className="keys-section__heading">Test stablecoins</h3>
        <p className="text-subtle">Mints 1,000 tokens per request via the relayer faucet.</p>
        {publicStables.length === 0 ? (
          <p className="text-muted mt-2">No stable tokens configured for this network.</p>
        ) : (
          publicStables.map((t) => (
            <div key={t.contractId} className="token-row">
              <div>
                <div className="token-row__symbol">{t.symbol}</div>
                <div className="token-row__sub">{formatTokenAmount(t.balance, t.decimals)} available</div>
              </div>
              <Button
                variant="secondary"
                size="sm"
                loading={minting === t.symbol}
                onClick={async () => {
                  setMinting(t.symbol);
                  setError(null);
                  setMessage(null);
                  try {
                    await onMint(t.symbol);
                    setMessage(`Minted 1,000 ${t.symbol} to your wallet`);
                  } catch (err) {
                    setError(err instanceof Error ? err.message : `Could not mint ${t.symbol}`);
                  } finally {
                    setMinting(null);
                  }
                }}
              >
                Mint
              </Button>
            </div>
          ))
        )}
      </section>


    </>
  );
}
