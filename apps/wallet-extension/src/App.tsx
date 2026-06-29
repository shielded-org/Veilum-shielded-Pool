import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import type { Keypair } from "@stellar/stellar-sdk";

import { AccountSwitcher } from "./components/AccountSwitcher";
import { BottomNav, WalletHeader, type Tab } from "./components/Chrome";
import { WalletHeaderActions } from "./components/WalletHeaderActions";
import { LockConfirmDialog } from "./components/LockConfirmDialog";
import { SendModeToggle, type SendMode } from "./components/SendModeToggle";
import { WalletMenu } from "./components/WalletMenu";
import { Button } from "./components/ui/Button";
import { CopyField } from "./components/ui/CopyField";
import { Onboarding } from "./screens/Onboarding";
import { FaucetScreen } from "./screens/FaucetScreen";
import { HomeScreen } from "./screens/HomeScreen";
import { ActivityScreen } from "./screens/ActivityScreen";
import { KeysScreen } from "./screens/KeysScreen";
import { useShieldedSync } from "./hooks/use-shielded-sync";
import { groupUnspentNotesByToken, tokenKey } from "./lib/note-groups";
import { syncShieldedWalletNow } from "./lib/sync-shielded-now";
import { buildTokenFieldRegistryOnChain, type TokenFieldRegistry } from "./lib/token-labels";
import { formatTokenAmount } from "./lib/utils";
import {
  addTxRecord,
  switchWalletAccount,
  createAdditionalAccount,
  fundTestnetAccount,
  getShieldedReceiveAddress,
  loadPublicBalances,
  lockWalletSession,
  mintTestStable,
  parseAmount,
  runPrivateTransfer,
  runShield,
  runUnshield,
  unlockWalletSession,
  updateTxRecord,
} from "./lib/wallet-session";
import { useShieldedStore } from "./store/use-shielded-store";
import { loadNetworkConfig } from "./lib/config";
import type { NetworkName } from "./lib/types";
import { EMPTY_WALLET_TRANSACTIONS } from "./lib/empty-transactions";
import { hasStoredMnemonic, listVaultAccounts, type VaultAccountSummary } from "./vault/storage";
import { getActiveKeypair } from "./vault/session";

export function App() {
  const [keypair, setKeypair] = useState<Keypair | null>(null);
  const [tab, setTab] = useState<Tab>("home");
  const [menuOpen, setMenuOpen] = useState(false);
  const [lockDialogOpen, setLockDialogOpen] = useState(false);
  const [statusOverlay, setStatusOverlay] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const network = useShieldedStore((s) => s.network);
  const notes = useShieldedStore((s) => s.notes);
  const merkleLeaves = useShieldedStore((s) => s.merkleLeaves);
  const revealBalances = useShieldedStore((s) => s.revealBalances);
  const balanceMode = useShieldedStore((s) => s.balanceMode);
  const setBalanceMode = useShieldedStore((s) => s.setBalanceMode);
  const ownerPk = useShieldedStore((s) => s.ownerPk);
  const viewingPub = useShieldedStore((s) => s.viewingPub);
  const spendingKey = useShieldedStore((s) => s.spendingKey);
  const viewingKey = useShieldedStore((s) => s.viewingKey);
  const routeCursor = useShieldedStore((s) => s.routeCursor);
  const keyMaterialAddress = useShieldedStore((s) => s.keyMaterialAddress);
  const syncRefreshing = useShieldedStore((s) => s.scanRefreshing);
  const syncError = useShieldedStore((s) => s.syncError);
  const relayerOk = useShieldedStore((s) => s.relayerOk);
  const transactions = useShieldedStore((s) =>
    keypair
      ? (s.transactionsByWallet[keypair.publicKey()] ?? EMPTY_WALLET_TRANSACTIONS)
      : EMPTY_WALLET_TRANSACTIONS
  );

  const [publicXlm, setPublicXlm] = useState<bigint>(0n);
  const [publicStables, setPublicStables] = useState<
    Array<{ symbol: string; contractId: string; decimals: number; balance: bigint }>
  >([]);
  const [tokenRegistry, setTokenRegistry] = useState<TokenFieldRegistry | null>(null);
  const [vaultAccounts, setVaultAccounts] = useState<VaultAccountSummary[]>([]);
  const [activeAccountId, setActiveAccountId] = useState("");
  const [canAddAccount, setCanAddAccount] = useState(false);
  const [accountBusy, setAccountBusy] = useState(false);
  const [accountOnChain, setAccountOnChain] = useState<boolean | null>(null);
  const [fundingAccount, setFundingAccount] = useState(false);

  const wallet = keypair?.publicKey() ?? "";
  useShieldedSync(keypair ? wallet : null);

  const unspent = useMemo(() => notes.filter((n) => !n.spent), [notes]);
  const noteGroups = useMemo(() => {
    const groups = groupUnspentNotesByToken(unspent);
    return groups.map((g) => ({
      ...g,
      symbol: tokenRegistry?.symbolForField(g.token) ?? "—",
    }));
  }, [unspent, tokenRegistry]);

  const refreshPublic = useCallback(async (): Promise<boolean> => {
    if (!wallet) return false;
    setAccountOnChain(null);
    const data = await loadPublicBalances(wallet, network);
    setAccountOnChain(data.onChain);
    setPublicXlm(data.xlm);
    setPublicStables(data.stables);
    const config = await loadNetworkConfig(network);
    setTokenRegistry(await buildTokenFieldRegistryOnChain(config, wallet));
    return data.onChain;
  }, [wallet, network]);

  const refreshVaultAccounts = useCallback(async () => {
    const [accounts, mnemonicStored] = await Promise.all([listVaultAccounts(), hasStoredMnemonic()]);
    setVaultAccounts(accounts);
    setCanAddAccount(mnemonicStored);
    if (activeAccountId && accounts.some((account) => account.id === activeAccountId)) return;
    const match = accounts.find((account) => account.publicKey === wallet);
    if (match) setActiveAccountId(match.id);
  }, [activeAccountId, wallet]);

  useEffect(() => {
    if (!keypair) return;
    void refreshVaultAccounts();
  }, [keypair, refreshVaultAccounts]);

  const refreshPublicOnly = useCallback(async () => {
    if (!wallet) return;
    await refreshPublic();
  }, [wallet, refreshPublic]);

  useEffect(() => {
    if (!keypair) return;
    void refreshPublicOnly();
    const id = window.setInterval(() => void refreshPublicOnly(), 45_000);
    return () => window.clearInterval(id);
  }, [keypair, refreshPublicOnly]);

  const refreshAll = useCallback(async () => {
    if (!wallet) return;
    const onChain = await refreshPublic();
    if (onChain) {
      await syncShieldedWalletNow({ bustIndexerCache: true });
    } else {
      useShieldedStore.getState().setNotes([]);
      useShieldedStore.getState().setMerkleLeaves([]);
      useShieldedStore.getState().setShieldedBalance(0n);
      useShieldedStore.getState().setSyncError(null);
    }
  }, [wallet, refreshPublic]);

  async function onUnlocked(kp: Keypair, accountId: string) {
    setError(null);
    await unlockWalletSession(kp, network);
    setKeypair(kp);
    setActiveAccountId(accountId);
    void refreshVaultAccounts();
  }

  async function handleSwitchAccount(accountId: string) {
    if (!keypair || accountId === activeAccountId) return;
    setAccountBusy(true);
    setError(null);
    setPublicXlm(0n);
    setPublicStables([]);
    setAccountOnChain(null);
    setTokenRegistry(null);
    useShieldedStore.getState().setNotes([]);
    useShieldedStore.getState().setShieldedBalance(0n);
    setTab("home");
    try {
      await switchWalletAccount(accountId, network);
      setActiveAccountId(accountId);
      setKeypair(getActiveKeypair());
      await refreshAll();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not switch account");
    } finally {
      setAccountBusy(false);
    }
  }

  async function handleFundAccount() {
    const fundWallet =
      vaultAccounts.find((a) => a.id === activeAccountId)?.publicKey ?? wallet;
    if (!fundWallet) return;
    setFundingAccount(true);
    setError(null);
    try {
      await runWithOverlay("Funding with Friendbot…", async () => {
        await fundTestnetAccount(fundWallet, network);
        await refreshAll();
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Friendbot failed");
    } finally {
      setFundingAccount(false);
    }
  }

  async function handleAddAccount() {
    setAccountBusy(true);
    setError(null);
    try {
      await runWithOverlay("Adding account…", async () => {
        const { accountId } = await createAdditionalAccount(network);
        setActiveAccountId(accountId);
        setKeypair(getActiveKeypair());
        await refreshVaultAccounts();
        setTab("home");
        await refreshAll();
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not add account");
    } finally {
      setAccountBusy(false);
    }
  }

  function lock() {
    lockWalletSession();
    setKeypair(null);
    setActiveAccountId("");
    setVaultAccounts([]);
    setTab("home");
    setMenuOpen(false);
    setLockDialogOpen(false);
  }

  async function runWithOverlay<T>(label: string, fn: () => Promise<T>): Promise<T> {
    setStatusOverlay(label);
    setError(null);
    try {
      return await fn();
    } finally {
      setStatusOverlay(null);
    }
  }

  if (!keypair) {
    return <Onboarding onUnlocked={onUnlocked} />;
  }

  const keys =
    spendingKey && viewingKey && viewingPub && ownerPk
      ? {
          spendingKey: BigInt(spendingKey),
          viewingPriv: BigInt(viewingKey),
          viewingPub,
          ownerPk,
        }
      : null;

  const activeAccount =
    vaultAccounts.find((a) => a.id === activeAccountId) ?? vaultAccounts[0];
  const displayWallet = activeAccount?.publicKey ?? wallet;
  const keysReady = keyMaterialAddress === displayWallet;
  const shieldedAddress =
    keysReady && ownerPk && viewingPub
      ? getShieldedReceiveAddress(network, ownerPk, viewingPub)
      : "";
  const hideSyncBanner =
    accountOnChain === false && syncError?.toLowerCase().includes("account not found");

  return (
    <div className="wallet-root">
      <WalletHeader
        left={
          <WalletMenu
            open={menuOpen}
            tab={tab}
            balanceMode={balanceMode}
            onOpen={() => setMenuOpen(true)}
            onClose={() => setMenuOpen(false)}
            onNavigate={setTab}
            onBalanceModeChange={setBalanceMode}
            onLockRequest={() => setLockDialogOpen(true)}
          />
        }
        center={
          vaultAccounts.length > 0 ? (
            <AccountSwitcher
              accounts={vaultAccounts}
              activeAccountId={activeAccountId || vaultAccounts[0].id}
              canAddAccount={canAddAccount}
              busy={accountBusy}
              onSelect={(accountId) => void handleSwitchAccount(accountId)}
              onAddAccount={() => void handleAddAccount()}
            />
          ) : null
        }
        right={
          <WalletHeaderActions
            network={network}
            balanceMode={balanceMode}
            publicAddress={displayWallet}
            shieldedAddress={shieldedAddress}
            keysReady={keysReady}
          />
        }
      />

      <main className="wallet-main">
        {error ? <p className="alert-banner alert-banner--error">{error}</p> : null}
        {syncError && !hideSyncBanner ? (
          <p className="alert-banner alert-banner--warn">{syncError}</p>
        ) : null}
        {!relayerOk ? (
          <p className="alert-banner alert-banner--warn">Relayer offline — private sends may fail</p>
        ) : null}

        {tab === "home" ? (
          <HomeScreen
            accountOnChain={accountOnChain}
            mode={balanceMode}
            reveal={revealBalances}
            onToggleReveal={() => useShieldedStore.getState().setRevealBalances(!revealBalances)}
            publicXlm={publicXlm}
            publicStables={publicStables}
            noteGroups={noteGroups}
            syncing={syncRefreshing}
            onRefresh={() => void refreshAll()}
            onOpenFaucet={() => setTab("faucet")}
            onOpenShield={() => setTab("shield")}
            onFundAccount={() => void handleFundAccount()}
            fundingAccount={fundingAccount}
          />
        ) : null}

        {tab === "shield" && keys ? (
          <ShieldTab
            wallet={wallet}
            keys={keys}
            network={network}
            publicStables={publicStables}
            routeCursor={routeCursor}
            onShield={async (tokenId, amountStr) => {
              const token = publicStables.find((t) => t.contractId === tokenId);
              const amount = parseAmount(amountStr, token?.decimals ?? 7);
              const txId = crypto.randomUUID();
              addTxRecord(wallet, {
                id: txId,
                walletAddress: wallet,
                type: "shield",
                status: "pending",
                amount: `${amountStr} ${token?.symbol ?? ""}`,
                createdAt: new Date().toISOString(),
              });
              try {
                await runWithOverlay("Shielding…", async () => {
                  const result = await runShield(
                    wallet,
                    keys,
                    network,
                    tokenId,
                    amount,
                    routeCursor,
                    setStatusOverlay
                  );
                  updateTxRecord(wallet, txId, {
                    status: "confirmed",
                    txHash: result.txHash,
                  });
                  await refreshPublic();
                });
              } catch (e) {
                updateTxRecord(wallet, txId, { status: "failed" });
                setError(e instanceof Error ? e.message : "Shield failed");
              }
            }}
          />
        ) : null}

        {tab === "send" && keys ? (
          <SendTab
            noteGroups={noteGroups}
            onSend={async (mode, tokenField, amountStr, recipient, decimals, symbol) => {
              const amount = parseAmount(amountStr, decimals);
              const txId = crypto.randomUUID();
              const type = mode === "private" ? "transfer" : "unshield";
              addTxRecord(wallet, {
                id: txId,
                walletAddress: wallet,
                type,
                status: "pending",
                amount: `${amountStr} ${symbol}`,
                createdAt: new Date().toISOString(),
              });
              try {
                await runWithOverlay(
                  mode === "private" ? "Private transfer…" : "Withdrawing…",
                  async () => {
                    if (mode === "private") {
                      const result = await runPrivateTransfer({
                        wallet,
                        keys,
                        network,
                        amount,
                        recipientInput: recipient,
                        tokenField,
                        notes: unspent,
                        merkleLeaves,
                        routeCursor,
                        onStatus: setStatusOverlay,
                      });
                      updateTxRecord(wallet, txId, {
                        status: "confirmed",
                        txHash: result.txHash ?? undefined,
                      });
                    } else {
                      const result = await runUnshield({
                        wallet,
                        keys,
                        network,
                        amount,
                        recipient,
                        tokenField,
                        notes: unspent,
                        merkleLeaves,
                        routeCursor,
                        onStatus: setStatusOverlay,
                      });
                      updateTxRecord(wallet, txId, {
                        status: "confirmed",
                        txHash: result.txHash ?? undefined,
                      });
                      await refreshPublic();
                    }
                  }
                );
              } catch (e) {
                updateTxRecord(wallet, txId, { status: "failed" });
                setError(e instanceof Error ? e.message : "Transaction failed");
              }
            }}
          />
        ) : null}

        {tab === "receive" && ownerPk && viewingPub ? (
          <ReceiveTab
            wallet={wallet}
            shielded={getShieldedReceiveAddress(network, ownerPk, viewingPub)}
          />
        ) : null}

        {tab === "activity" ? <ActivityScreen transactions={transactions} /> : null}

        {tab === "keys" ? <KeysScreen wallet={wallet} network={network} /> : null}

        {tab === "faucet" ? (
          <FaucetScreen
            wallet={wallet}
            publicXlm={publicXlm}
            publicStables={publicStables}
            onFunded={refreshPublic}
            onMint={async (symbol) => {
              await runWithOverlay(`Minting ${symbol}…`, async () => {
                await mintTestStable(wallet, symbol, 100_0000000n);
                await refreshPublic();
              });
            }}
          />
        ) : null}
      </main>

      {["home", "shield", "send", "receive", "activity"].includes(tab) ? (
        <BottomNav tab={tab} onTab={setTab} />
      ) : null}

      <LockConfirmDialog
        open={lockDialogOpen}
        onCancel={() => setLockDialogOpen(false)}
        onConfirm={lock}
      />

      {statusOverlay ? (
        <div className="overlay-status" role="status" aria-live="polite">
          <div className="overlay-status__card">
            <strong>{statusOverlay}</strong>
            <p>This may take a minute while proofs are prepared.</p>
          </div>
        </div>
      ) : null}
    </div>
  );
}

function ShieldTab({
  publicStables,
  onShield,
}: {
  wallet: string;
  keys: NonNullable<ReturnType<typeof Object>>;
  network: NetworkName;
  publicStables: Array<{ symbol: string; contractId: string; decimals: number; balance: bigint }>;
  routeCursor: number;
  onShield: (tokenId: string, amount: string) => Promise<void>;
}) {
  const [tokenId, setTokenId] = useState(publicStables[0]?.contractId ?? "");
  const [amount, setAmount] = useState("");

  useEffect(() => {
    if (!tokenId && publicStables[0]) setTokenId(publicStables[0].contractId);
  }, [publicStables, tokenId]);

  return (
    <>
      <h2 className="screen-title">Shield</h2>
      <p className="screen-lead">
        Move public stablecoins into your private balance. This deposit is visible on-chain.
      </p>
      <span className="privacy-pill privacy-pill--public">Public deposit</span>

      <form
        className="form-stack mt-4"
        onSubmit={(e: FormEvent) => {
          e.preventDefault();
          void onShield(tokenId, amount);
        }}
      >
        <div className="field">
          <label htmlFor="shield-token">Token</label>
          <select id="shield-token" value={tokenId} onChange={(e) => setTokenId(e.target.value)}>
            {publicStables.map((t) => (
              <option key={t.contractId} value={t.contractId}>
                {t.symbol} — {formatTokenAmount(t.balance, t.decimals)} available
              </option>
            ))}
          </select>
        </div>
        <div className="field">
          <label htmlFor="shield-amount">Amount</label>
          <input
            id="shield-amount"
            inputMode="decimal"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            placeholder="0.00"
            required
          />
        </div>
        <Button type="submit" fullWidth>
          Shield funds
        </Button>
      </form>
    </>
  );
}

function SendTab({
  noteGroups,
  onSend,
}: {
  noteGroups: Array<ReturnType<typeof groupUnspentNotesByToken>[number] & { symbol: string }>;
  onSend: (
    mode: SendMode,
    tokenField: string,
    amount: string,
    recipient: string,
    decimals: number,
    symbol: string
  ) => Promise<void>;
}) {
  const [mode, setMode] = useState<SendMode>("private");
  const [tokenField, setTokenField] = useState<`0x${string}` | "">(noteGroups[0]?.token ?? "");
  const [amount, setAmount] = useState("");
  const [recipient, setRecipient] = useState("");

  const selected = noteGroups.find((g) => tokenKey(g.token) === tokenKey(tokenField));

  useEffect(() => {
    if (!tokenField && noteGroups[0]) setTokenField(noteGroups[0].token);
  }, [noteGroups, tokenField]);

  return (
    <div className="send-screen">
      <h2 className="screen-title">Send</h2>
      <SendModeToggle mode={mode} onModeChange={setMode} />
      <p className="screen-lead send-screen__lead">
        {mode === "private"
          ? "Send to a shielded address. Amount and recipient stay private on-chain."
          : "Withdraw to a public Stellar address. Recipient and amount are visible on-chain."}
      </p>
      <span
        className={`privacy-pill ${mode === "private" ? "privacy-pill--private" : "privacy-pill--public"}`}
      >
        {mode === "private" ? "Private transfer" : "Public withdrawal"}
      </span>

      <form
        className="form-stack mt-4"
        onSubmit={(e: FormEvent) => {
          e.preventDefault();
          if (!selected) return;
          void onSend(mode, selected.token, amount, recipient, 7, selected.symbol);
        }}
      >
        <div className="field">
          <label htmlFor="send-token">Asset</label>
          <select
            id="send-token"
            value={tokenField}
            onChange={(e) => setTokenField(e.target.value)}
          >
            {noteGroups.map((g) => (
              <option key={tokenKey(g.token)} value={g.token}>
                {g.symbol} — {formatTokenAmount(g.totalAmount, 7)} private
              </option>
            ))}
          </select>
        </div>
        <div className="field">
          <label htmlFor="send-amount">Amount</label>
          <input
            id="send-amount"
            inputMode="decimal"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            required
          />
        </div>
        <div className="field">
          <label htmlFor="send-recipient">
            {mode === "private" ? "Shielded address (shd_…)" : "Stellar address (G…)"}
          </label>
          <input
            id="send-recipient"
            value={recipient}
            onChange={(e) => setRecipient(e.target.value)}
            placeholder={mode === "private" ? "shd_…" : "G…"}
            required
          />
        </div>
        <Button type="submit" fullWidth disabled={noteGroups.length === 0}>
          {mode === "private" ? "Send privately" : "Withdraw"}
        </Button>
      </form>
    </div>
  );
}

function ReceiveTab({ wallet, shielded }: { wallet: string; shielded: string }) {
  return (
    <>
      <h2 className="screen-title">Receive</h2>
      <p className="screen-lead">Share your shielded address for private payments.</p>
      <CopyField id="receive-shielded" label="Shielded address" value={shielded} />
      <CopyField
        id="receive-public"
        label="Public Stellar address"
        value={wallet}
        hint="Public deposits are visible on-chain."
      />
    </>
  );
}
