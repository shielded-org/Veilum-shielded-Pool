import {
  StellarWalletsKit,
  Networks,
  KitEventType,
} from "@creit.tech/stellar-wallets-kit";
import { defaultModules } from "@creit.tech/stellar-wallets-kit/modules/utils";

import type { NetworkConfig, NetworkName } from "./types";

let initialized = false;

export function networkNameToKitNetwork(name: NetworkName): Networks {
  switch (name) {
    case "mainnet":
      return Networks.PUBLIC;
    case "futurenet":
      return Networks.FUTURENET;
    case "local":
      return Networks.STANDALONE;
    case "testnet":
    default:
      return Networks.TESTNET;
  }
}

export function passphraseToKitNetwork(passphrase: string): Networks {
  const known = Object.values(Networks) as string[];
  if (known.includes(passphrase)) return passphrase as Networks;
  if (passphrase.includes("Future")) return Networks.FUTURENET;
  if (passphrase.includes("Public Global")) return Networks.PUBLIC;
  if (passphrase.includes("Standalone")) return Networks.STANDALONE;
  if (passphrase.includes("Sandbox")) return Networks.SANDBOX;
  return Networks.TESTNET;
}

/** Initialize kit once; safe to call repeatedly when the app network changes. */
export function initWalletKit(network: NetworkName = "testnet"): void {
  const kitNetwork = networkNameToKitNetwork(network);
  if (!initialized) {
    StellarWalletsKit.init({
      network: kitNetwork,
      modules: defaultModules(),
    });
    initialized = true;
    return;
  }
  StellarWalletsKit.setNetwork(kitNetwork);
}

export async function connectWallet(): Promise<string> {
  const { address } = await StellarWalletsKit.authModal();
  if (!address) throw new Error("No wallet address returned");
  return address;
}

export async function getConnectedAddress(): Promise<string | null> {
  try {
    const { address } = await StellarWalletsKit.getAddress();
    return address || null;
  } catch {
    return null;
  }
}

export async function signWalletMessage(message: string, address: string): Promise<string> {
  const result = await StellarWalletsKit.signMessage(message, { address });
  if (!result?.signedMessage) throw new Error("Wallet did not return a signature");
  return result.signedMessage;
}

export async function ensureWalletNetwork(config: NetworkConfig): Promise<void> {
  const net = await StellarWalletsKit.getNetwork();
  if (net.networkPassphrase !== config.networkPassphrase) {
    throw new Error(
      `Wallet network mismatch. Switch your wallet to match ${config.networkPassphrase.split(";")[0].trim()}`
    );
  }
}

export function walletKitSigners(networkPassphrase: string) {
  return {
    signTransaction: async (xdr: string) => {
      const signed = await StellarWalletsKit.signTransaction(xdr, { networkPassphrase });
      return { signedTxXdr: signed.signedTxXdr };
    },
    signAuthEntry: async (preimage: string) => {
      const signed = await StellarWalletsKit.signAuthEntry(preimage, { networkPassphrase });
      return { signedAuthEntry: signed.signedAuthEntry };
    },
  };
}

export async function disconnectWalletKit(): Promise<void> {
  try {
    await StellarWalletsKit.disconnect();
  } catch {
    /* no active session */
  }
}

export function onWalletKitDisconnect(callback: () => void): () => void {
  return StellarWalletsKit.on(KitEventType.DISCONNECT, callback);
}
