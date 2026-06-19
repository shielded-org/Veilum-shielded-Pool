import { useCallback, useEffect, useState } from "react";

import { syncShieldedWalletNow } from "../components/ConnectWallet";
import { ProofLoader } from "../components/ProofLoader";
import { PrivacyCallout } from "../components/ui/PrivacyCallout";
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
import { finishNotify, notifyLoading } from "../lib/notify";
import {
  defaultStableSymbol,
  listStableTokens,
  resolveStableContract,
  type StableSymbol,
} from "../lib/tokens";
import { useShieldedStore } from "../store/use-shielded-store";
import { parseTokenAmount } from "../lib/utils";
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
  const [tokenList, setTokenList] = useState<Awaited<ReturnType<typeof listStableTokens>>>([]);

  const [aspStatus, setAspStatus] = useState<AspStatus | null>(null);
  const [aspEnforced, setAspEnforced] = useState(false);
  const [aspScanning, setAspScanning] = useState(false);
  const [lastScan, setLastScan] = useState<AspScanResult | null>(null);
  const [tokenContractId, setTokenContractId] = useState<string | null>(null);

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
      finishNotify(loadingToast, {
        ok: true,
        message: `Shielded ${amount} ${selected}`,
        txHash: result.txHash,
      });
      setStatus(`Shielded ${selected} — confirmed on-chain`);
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

  const aspMessage = (() => {
    if (aspScanning) return "Scanning on-chain fund sources for your wallet…";
    if (aspStatus === "approved")
      return lastScan
        ? `ASP approved automatically — ${lastScan.inboundCount ?? 0} inbound source(s) scanned, all clean.`
        : "ASP membership approved — you can shield.";
    if (aspStatus === "denied")
      return lastScan?.reasons?.length
        ? `ASP denied: ${lastScan.reasons.join("; ")}`
        : "ASP denied — shielding blocked due to fund-source scan.";
    return "ASP enforced — connect wallet to run on-chain compliance scan.";
  })();

  return (
    <>
      <FormPageLayout
        aside={
          <FormAsidePanel title="What happens when you shield">
            <FormAsideList
              items={[
                { term: "Compliance scan", detail: "Inbound payments to your wallet are checked on-chain before ASP membership is granted." },
                { term: "On-chain visibility", detail: "Your Stellar address and deposit amount appear publicly." },
                { term: "What you receive", detail: "An encrypted note in the pool, tied to your viewing key." },
              ]}
            />
          </FormAsidePanel>
        }
      >
        <div className="card form-card">
          {aspEnforced ? (
            <StatusMessage
              variant={
                aspStatus === "approved" ? "success" : aspStatus === "denied" ? "error" : "info"
              }
            >
              {aspMessage}
            </StatusMessage>
          ) : null}
          <PrivacyCallout variant="public">
            Moves public stablecoins into the shielded pool. This transaction is signed by your wallet
            and links your address to the deposit amount on-chain.
          </PrivacyCallout>

          <div className="field">
            <label htmlFor="shield-token">Stablecoin</label>
            <TokenSelector
              tokens={tokenList}
              value={selected}
              onChange={setSelected}
              emptyMessage="No tokens deployed — run npm run deploy:stables"
            />
          </div>
          <div className="field">
            <label htmlFor="shield-amount">Amount (token units, 7 decimals)</label>
            <input
              id="shield-amount"
              className="input"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
            />
          </div>
          <div className="form-actions">
            <button
              className="btn btn-primary"
              disabled={busy || aspScanning || aspStatus === "denied" || !wallet || tokenList.length === 0}
              onClick={() => void onShield()}
            >
              Shield tokens
            </button>
            {aspEnforced && wallet ? (
              <button
                type="button"
                className="btn btn-secondary"
                disabled={busy || aspScanning}
                onClick={() => void runAspScreen()}
              >
                Re-run compliance scan
              </button>
            ) : null}
          </div>
          {status && <StatusMessage variant={statusVariant}>{status}</StatusMessage>}
        </div>
      </FormPageLayout>
      {busy && <ProofLoader message={status || "Generating…"} />}
    </>
  );
}
