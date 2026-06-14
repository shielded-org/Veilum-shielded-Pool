import { useEffect, useState } from "react";

import { ConnectWallet, syncShieldedWalletNow } from "../components/ConnectWallet";
import { useWallet } from "../hooks/use-wallet";
import { ProofLoader } from "../components/ProofLoader";
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

  return (
    <>
      <div className="dashboard-topbar">
        <h1 style={{ margin: 0 }}>Shield / Deposit</h1>
        <ConnectWallet />
      </div>
      <div className="card" style={{ maxWidth: 520 }}>
        <p className="muted">
          Moves public stablecoins into the shielded pool. This transaction is signed by your wallet
          and links your address to the deposit amount on-chain.
        </p>
        <div className="field">
          <label>Stablecoin</label>
          {tokenList.length === 0 ? (
            <p className="muted">No tokens deployed — run npm run deploy:stables</p>
          ) : (
            <select value={selected} onChange={(e) => setSelected(e.target.value as StableSymbol)}>
              {tokenList.map((t) => (
                <option key={t.symbol} value={t.symbol}>
                  {t.symbol} — {t.name}
                </option>
              ))}
            </select>
          )}
        </div>
        <div className="field">
          <label>Amount (token units, 7 decimals)</label>
          <input value={amount} onChange={(e) => setAmount(e.target.value)} />
        </div>
        <button
          className="btn btn-purple"
          disabled={busy || !wallet || tokenList.length === 0}
          onClick={() => void onShield()}
        >
          Shield tokens
        </button>
        {status && <p style={{ marginTop: 12 }}>{status}</p>}
      </div>
      {busy && <ProofLoader message={status || "Generating…"} />}
    </>
  );
}
