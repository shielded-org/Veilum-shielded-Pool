import { Keypair } from "@stellar/stellar-sdk";

import { decryptText, encryptText } from "./crypto";
import { getChromeStorageLocal } from "./chrome-storage";

const VAULT_ACCOUNTS_KEY = "veilum.vault.accounts.v1";
const VAULT_MNEMONIC_KEY = "veilum.vault.mnemonic.v1";
const VAULT_LAST_ACCOUNT_KEY = "veilum.vault.lastAccountId.v1";

export type EncryptedBlob = { salt: string; iv: string; ciphertext: string };

export type VaultAccount = {
  id: string;
  name: string;
  publicKey: string;
  encryptedSecret: EncryptedBlob;
  kind: "created" | "imported" | "derived";
  derivationIndex?: number;
};

async function storageGet<T>(key: string): Promise<T | null> {
  const storage = getChromeStorageLocal();
  const result = await storage.get(key);
  const raw = result[key];
  if (raw == null) return null;
  return raw as T;
}

async function storageSet(key: string, value: unknown): Promise<void> {
  await getChromeStorageLocal().set({ [key]: value });
}

async function storageRemove(key: string): Promise<void> {
  await getChromeStorageLocal().remove(key);
}

async function readAccounts(): Promise<VaultAccount[]> {
  return (await storageGet<VaultAccount[]>(VAULT_ACCOUNTS_KEY)) ?? [];
}

async function writeAccounts(accounts: VaultAccount[]): Promise<void> {
  await storageSet(VAULT_ACCOUNTS_KEY, accounts);
}

async function loadHdWallet() {
  const mod = await import("stellar-hd-wallet");
  return mod.default;
}

export type VaultAccountSummary = {
  id: string;
  name: string;
  publicKey: string;
  derivationIndex?: number;
};

export async function listVaultAccounts(): Promise<VaultAccountSummary[]> {
  const accounts = await readAccounts();
  return accounts.map((a) => ({
    id: a.id,
    name: a.name,
    publicKey: a.publicKey,
    derivationIndex: a.derivationIndex,
  }));
}

/** Next unused HD index — scans derived pubkeys so legacy accounts without index still work. */
export async function nextDerivationIndexForMnemonic(mnemonic: string): Promise<number> {
  const accounts = await readAccounts();
  const existingKeys = new Set(accounts.map((a) => a.publicKey));
  let index = 0;
  while (index < 256) {
    const keypair = await keypairFromMnemonic(mnemonic, index);
    if (!existingKeys.has(keypair.publicKey())) return index;
    index += 1;
  }
  throw new Error("Too many accounts for this recovery phrase");
}

/** @deprecated Prefer nextDerivationIndexForMnemonic when the mnemonic is available. */
export async function nextDerivationIndex(): Promise<number> {
  const accounts = await readAccounts();
  const used = new Set(
    accounts
      .map((a) => a.derivationIndex)
      .filter((index): index is number => index != null && index >= 0)
  );
  let index = 0;
  while (used.has(index)) index += 1;
  return index;
}

export async function hasStoredMnemonic(): Promise<boolean> {
  return (await storageGet<EncryptedBlob>(VAULT_MNEMONIC_KEY)) != null;
}

export async function getLastAccountId(): Promise<string | null> {
  return storageGet<string>(VAULT_LAST_ACCOUNT_KEY);
}

export async function findAccountByPublicKey(publicKey: string): Promise<VaultAccount | null> {
  const accounts = await readAccounts();
  return accounts.find((a) => a.publicKey === publicKey) ?? null;
}

export async function hasVault(): Promise<boolean> {
  try {
    const accounts = await readAccounts();
    return accounts.length > 0;
  } catch {
    return false;
  }
}

export async function storeKeypair(
  keypair: Keypair,
  password: string,
  opts?: { mnemonic?: string; name?: string; kind?: VaultAccount["kind"]; derivationIndex?: number }
): Promise<string> {
  const accounts = await readAccounts();
  const existing = accounts.find((a) => a.publicKey === keypair.publicKey());
  if (existing) return existing.id;

  const encryptedSecret = await encryptText(keypair.secret(), password);
  const id = crypto.randomUUID();
  const account: VaultAccount = {
    id,
    name: opts?.name ?? `Account ${(opts?.derivationIndex ?? accounts.length) + 1}`,
    publicKey: keypair.publicKey(),
    encryptedSecret,
    kind: opts?.kind ?? "imported",
    derivationIndex: opts?.derivationIndex,
  };
  accounts.push(account);
  await writeAccounts(accounts);
  await storageSet(VAULT_LAST_ACCOUNT_KEY, id);

  if (opts?.mnemonic) {
    const encryptedMnemonic = await encryptText(opts.mnemonic, password);
    await storageSet(VAULT_MNEMONIC_KEY, encryptedMnemonic);
  }

  return id;
}

export async function addDerivedAccount(
  mnemonic: string,
  password: string,
  derivationIndex: number
): Promise<{ id: string; keypair: Keypair }> {
  const keypair = await keypairFromMnemonic(mnemonic, derivationIndex);
  const accounts = await readAccounts();
  if (accounts.some((a) => a.publicKey === keypair.publicKey())) {
    throw new Error(`Account ${derivationIndex + 1} is already in this vault`);
  }
  const id = await storeKeypair(keypair, password, {
    kind: "derived",
    derivationIndex,
    name: `Account ${derivationIndex + 1}`,
  });
  return { id, keypair };
}

export async function keypairFromMnemonic(mnemonic: string, index = 0): Promise<Keypair> {
  const StellarHDWallet = await loadHdWallet();
  const wallet = StellarHDWallet.fromMnemonic(mnemonic.trim());
  return wallet.getKeypair(index);
}

export async function generateMnemonic(): Promise<string> {
  const StellarHDWallet = await loadHdWallet();
  return StellarHDWallet.generateMnemonic();
}

export async function unlockAccount(accountId: string, password: string): Promise<Keypair> {
  const accounts = await readAccounts();
  const account = accounts.find((a) => a.id === accountId);
  if (!account) throw new Error("Account not found");
  const secret = await decryptText(account.encryptedSecret, password);
  await storageSet(VAULT_LAST_ACCOUNT_KEY, accountId);
  return Keypair.fromSecret(secret);
}

export async function unlockLastAccount(password: string): Promise<{ id: string; keypair: Keypair }> {
  const lastId = await storageGet<string>(VAULT_LAST_ACCOUNT_KEY);
  const accounts = await readAccounts();
  const targetId = lastId && accounts.some((a) => a.id === lastId) ? lastId : accounts[0]?.id;
  if (!targetId) throw new Error("No wallet accounts");
  const keypair = await unlockAccount(targetId, password);
  return { id: targetId, keypair };
}

export async function readMnemonic(password: string): Promise<string | null> {
  const blob = await storageGet<EncryptedBlob>(VAULT_MNEMONIC_KEY);
  if (!blob) return null;
  return decryptText(blob, password);
}

export async function clearVault(): Promise<void> {
  await storageRemove(VAULT_ACCOUNTS_KEY);
  await storageRemove(VAULT_MNEMONIC_KEY);
  await storageRemove(VAULT_LAST_ACCOUNT_KEY);
}
