import { useEffect, useState } from "react";

import { ConnectWallet } from "../components/ConnectWallet";
import { useWallet } from "../hooks/use-wallet";
import { loadNetworkConfig } from "../lib/config";
import {
  loadStableTokensWithDecimals,
  type ListedStable,
  type StableSymbol,
} from "../lib/tokens";
import { requestFaucetMint, waitForRelayerConfirmation } from "../lib/relayer";
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
    setStatus(`Requesting ${active.symbol} mint from relayer…`);
    try {
      const config = await loadNetworkConfig(network);
      const baseUnits = parseMintAmount(amount, decimals);
      const res = await requestFaucetMint({
        token: active.contractId,
        recipient: wallet,
        amount: baseUnits.toString(),
      });
      if (res.txHash) setStatus(`Submitted tx ${res.txHash} — waiting for confirmation…`);
      const final = await waitForRelayerConfirmation(res.requestId);
      if (final.status !== "confirmed") throw new Error(final.error || `Mint ${final.status}`);
      const bals = await refreshBalances(config, wallet);
      setStatus(
        `Minted ${amount} ${active.symbol}. Balance: ${formatTokenAmount(bals[active.symbol] ?? 0n, decimals)} ${active.symbol}`
      );
    } catch (e) {
      setStatus(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  async function onMintDirect() {
    if (!wallet || !active) throw new Error("Connect wallet first");
    setBusy(true);
    setStatus(`Signing ${active.symbol} mint transaction…`);
    try {
      const config = await loadNetworkConfig(network);
      await ensureWalletNetwork(config);
      const rpc = createRpc(config);
      const baseUnits = parseMintAmount(amount, decimals);
      const txHash = await mintToken(rpc, config, wallet, active.contractId, wallet, baseUnits);
      const bals = await refreshBalances(config, wallet);
      setStatus(
        `Minted ${amount} ${active.symbol}. Tx ${txHash}. Balance: ${formatTokenAmount(bals[active.symbol] ?? 0n, decimals)} ${active.symbol}`
      );
    } catch (e) {
      setStatus(e instanceof Error ? e.message : String(e));
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

  return (
    <>
      <div className="dashboard-topbar">
        <h1 style={{ margin: 0 }}>Testnet Faucet</h1>
        <ConnectWallet />
      </div>
      <div className="card" style={{ maxWidth: 560 }}>
        <p className="muted">
          Mint mock stablecoins to your wallet for shielding, private transfer, and withdrawal.
          Amounts use each token&apos;s on-chain decimals (Stellar standard: 7).
        </p>
        <div className="field">
          <label>Stablecoin</label>
          {tokenList.length === 0 ? (
            <p className="muted">Loading tokens…</p>
          ) : (
            <select value={selected} onChange={(e) => setSelected(e.target.value as StableSymbol)}>
              {tokenList.map((t) => (
                <option key={t.symbol} value={t.symbol}>
                  {t.symbol} — {t.name} ({t.decimals} decimals)
                </option>
              ))}
            </select>
          )}
          {active && (
            <p className="muted" style={{ fontSize: 13, marginTop: 6 }}>
              {active.description}
              <br />
              Contract: {active.contractId}
            </p>
          )}
        </div>
        <div className="field">
          <label>Recipient</label>
          <input value={wallet ?? ""} readOnly placeholder="Connect wallet first" />
        </div>
        <div className="field">
          <label>
            Amount ({active?.symbol ?? "token"}, {decimals} decimal{decimals === 1 ? "" : "s"})
          </label>
          <input
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            placeholder={`e.g. 1000 or 10.${"0".repeat(Math.min(decimals, 3))}1`}
          />
          {previewBaseUnits != null && (
            <p className="muted" style={{ fontSize: 13, marginTop: 6 }}>
              = {previewBaseUnits.toString()} base units (stroops)
            </p>
          )}
        </div>
        {wallet && active && (
          <p className="muted" style={{ marginTop: 0 }}>
            {active.symbol} balance: {formatTokenAmount(balances[active.symbol] ?? 0n, decimals)}{" "}
            {active.symbol}
          </p>
        )}
        <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
          <button
            className="btn btn-purple"
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
          <p className="muted" style={{ marginTop: 12 }}>
            Relayer offline — use &quot;Mint from wallet&quot; (requires XLM for fees).
          </p>
        )}
        {status && <p style={{ marginTop: 12 }}>{status}</p>}
      </div>
    </>
  );
}
