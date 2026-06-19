import { useCallback, useEffect, useState } from "react";

import { AmountField } from "../components/ui/AmountField";
import { FormAsideList, FormAsidePanel, FormPageLayout } from "../components/ui/FormPageLayout";
import { StatusMessage } from "../components/ui/StatusMessage";
import { TokenSelector } from "../components/ui/TokenSelector";
import { useWallet } from "../hooks/use-wallet";
import { loadNetworkConfig } from "../lib/config";
import {
  formatXlmBalance,
  fundWithFriendbot,
  getNativeXlmBalance,
} from "../lib/friendbot";
import { contractSuccess, finishNotify, notifyLoading } from "../lib/notify";
import { requestFaucetMint, waitForRelayerConfirmation } from "../lib/relayer";
import { createRpc, ensureWalletNetwork, getTokenBalance, mintToken } from "../lib/soroban";
import {
  loadStableTokensWithDecimals,
  type ListedStable,
  type StableSymbol,
} from "../lib/tokens";
import { useShieldedStore } from "../store/use-shielded-store";
import { formatStableUsd, formatTokenAmount, parseTokenAmount } from "../lib/utils";

export function FaucetPage() {
  const [amount, setAmount] = useState("1000");
  const [status, setStatus] = useState("");
  const [busy, setBusy] = useState(false);
  const [xlmBusy, setXlmBusy] = useState(false);
  const [selected, setSelected] = useState<StableSymbol>("USDC");
  const [balances, setBalances] = useState<Record<string, bigint>>({});
  const [xlmBalance, setXlmBalance] = useState<bigint | null>(null);
  const [balancesLoading, setBalancesLoading] = useState(false);
  const [tokenList, setTokenList] = useState<ListedStable[]>([]);
  const [friendbotUrl, setFriendbotUrl] = useState<string | null>(null);
  const [horizonUrl, setHorizonUrl] = useState<string | null>(null);
  const { address: wallet } = useWallet();
  const network = useShieldedStore((s) => s.network);
  const relayerOk = useShieldedStore((s) => s.relayerOk);

  const active = tokenList.find((t) => t.symbol === selected) ?? tokenList[0];
  const decimals = active?.decimals ?? 7;

  useEffect(() => {
    void loadNetworkConfig(network).then((config) => {
      setFriendbotUrl(config.friendbotUrl ?? null);
      setHorizonUrl(config.horizonUrl ?? null);
      const source = wallet ?? config.contracts.shieldedPool;
      void loadStableTokensWithDecimals(config, source).then((tokens) => {
        setTokenList(tokens);
        if (tokens.length && !tokens.some((t) => t.symbol === selected)) {
          setSelected(tokens[0].symbol);
        }
      });
    });
  }, [network, wallet]);

  const refreshBalances = useCallback(
    async (address: string) => {
      setBalancesLoading(true);
      try {
        const config = await loadNetworkConfig(network);
        const rpc = createRpc(config);
        const tokens = await loadStableTokensWithDecimals(config, address);
        const next: Record<string, bigint> = {};
        for (const token of tokens) {
          next[token.symbol] = await getTokenBalance(
            rpc,
            config,
            address,
            token.contractId,
            address
          );
        }
        setBalances(next);
        let xlm = 0n;
        if (config.horizonUrl) {
          xlm = await getNativeXlmBalance(config.horizonUrl, address);
          setXlmBalance(xlm);
        } else {
          setXlmBalance(null);
        }
        return { stables: next, xlm };
      } finally {
        setBalancesLoading(false);
      }
    },
    [network]
  );

  useEffect(() => {
    if (!wallet || tokenList.length === 0) return;
    void refreshBalances(wallet);
  }, [wallet, tokenList.length, refreshBalances]);

  function parseMintAmount(input: string, tokenDecimals: number): bigint {
    const trimmed = input.trim();
    if (!trimmed) throw new Error("Enter an amount");
    if (!/^\d+(\.\d+)?$/.test(trimmed)) {
      throw new Error(
        `Use a decimal number (e.g. 100 or 10.5) with up to ${tokenDecimals} fractional digits`
      );
    }
    const [, frac = ""] = trimmed.split(".");
    if (frac.length > tokenDecimals) {
      throw new Error(`${active?.symbol ?? "Token"} supports at most ${tokenDecimals} decimal places`);
    }
    return parseTokenAmount(trimmed, tokenDecimals);
  }

  async function onFundXlm() {
    if (!wallet || !friendbotUrl) throw new Error("Friendbot is not available on this network");
    setXlmBusy(true);
    const loadingToast = notifyLoading("Requesting testnet XLM…");
    setStatus("Contacting Friendbot…");
    try {
      const txHash = await fundWithFriendbot(friendbotUrl, wallet);
      const { xlm } = await refreshBalances(wallet);
      finishNotify(loadingToast, {
        ok: true,
        ...contractSuccess.xlm(formatXlmBalance(xlm)),
        txHash,
      });
      setStatus("");
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      finishNotify(loadingToast, { ok: false, message });
      setStatus(message);
    } finally {
      setXlmBusy(false);
    }
  }

  async function onMintViaRelayer() {
    if (!wallet || !active) throw new Error("Connect wallet first");
    setBusy(true);
    const loadingToast = notifyLoading(`Minting ${active.symbol} via relayer…`);
    setStatus(`Requesting ${active.symbol} mint from relayer…`);
    try {
      const config = await loadNetworkConfig(network);
      const baseUnits = parseMintAmount(amount, decimals);
      const res = await requestFaucetMint({
        token: active.contractId,
        recipient: wallet,
        amount: baseUnits.toString(),
      });
      if (res.txHash) setStatus("Submitted — waiting for on-chain confirmation…");
      const final = await waitForRelayerConfirmation(res.requestId);
      if (final.status !== "confirmed") throw new Error(final.error || `Mint ${final.status}`);
      const bals = await refreshBalances(wallet);
      const balanceLabel = `${formatTokenAmount(bals.stables[active.symbol] ?? 0n, decimals)} ${active.symbol}`;
      finishNotify(loadingToast, {
        ok: true,
        ...contractSuccess.mint(amount, active.symbol, balanceLabel),
        txHash: final.txHash ?? res.txHash,
      });
      setAmount("");
      setStatus("");
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      finishNotify(loadingToast, { ok: false, message });
      setStatus(message);
    } finally {
      setBusy(false);
    }
  }

  async function onMintDirect() {
    if (!wallet || !active) throw new Error("Connect wallet first");
    setBusy(true);
    const loadingToast = notifyLoading(`Minting ${active.symbol} from wallet…`);
    setStatus(`Signing ${active.symbol} mint transaction…`);
    try {
      const config = await loadNetworkConfig(network);
      await ensureWalletNetwork(config);
      const rpc = createRpc(config);
      const baseUnits = parseMintAmount(amount, decimals);
      const txHash = await mintToken(rpc, config, wallet, active.contractId, wallet, baseUnits);
      const bals = await refreshBalances(wallet);
      const balanceLabel = `${formatTokenAmount(bals.stables[active.symbol] ?? 0n, decimals)} ${active.symbol}`;
      finishNotify(loadingToast, {
        ok: true,
        ...contractSuccess.mint(amount, active.symbol, balanceLabel),
        txHash,
      });
      setAmount("");
      setStatus("");
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      finishNotify(loadingToast, { ok: false, message });
      setStatus(message);
    } finally {
      setBusy(false);
    }
  }

  const parsedAmount = (() => {
    try {
      return amount ? parseMintAmount(amount, decimals) : null;
    } catch {
      return null;
    }
  })();

  const statusVariant =
    status.toLowerCase().includes("error") || status.toLowerCase().includes("fail")
      ? "error"
      : "info";

  const shortWallet = wallet ? `${wallet.slice(0, 4)}…${wallet.slice(-4)}` : null;

  return (
    <FormPageLayout
      aside={
        <div className="form-layout__aside">
          <FormAsidePanel title="Testnet faucet">
            <FormAsideList
              items={[
                {
                  term: "XLM (Friendbot)",
                  detail: "Free testnet lumens for Soroban fees and wallet-signed mints.",
                },
                {
                  term: "Mint via relayer",
                  detail: "Gasless stablecoin mint — requires relayer online.",
                },
                {
                  term: "Mint from wallet",
                  detail: "Signs directly on-chain; needs XLM for fees.",
                },
              ]}
            />
            {wallet ? (
              <div className="faucet-aside-balances">
                {horizonUrl ? (
                  <p className="faucet-aside-balances__row">
                    <span>XLM</span>
                    <strong className="mono">
                      {balancesLoading || xlmBalance === null
                        ? "…"
                        : formatXlmBalance(xlmBalance)}
                    </strong>
                  </p>
                ) : null}
                {active ? (
                  <p className="faucet-aside-balances__row">
                    <span>{active.symbol}</span>
                    <strong className="mono">
                      {balancesLoading
                        ? "…"
                        : formatStableUsd(balances[active.symbol] ?? 0n, decimals)}
                    </strong>
                  </p>
                ) : null}
              </div>
            ) : null}
          </FormAsidePanel>
        </div>
      }
    >
      <div className="card form-card faucet-form">
        <p className="form-notice form-notice--testnet">
          <span className="form-notice__label">Testnet only</span>
          Mint mock stablecoins to your connected wallet for shielding, private transfers, and
          withdrawals. Funds have no real value.
        </p>

        {friendbotUrl ? (
          <section className="faucet-section">
            <h3 className="faucet-section__heading">XLM for fees</h3>
            <div className="faucet-xlm-panel">
              <div className="faucet-xlm-panel__copy">
                <p className="faucet-xlm-panel__title">Friendbot</p>
                <p className="faucet-xlm-panel__detail">
                  Request testnet lumens to pay Soroban fees when minting from your wallet or
                  shielding tokens.
                </p>
                {wallet && xlmBalance !== null ? (
                  <p className="faucet-xlm-panel__balance mono">
                    Balance: {balancesLoading ? "…" : formatXlmBalance(xlmBalance)}
                  </p>
                ) : null}
              </div>
              <button
                type="button"
                className="btn btn-secondary"
                disabled={!wallet || xlmBusy || balancesLoading}
                onClick={() => void onFundXlm()}
              >
                {xlmBusy ? "Funding…" : "Fund XLM"}
              </button>
            </div>
          </section>
        ) : null}

        <section className="faucet-section">
          <h3 className="faucet-section__heading">Stablecoins</h3>

          {!relayerOk ? (
            <p className="alert-banner alert-banner--error faucet-section__alert">
              Relayer offline — use mint from wallet (requires XLM for fees).
            </p>
          ) : null}

          <div className="transfer-flow">
            <section className="transfer-flow__step">
              <h4 className="transfer-flow__heading">Token</h4>
              <TokenSelector
                tokens={tokenList}
                value={selected}
                onChange={setSelected}
                balances={balances}
                balancesLoading={balancesLoading}
                emptyMessage="Loading tokens…"
              />
              {active ? <p className="field-hint">{active.description}</p> : null}
            </section>

            <section className="transfer-flow__step">
              <h4 className="transfer-flow__heading">Amount</h4>
              <AmountField
                id="faucet-amount"
                label={`Mint (${active?.symbol ?? "token"})`}
                value={amount}
                onChange={setAmount}
                symbol={active?.symbol ?? "—"}
                disabled={!wallet || !active || busy}
                hint={
                  wallet
                    ? `Mints to ${shortWallet}`
                    : "Connect wallet to mint testnet stablecoins"
                }
              />
            </section>
          </div>

          {parsedAmount !== null && active ? (
            <div className="transfer-summary faucet-summary" aria-live="polite">
              <div className="transfer-summary__row">
                <span>Mint to wallet</span>
                <strong className="mono">
                  {formatStableUsd(parsedAmount, decimals)} {active.symbol}
                </strong>
              </div>
            </div>
          ) : null}

          <div className="form-actions form-actions--split">
            <button
              type="button"
              className="btn btn-primary btn-lg"
              disabled={busy || !wallet || !active || !relayerOk || parsedAmount === null}
              onClick={() => void onMintViaRelayer()}
            >
              Mint via relayer
            </button>
            <button
              type="button"
              className="btn btn-secondary btn-lg"
              disabled={busy || !wallet || !active || parsedAmount === null}
              onClick={() => void onMintDirect()}
            >
              Mint from wallet
            </button>
          </div>
        </section>

        {status && <StatusMessage variant={statusVariant}>{status}</StatusMessage>}
      </div>
    </FormPageLayout>
  );
}
