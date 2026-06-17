import { useEffect, useState } from "react";

import { syncShieldedWalletNow } from "../components/ConnectWallet";
import { ProofLoader } from "../components/ProofLoader";
import { PrivacyCallout } from "../components/ui/PrivacyCallout";
import { FormAsideList, FormAsidePanel, FormPageLayout } from "../components/ui/FormPageLayout";
import { StatusMessage } from "../components/ui/StatusMessage";
import { TokenSelector } from "../components/ui/TokenSelector";
import { useWallet } from "../hooks/use-wallet";
import { loadNetworkConfig } from "../lib/config";
import { executeShieldDeposit } from "../lib/shield-ops";
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

  useEffect(() => {
    void loadNetworkConfig(network).then((config) => {
      const list = listStableTokens(config.contracts);
      setTokenList(list);
      setSelected(defaultStableSymbol(config.contracts));
    });
  }, [network]);

  async function onShield() {
    if (!wallet || !viewingPub || !ownerPk) throw new Error("Connect wallet first");
    setBusy(true);
    setStatus("Starting shield deposit…");
    const txId = crypto.randomUUID();
    addTransaction({
      id: txId,
      type: "shield",
      status: "pending",
      amount: `${amount} ${selected}`,
      createdAt: new Date().toISOString(),
    });
    try {
      const config = await loadNetworkConfig(network);
      const tokenContractId = resolveStableContract(config.contracts, selected);
      const routeCursor = bumpRouteCursor();
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
        tokenContractId,
        routeCursor,
        onStatus: setStatus,
      });
      addNote(result.note);
      updateTransaction(txId, {
        status: "confirmed",
        txHash: result.txHash,
      });
      setStatus("Refreshing balances…");
      await syncShieldedWalletNow();
      setStatus(`Shielded ${selected}! Tx ${result.txHash}`);
    } catch (e) {
      updateTransaction(txId, {
        status: "failed",
        detail: e instanceof Error ? e.message : String(e),
      });
      setStatus(e instanceof Error ? e.message : String(e));
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
          <FormAsidePanel title="What happens when you shield">
            <FormAsideList
              items={[
                { term: "On-chain visibility", detail: "Your Stellar address and deposit amount appear publicly." },
                { term: "What you receive", detail: "An encrypted note in the pool, tied to your viewing key." },
                { term: "Next step", detail: "Send privately or withdraw — only the deposit is public." },
              ]}
            />
          </FormAsidePanel>
        }
      >
        <div className="card form-card">
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
              disabled={busy || !wallet || tokenList.length === 0}
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
