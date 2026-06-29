import type { Keypair } from "@stellar/stellar-sdk";
import { basicNodeSigner } from "@stellar/stellar-sdk/contract";

let activeKeypair: Keypair | null = null;
let sessionPassword: string | null = null;

export function setActiveKeypair(keypair: Keypair | null): void {
  activeKeypair = keypair;
}

export function setSessionPassword(password: string | null): void {
  sessionPassword = password;
}

export function getSessionPassword(): string | null {
  return sessionPassword;
}

export function clearSessionPassword(): void {
  sessionPassword = null;
}

export function getActiveKeypair(): Keypair {
  if (!activeKeypair) throw new Error("Wallet is locked");
  return activeKeypair;
}

export function getActivePublicKey(): string | null {
  return activeKeypair?.publicKey() ?? null;
}

export function extensionSigners(networkPassphrase: string) {
  const keypair = getActiveKeypair();
  return basicNodeSigner(keypair, networkPassphrase);
}
