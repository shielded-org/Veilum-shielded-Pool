import { useEffect, useState } from "react";

import { useWallet } from "../hooks/use-wallet";
import { StatusMessage } from "../components/ui/StatusMessage";
import { FormAsideList, FormAsidePanel, FormPageLayout } from "../components/ui/FormPageLayout";
import { RelayerStatus } from "../components/ui/RelayerStatus";
import { TokenSelector } from "../components/ui/TokenSelector";
import { loadNetworkConfig } from "../lib/config";
import {
  loadStableTokensWithDecimals,
  type ListedStable,
  type StableSymbol,
} from "../lib/tokens";
import { requestFaucetMint, waitForRelayerConfirmation } from "../lib/relayer";
import { finishNotify, notifyLoading } from "../lib/notify";
import { createRpc, ensureWalletNetwork, getTokenBalance, mintToken } from "../lib/soroban";
import { useShieldedStore } from "../store/use-shielded-store";
import { formatTokenAmount, parseTokenAmount } from "../lib/utils";

export function FaucetPage() {
  const [amount, setAmount] = useState("1000");
  const [status, setStatus] = useState("");
  const [busy, setBusy] = useState(false);
  const [selected, setSelected] = useState<StableSymbol>("USDC");
  const [balances, setBalances] = useState<Record<string, bigint>>({});
  const [tokenList, setTokenList] = useState<ListedStable[]>([]);
  const { address: wallet } = useWallet();
  const network = useShieldedStore((s) => s.network);
  const relayerOk = useShieldedStore((s) => s.relayerOk);

  const active = tokenList.find((t) => t.symbol === selected) ?? tokenList[0];
  const decimals = active?.decimals ?? 7;

  useEffect(() => {
    void loadNetworkConfig(network).then((config) => {
      const source = wallet ?? config.contracts.shieldedPool;
      void loadStableTokensWithDecimals(config, source).then((tokens) => {
        setTokenList(tokens);
        if (tokens.length && !tokens.some((t) => t.symbol === selected)) {
          setSelected(tokens[0].symbol);
        }
      });
    });
  }, [network, wallet]);

  async function refreshBalances(
    config: Awaited<ReturnType<typeof loadNetworkConfig>>,
    address: string
  ) {
    const rpc = createRpc(config);
    const tokens = await loadStableTokensWithDecimals(config, address);
    const next: Record<string, bigint> = {};
    for (const token of tokens) {
      next[token.symbol] = await getTokenBalance(rpc, config, address, token.contractId, address);
    }
    setBalances(next);
    return next;
  }

  function parseMintAmount(input: string, tokenDecimals: number): bigint {
    const trimmed = input.trim();
    if (!trimmed) throw new Error("Enter an amount");
    if (!/^\d+(\.\d+)?$/.test(trimmed)) {
      throw new Error(`Use a decimal number (e.g. 100 or 10.5) with up to ${tokenDecimals} fractional digits`);
    }
    const [, frac = ""] = trimmed.split(".");
    if (frac.length > tokenDecimals) {
      throw new Error(`${active?.symbol ?? "Token"} supports at most ${tokenDecimals} decimal places`);
    }
    return parseTokenAmount(trimmed, tokenDecimals);
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
      if (res.txHash) setStatus(`Submitted — waiting for on-chain confirmation…`);
      const final = await waitForRelayerConfirmation(res.requestId);
      if (final.status !== "confirmed") throw new Error(final.error || `Mint ${final.status}`);
      const bals = await refreshBalances(config, wallet);
      const msg = `Minted ${amount} ${active.symbol}. Balance: ${formatTokenAmount(bals[active.symbol] ?? 0n, decimals)} ${active.symbol}`;
      finishNotify(loadingToast, { ok: true, message: msg, txHash: final.txHash ?? res.txHash });
      setStatus(msg);
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
      const bals = await refreshBalances(config, wallet);
      const msg = `Minted ${amount} ${active.symbol}. Balance: ${formatTokenAmount(bals[active.symbol] ?? 0n, decimals)} ${active.symbol}`;
      finishNotify(loadingToast, { ok: true, message: msg, txHash });
      setStatus(msg);
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      finishNotify(loadingToast, { ok: false, message });
      setStatus(message);
    } finally {
      setBusy(false);
    }
  }

  useEffect(() => {
    if (!wallet || tokenList.length === 0) return;
    void loadNetworkConfig(network).then((config) => refreshBalances(config, wallet));
  }, [wallet, network, tokenList.length]);

  const previewBaseUnits = (() => {
    try {
      if (!amount.trim() || !active) return null;
      return parseMintAmount(amount, decimals);
    } catch {
      return null;
    }
  })();

  const statusVariant = status.toLowerCase().includes("error") || status.toLowerCase().includes("fail")
    ? "error"
    : status.includes("Minted")
      ? "success"
      : "info";

  return (
    <>
      <FormPageLayout
        aside={
          <FormAsidePanel title="Testnet faucet">
            <FormAsideList
              items={[
                { term: "Mint via relayer", detail: "Gasless — requires relayer at localhost:8787." },
                { term: "Mint from wallet", detail: "Signs directly; needs XLM for Soroban fees." },
                { term: "Decimals", detail: "Stellar tokens use 7 decimal places (stroops)." },
              ]}
            />
            {wallet && active && (
              <p className="form-aside__balance">
                Balance:{" "}
                <strong>
                  {formatTokenAmount(balances[active.symbol] ?? 0n, decimals)} {active.symbol}
                </strong>
              </p>
            )}
          </FormAsidePanel>
        }
      >
        <div className="card form-card">
          <RelayerStatus online={relayerOk} />

          <p className="form-intro">
            Mint mock stablecoins to your wallet for shielding, private transfer, and withdrawal.
          </p>

          <div className="field">
            <label htmlFor="faucet-token">Stablecoin</label>
            <TokenSelector
              tokens={tokenList}
              value={selected}
              onChange={setSelected}
              emptyMessage="Loading tokens…"
            />
            {active && (
              <p className="field-hint">{active.description}</p>
            )}
          </div>
          <div className="field">
            <label htmlFor="faucet-recipient">Recipient</label>
            <input
              id="faucet-recipient"
              className="input input--mono"
              value={wallet ?? ""}
              readOnly
              placeholder="Connect wallet first"
            />
          </div>
          <div className="field">
            <label htmlFor="faucet-amount">
              Amount ({active?.symbol ?? "token"}, {decimals} decimal{decimals === 1 ? "" : "s"})
            </label>
            <input
              id="faucet-amount"
              className="input"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              placeholder={`e.g. 1000 or 10.${"0".repeat(Math.min(decimals, 3))}1`}
            />
            {previewBaseUnits != null && (
              <p className="field-hint">= {previewBaseUnits.toString()} base units (stroops)</p>
            )}
          </div>
          <div className="form-actions">
            <button
              className="btn btn-primary"
              disabled={busy || !wallet || !active || !relayerOk}
              onClick={() => void onMintViaRelayer()}
            >
              Mint via relayer
            </button>
            <button
              className="btn btn-secondary"
              disabled={busy || !wallet || !active}
              onClick={() => void onMintDirect()}
            >
              Mint from wallet
            </button>
          </div>
          {!relayerOk && (
            <p className="field-hint">Relayer offline — use &quot;Mint from wallet&quot; (requires XLM for fees).</p>
          )}
          {status && <StatusMessage variant={statusVariant}>{status}</StatusMessage>}
        </div>
      </FormPageLayout>
    </>
  );
}
