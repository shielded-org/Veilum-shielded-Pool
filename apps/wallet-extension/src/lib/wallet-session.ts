import { Keypair } from "@stellar/stellar-sdk";

import { ensureAspMembership } from "../lib/asp";
import { loadNetworkConfig } from "../lib/config";
import { fundWithFriendbot, getNativeXlmBalance, isAccountOnChain } from "../lib/friendbot";
import { groupUnspentNotesByToken, pickNoteForTransfer, tokenKey } from "../lib/note-groups";
import { fetchRelayerHealth, requestFaucetMint } from "../lib/relayer";
import {
  NETWORK_IDS,
  encodeShieldedAddress,
  parseRecipientInput,
} from "../lib/shielded-address";
import {
  executePrivateTransfer,
  executeShieldDeposit,
  executeUnshield,
} from "../lib/shield-ops";
import { getTokenBalance } from "../lib/soroban";
import { createRpc } from "../lib/soroban";
import { listStableTokens } from "../lib/tokens";
import type { DecryptedNote, NetworkName, ShieldedKeys, TransactionRecord } from "../lib/types";
import { formatTokenAmount, parseTokenAmount } from "../lib/utils";
import {
  finishShieldedTransaction,
  invalidateShieldedSync,
  recoverBalanceFromChain,
  syncShieldedWalletNow,
} from "../lib/sync-shielded-now";
import { useShieldedStore } from "../store/use-shielded-store";
import { loadShieldIdentity } from "../vault/shield-keys";
import {
  addDerivedAccount,
  hasStoredMnemonic,
  nextDerivationIndexForMnemonic,
  readMnemonic,
  unlockAccount,
} from "../vault/storage";
import {
  clearSessionPassword,
  getSessionPassword,
  setActiveKeypair,
  setSessionPassword,
} from "../vault/session";

export function shortAddress(addr: string): string {
  return `${addr.slice(0, 4)}…${addr.slice(-4)}`;
}

export async function unlockWalletSession(
  keypair: Keypair,
  network: NetworkName
): Promise<ShieldedKeys & { address: string }> {
  setActiveKeypair(keypair);
  const identity = await loadShieldIdentity(keypair.secret(), keypair.publicKey());
  useShieldedStore.getState().setKeys({
    spendingKey: identity.spendingKey,
    viewingPriv: identity.viewingPriv,
    viewingPub: identity.viewingPub,
    ownerPk: identity.ownerPk,
    address: identity.address,
  });
  useShieldedStore.getState().setNetwork(network);
  return identity;
}

export function lockWalletSession(): void {
  setActiveKeypair(null);
  clearSessionPassword();
  useShieldedStore.getState().resetWalletSession();
}

/** Switch to another HD account from the same vault (session password required). */
export async function switchWalletAccount(accountId: string, network: NetworkName): Promise<string> {
  const password = getSessionPassword();
  if (!password) throw new Error("Session expired — unlock your wallet again");

  const keypair = await unlockAccount(accountId, password);
  setActiveKeypair(keypair);
  useShieldedStore.getState().resetWalletSession();
  await unlockWalletSession(keypair, network);
  invalidateShieldedSync();
  return keypair.publicKey();
}

/** Derive the next account from the stored recovery phrase. */
export async function createAdditionalAccount(network: NetworkName): Promise<{
  accountId: string;
  publicKey: string;
}> {
  const password = getSessionPassword();
  if (!password) throw new Error("Unlock your wallet first");

  if (!(await hasStoredMnemonic())) {
    throw new Error(
      "This wallet was imported without a recovery phrase — add accounts by importing another key"
    );
  }

  const mnemonic = await readMnemonic(password);
  if (!mnemonic) {
    throw new Error("Could not read recovery phrase — unlock again and retry");
  }

  const derivationIndex = await nextDerivationIndexForMnemonic(mnemonic);
  const { id } = await addDerivedAccount(mnemonic, password, derivationIndex);
  const publicKey = await switchWalletAccount(id, network);
  return { accountId: id, publicKey };
}

export async function syncWalletBalances(
  _wallet: string,
  _network: NetworkName,
  opts?: { postTx?: boolean; background?: boolean }
) {
  if (opts?.postTx) {
    await syncShieldedWalletNow({ postTx: true, bustIndexerCache: true });
    return;
  }
  await syncShieldedWalletNow({
    background: opts?.background ?? true,
    initial: opts?.background === false,
    bustIndexerCache: opts?.background === false,
  });
}

export { syncShieldedWalletNow, finishShieldedTransaction, recoverBalanceFromChain };

export async function loadPublicBalances(wallet: string, network: NetworkName) {
  const config = await loadNetworkConfig(network);
  const horizonUrl = config.horizonUrl;
  const onChain = horizonUrl ? await isAccountOnChain(horizonUrl, wallet) : false;

  if (!onChain) {
    const stables = listStableTokens(config.contracts).map((t) => ({
      symbol: t.symbol,
      contractId: t.contractId,
      decimals: t.decimals,
      balance: 0n,
    }));
    return { xlm: 0n, stables, onChain: false };
  }

  const rpc = createRpc(config);
  const xlm = await getNativeXlmBalance(horizonUrl!, wallet);
  const stables = await Promise.all(
    listStableTokens(config.contracts).map(async (t) => {
      try {
        const bal = await getTokenBalance(rpc, config, wallet, t.contractId, wallet);
        return { symbol: t.symbol, contractId: t.contractId, decimals: t.decimals, balance: bal };
      } catch {
        return { symbol: t.symbol, contractId: t.contractId, decimals: t.decimals, balance: 0n };
      }
    })
  );
  return { xlm, stables, onChain: true };
}

export async function fundTestnetAccount(wallet: string, network: NetworkName): Promise<string | undefined> {
  const config = await loadNetworkConfig(network);
  if (!config.friendbotUrl) throw new Error("Friendbot not available on this network");
  return fundWithFriendbot(config.friendbotUrl, wallet);
}

export async function mintTestStable(
  wallet: string,
  symbol: string,
  amount: bigint
): Promise<void> {
  const config = await loadNetworkConfig("testnet");
  const token = listStableTokens(config.contracts).find((t) => t.symbol === symbol);
  if (!token) throw new Error(`Token ${symbol} not deployed`);
  await requestFaucetMint({
    token: token.contractId,
    recipient: wallet,
    amount: amount.toString(),
  });
}

export async function checkRelayer(): Promise<boolean> {
  const health = await fetchRelayerHealth();
  useShieldedStore.getState().setRelayerOk(health.ok);
  return health.ok;
}

export async function ensureAspForWallet(ownerPk: string, wallet: string, tokenContractId: string) {
  await ensureAspMembership(ownerPk as `0x${string}`, wallet, tokenContractId);
}

export function getShieldedReceiveAddress(
  network: NetworkName,
  ownerPk: string,
  viewingPub: string
): string {
  return encodeShieldedAddress({
    network: network,
    ownerPk: ownerPk as `0x${string}`,
    viewingPub: viewingPub as `0x${string}`,
  });
}

export async function runShield(
  wallet: string,
  keys: ShieldedKeys,
  network: NetworkName,
  tokenContractId: string,
  amount: bigint,
  routeCursor: number,
  onStatus: (msg: string) => void
) {
  const config = await loadNetworkConfig(network);
  if (config.contracts.aspEnforceShield) {
    onStatus("Checking pool access…");
    await ensureAspMembership(keys.ownerPk as `0x${string}`, wallet, tokenContractId);
  }
  const result = await executeShieldDeposit({
    config,
    wallet,
    keys,
    amount,
    tokenContractId,
    routeCursor,
    onStatus,
  });
  const store = useShieldedStore.getState();
  store.addNote(result.note);
  store.bumpRouteCursor();
  await finishShieldedTransaction({ onStatus });
  return result;
}

export async function runPrivateTransfer(params: {
  wallet: string;
  keys: ShieldedKeys;
  network: NetworkName;
  amount: bigint;
  recipientInput: string;
  tokenField: string;
  notes: DecryptedNote[];
  merkleLeaves: `0x${string}`[];
  routeCursor: number;
  onStatus: (msg: string) => void;
}) {
  const groups = groupUnspentNotesByToken(params.notes);
  const group = groups.find((g) => tokenKey(g.token) === tokenKey(params.tokenField));
  if (!group) throw new Error("No notes for selected token");
  const note = pickNoteForTransfer(group, params.amount);
  if (!note) throw new Error("Amount exceeds available private balance");

  const recipient = parseRecipientInput(params.recipientInput);
  if (recipient.networkId != null && recipient.networkId !== NETWORK_IDS[params.network]) {
    throw new Error("Recipient shielded address is for a different network");
  }

  const config = await loadNetworkConfig(params.network);
  const result = await executePrivateTransfer({
    config,
    wallet: params.wallet,
    keys: params.keys,
    note,
    recipientOwnerPk: recipient.ownerPk,
    recipientViewingPub: recipient.viewingPub,
    sendAmount: params.amount,
    leaves: params.merkleLeaves,
    senderRouteCursor: params.routeCursor,
    recipientRouteCursor: 0,
    onStatus: params.onStatus,
  });

  const store = useShieldedStore.getState();
  store.markNoteSpent(note.id);
  if (result.changeNote) store.addNote(result.changeNote);
  store.bumpRouteCursor();
  await finishShieldedTransaction({
    spentNoteId: note.id,
    syncMerkle: true,
    onStatus: params.onStatus,
  });
  return result;
}

export async function runUnshield(params: {
  wallet: string;
  keys: ShieldedKeys;
  network: NetworkName;
  amount: bigint;
  recipient: string;
  tokenField: string;
  notes: DecryptedNote[];
  merkleLeaves: `0x${string}`[];
  routeCursor: number;
  onStatus: (msg: string) => void;
}) {
  const groups = groupUnspentNotesByToken(params.notes);
  const group = groups.find((g) => tokenKey(g.token) === tokenKey(params.tokenField));
  if (!group) throw new Error("No notes for selected token");
  const note = pickNoteForTransfer(group, params.amount);
  if (!note) throw new Error("Amount exceeds available private balance");

  const config = await loadNetworkConfig(params.network);
  if (config.contracts.aspEnforceShield) {
    params.onStatus("Checking pool access…");
    await ensureAspMembership(params.keys.ownerPk as `0x${string}`, params.wallet);
  }

  const result = await executeUnshield({
    config,
    wallet: params.wallet,
    keys: params.keys,
    note,
    recipientAddress: params.recipient,
    amount: params.amount,
    leaves: params.merkleLeaves,
    routeCursor: params.routeCursor,
    onStatus: params.onStatus,
  });

  const store = useShieldedStore.getState();
  store.markNoteSpent(note.id);
  if (result.changeNote) store.addNote(result.changeNote);
  store.bumpRouteCursor();
  await finishShieldedTransaction({
    spentNoteId: note.id,
    syncMerkle: true,
    onStatus: params.onStatus,
  });
  return result;
}

export function addTxRecord(wallet: string, tx: TransactionRecord) {
  useShieldedStore.getState().addTransaction(wallet, tx);
}

export function updateTxRecord(wallet: string, id: string, patch: Partial<TransactionRecord>) {
  useShieldedStore.getState().updateTransaction(wallet, id, patch);
}

export function unspentNotes(notes: DecryptedNote[]): DecryptedNote[] {
  return notes.filter((n) => !n.spent);
}

export function formatStable(amount: bigint, decimals = 7): string {
  return formatTokenAmount(amount, decimals);
}

export function parseAmount(input: string, decimals = 7): bigint {
  return parseTokenAmount(input, decimals);
}
