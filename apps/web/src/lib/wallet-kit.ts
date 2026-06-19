import {
  StellarWalletsKit,
  Networks,
  KitEventType,
} from "@creit.tech/stellar-wallets-kit";
import albedoImport from "@albedo-link/intent";

import { applyLocalWalletIcons } from "./wallet-icons";
import {
  ALBEDO_ID,
  createWalletModules,
  isMobileWalletDevice,
} from "./wallet-modules";
import { formatWalletError, isUnsupportedNetworkQueryError } from "./wallet-error";
import type { NetworkConfig, NetworkName } from "./types";

const albedo = albedoImport.default;

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
      modules: applyLocalWalletIcons(createWalletModules()),
    });
    initialized = true;
    return;
  }
  StellarWalletsKit.setNetwork(kitNetwork);
}

export async function connectWallet(): Promise<string> {
  const { address } = await StellarWalletsKit.authModal();
  if (!address || typeof address !== "string") throw new Error("No wallet address returned");
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

/**
 * Freighter supports getNetwork(); Albedo/xBull/Lobstr do not — skip instead of failing connect.
 */
export async function ensureWalletNetwork(config: NetworkConfig): Promise<void> {
  try {
    const net = await StellarWalletsKit.getNetwork();
    if (net.networkPassphrase !== config.networkPassphrase) {
      throw new Error(
        `Wallet network mismatch. Switch your wallet to match ${config.networkPassphrase.split(";")[0].trim()}`
      );
    }
  } catch (error) {
    if (isUnsupportedNetworkQueryError(error)) return;
    throw error;
  }
}

/**
 * On mobile Albedo, grant implicit tx/sign_message permissions during connect so later
 * shield approvals can use iframe transport instead of blocked popups.
 */
export async function grantMobileWalletSigningSession(address: string): Promise<void> {
  if (!isMobileWalletDevice()) return;
  if (StellarWalletsKit.selectedModule?.productId !== ALBEDO_ID) return;
  try {
    await albedo.implicitFlow({
      intents: ["tx", "sign_message"],
      pubkey: address,
    });
  } catch {
    /* optional — signing may still work via dialog */
  }
}

export function walletKitSigners(networkPassphrase: string) {
  return {
    signTransaction: async (xdr: string) => {
      const signed = await StellarWalletsKit.signTransaction(xdr, { networkPassphrase });
      return { signedTxXdr: signed.signedTxXdr };
    },
    signAuthEntry: async (preimage: string) => {
      try {
        const signed = await StellarWalletsKit.signAuthEntry(preimage, { networkPassphrase });
        return { signedAuthEntry: signed.signedAuthEntry };
      } catch (error) {
        if (formatWalletError(error).toLowerCase().includes("signauthentry")) {
          throw new Error("This wallet cannot sign token approvals — use Freighter on desktop");
        }
        throw error;
      }
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

export { formatWalletError } from "./wallet-error";
export { isMobileWalletDevice, isXBullInAppBrowser } from "./wallet-modules";
