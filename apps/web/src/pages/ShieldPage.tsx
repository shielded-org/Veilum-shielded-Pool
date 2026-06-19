import { useCallback, useEffect, useState } from "react";

import { syncShieldedWalletNow } from "../components/ConnectWallet";
import { ProofLoader } from "../components/ProofLoader";
import { AmountField } from "../components/ui/AmountField";
import { AspStatusPanel } from "../components/ui/AspStatusPanel";
import { FormAsideList, FormAsidePanel, FormPageLayout } from "../components/ui/FormPageLayout";
import { StatusMessage } from "../components/ui/StatusMessage";
import { TokenSelector } from "../components/ui/TokenSelector";
import { useWallet } from "../hooks/use-wallet";
import {
  ensureAspMembership,
  fetchAspStatus,
  type AspScanResult,
  type AspStatus,
} from "../lib/asp";
import { loadNetworkConfig } from "../lib/config";
import { executeShieldDeposit } from "../lib/shield-ops";
import { contractSuccess, finishNotify, notifyLoading } from "../lib/notify";
import { createRpc, getTokenBalance } from "../lib/soroban";
import {
  defaultStableSymbol,
  loadStableTokensWithDecimals,
  listStableTokens,
  resolveStableContract,
  type ListedStable,
  type StableSymbol,
} from "../lib/tokens";
import { formatStableUsd, parseTokenAmount } from "../lib/utils";
import { useShieldedStore } from "../store/use-shielded-store";
import type { Hex32 } from "../lib/types";

export function ShieldPage() {
  const [amount, setAmount] = useState("100");
  const [status, setStatus] = useState("");
  const [busy, setBusy] = useState(false);
  const [selected, setSelected] = useState<StableSymbol>("USDC");
  const { address: wallet } = useWallet();
  const network = useShieldedStore((s) => s.network);
  const spendingKey = useShieldedStore((s) => s.spendingKey);
  const viewingKey = useShieldedStore((s) => s.viewingKey);
  const viewingPub = useShieldedStore((s) => s.viewingPub);
  const ownerPk = useShieldedStore((s) => s.ownerPk);
  const bumpRouteCursor = useShieldedStore((s) => s.bumpRouteCursor);
  const addNote = useShieldedStore((s) => s.addNote);
  const addTransaction = useShieldedStore((s) => s.addTransaction);
  const updateTransaction = useShieldedStore((s) => s.updateTransaction);
  const [tokenList, setTokenList] = useState<ListedStable[]>([]);
  const [publicBalances, setPublicBalances] = useState<Partial<Record<StableSymbol, bigint>>>({});
  const [balancesLoading, setBalancesLoading] = useState(false);

  const [aspStatus, setAspStatus] = useState<AspStatus | null>(null);
  const [aspEnforced, setAspEnforced] = useState(false);
  const [aspScanning, setAspScanning] = useState(false);
  const [lastScan, setLastScan] = useState<AspScanResult | null>(null);
  const [tokenContractId, setTokenContractId] = useState<string | null>(null);

  const selectedToken = tokenList.find((t) => t.symbol === selected);
  const selectedBalance = publicBalances[selected];

  const refreshPublicBalances = useCallback(
    async (address: string) => {
      setBalancesLoading(true);
      try {
        const config = await loadNetworkConfig(network);
        const rpc = createRpc(config);
        const tokens = await loadStableTokensWithDecimals(config, address);
        setTokenList(tokens);
        const next: Partial<Record<StableSymbol, bigint>> = {};
        for (const token of tokens) {
          next[token.symbol] = await getTokenBalance(
            rpc,
            config,
            address,
            token.contractId,
            address
          );
        }
        setPublicBalances(next);
      } finally {
        setBalancesLoading(false);
      }
    },
    [network]
  );

  const runAspScreen = useCallback(async () => {
    if (!wallet || !ownerPk || !tokenContractId) return;
    setAspScanning(true);
    try {
      const result = await ensureAspMembership(ownerPk as Hex32, wallet, tokenContractId);
      setAspStatus(result.status);
      setLastScan(result.scan ?? null);
    } catch (e) {
      setAspStatus("denied");
      setLastScan(null);
      if (e instanceof Error && e.message.includes("ASP denied")) {
        setStatus(e.message);
      }
    } finally {
      setAspScanning(false);
    }
  }, [wallet, ownerPk, tokenContractId]);

  useEffect(() => {
    void loadNetworkConfig(network).then((config) => {
      const list = listStableTokens(config.contracts);
      setTokenList(list);
      const sym = defaultStableSymbol(config.contracts);
      setSelected(sym);
      setTokenContractId(resolveStableContract(config.contracts, sym));
      setAspEnforced(Boolean(config.contracts.aspEnforceShield));
    });
  }, [network]);

  useEffect(() => {
    if (!wallet) {
      setPublicBalances({});
      return;
    }
    void refreshPublicBalances(wallet);
  }, [wallet, refreshPublicBalances]);

  useEffect(() => {
    if (!aspEnforced || !wallet || !ownerPk) return;
    void fetchAspStatus(ownerPk as Hex32)
      .then((s) => {
        setAspStatus(s.status);
        setLastScan(s.lastScan ?? null);
        if (s.status !== "approved" && s.status !== "denied") {
          void runAspScreen();
        }
      })
      .catch(() => setAspStatus(null));
  }, [aspEnforced, wallet, ownerPk, runAspScreen]);

  useEffect(() => {
    if (!aspEnforced || !wallet) return;
    void loadNetworkConfig(network).then((config) => {
      setTokenContractId(resolveStableContract(config.contracts, selected));
    });
  }, [selected, aspEnforced, wallet, network]);

  async function onShield() {
    if (!wallet || !viewingPub || !ownerPk) throw new Error("Connect wallet first");
    setBusy(true);
    setStatus("Starting shield deposit…");
    const txId = crypto.randomUUID();
    const loadingToast = notifyLoading("Shielding tokens…");
    addTransaction({
      id: txId,
      type: "shield",
      status: "pending",
      amount: `${amount} ${selected}`,
      createdAt: new Date().toISOString(),
    });
    try {
      const config = await loadNetworkConfig(network);
      const tokenId = resolveStableContract(config.contracts, selected);
      const routeCursor = bumpRouteCursor();
      updateTransaction(txId, { contractId: config.contracts.shieldedPool });
      const result = await executeShieldDeposit({
        config,
        wallet,
        keys: {
          spendingKey: BigInt(spendingKey),
          viewingPriv: BigInt(viewingKey),
          viewingPub,
          ownerPk: ownerPk as Hex32,
        },
        amount: parseTokenAmount(amount),
        tokenContractId: tokenId,
        routeCursor,
        onStatus: setStatus,
      });
      addNote(result.note);
      updateTransaction(txId, {
        status: "confirmed",
        txHash: result.txHash,
        contractId: config.contracts.shieldedPool,
      });
      setAspStatus("approved");
      setStatus("Refreshing balances…");
      await syncShieldedWalletNow({ mode: "full" });
      await refreshPublicBalances(wallet);
      finishNotify(loadingToast, {
        ok: true,
        ...contractSuccess.shield(amount, selected),
        txHash: result.txHash,
      });
      setAmount("");
      setStatus("");
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      updateTransaction(txId, {
        status: "failed",
        detail: message,
      });
      finishNotify(loadingToast, { ok: false, message });
      setStatus(message);
    } finally {
      setBusy(false);
    }
  }

  const statusVariant = status.toLowerCase().includes("error") || status.toLowerCase().includes("fail")
    ? "error"
    : status.includes("Shielded") || status.includes("Tx ")
      ? "success"
      : "info";

  return (
    <>
      <FormPageLayout
        aside={
          <div className="form-layout__aside">
            {aspEnforced ? (
              <AspStatusPanel
                status={aspStatus}
                scanning={aspScanning}
                lastScan={lastScan}
                wallet={wallet}
                onRescan={() => void runAspScreen()}
                rescanDisabled={busy || aspScanning}
              />
            ) : null}
            <FormAsidePanel title="What happens when you shield">
              <FormAsideList
                items={[
                  {
                    term: "Public deposit",
                    detail: "Your wallet address and amount appear on Stellar like any transfer.",
                  },
                  {
                    term: "Private balance",
                    detail: "You receive an encrypted note only your keys can read.",
                  },
                  {
                    term: "Wallet balance",
                    detail: "Amounts shown are your public wallet — not yet shielded.",
                  },
                ]}
              />
            </FormAsidePanel>
          </div>
        }
      >
        <div className="card form-card">
          <p className="form-notice">
            <span className="form-notice__label">Visible on-chain</span>
            Moves public stablecoins into your private balance. This transaction is signed by your
            wallet and links your address to the deposit amount on-chain.
          </p>

          <div className="field">
            <label htmlFor="shield-token">Stablecoin</label>
            <TokenSelector
              tokens={tokenList}
              value={selected}
              onChange={setSelected}
              balances={publicBalances}
              balancesLoading={balancesLoading}
              emptyMessage="No tokens deployed — run npm run deploy:stables"
            />
            {wallet && selectedToken && !balancesLoading ? (
              <p className="field-hint">
                Wallet balance: <strong>{formatStableUsd(selectedBalance ?? 0n)}</strong>{" "}
                {selected}
              </p>
            ) : null}
          </div>
          <AmountField
            id="shield-amount"
            label="Amount"
            value={amount}
            onChange={setAmount}
            symbol={selected}
            maxAmount={selectedBalance}
            disabled={!wallet || balancesLoading}
            hint={
              selectedBalance !== undefined && selectedBalance > 0n
                ? `Up to ${formatStableUsd(selectedBalance)} available in your wallet`
                : "Enter the amount to move into your private balance"
            }
          />
          <div className="form-actions">
            <button
              className="btn btn-primary"
              disabled={
                busy ||
                aspScanning ||
                aspStatus === "denied" ||
                !wallet ||
                tokenList.length === 0 ||
                balancesLoading
              }
              onClick={() => void onShield()}
            >
              Shield tokens
            </button>
          </div>
          {status && <StatusMessage variant={statusVariant}>{status}</StatusMessage>}
        </div>
      </FormPageLayout>
      {busy && <ProofLoader message={status || "Generating…"} />}
    </>
  );
}
