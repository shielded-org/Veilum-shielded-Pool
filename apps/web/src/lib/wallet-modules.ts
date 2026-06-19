import albedoImport from "@albedo-link/intent";
import {
  AlbedoModule,
  ALBEDO_ID,
} from "@creit.tech/stellar-wallets-kit/modules/albedo";
import { xBullModule, XBULL_ID } from "@creit.tech/stellar-wallets-kit/modules/xbull";
import { defaultModules } from "@creit.tech/stellar-wallets-kit/modules/utils";
import { parseError } from "@creit.tech/stellar-wallets-kit/sdk";
import { xBullWalletConnect } from "@creit.tech/xbull-wallet-connect";

const albedo = albedoImport.default;

export function isMobileWalletDevice(): boolean {
  if (typeof navigator === "undefined") return false;
  return /Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent);
}

export function isXBullInAppBrowser(): boolean {
  if (typeof window === "undefined") return false;
  const w = window as Window & {
    webkit?: { messageHandlers?: { cordova_iab?: unknown } };
    xBullSDK?: unknown;
  };
  return Boolean(w.webkit?.messageHandlers?.cordova_iab || w.xBullSDK);
}

function xBullBridgeOptions() {
  if (isXBullInAppBrowser()) {
    return { preferredTarget: "extension" as const };
  }
  if (isMobileWalletDevice()) {
    return { preferredTarget: "website" as const };
  }
  return { preferredTarget: "extension" as const };
}

function createXBullBridge() {
  return new xBullWalletConnect(xBullBridgeOptions());
}

/** Albedo supports signMessage via its intent API (not SEP-43). */
export class MobileAwareAlbedoModule extends AlbedoModule {
  override async signMessage(message: string, opts?: { address?: string }) {
    try {
      const result = await albedo.signMessage({
        message,
        pubkey: opts?.address,
      });
      const signedMessage = result.message_signature ?? result.signed_message;
      if (!signedMessage) throw new Error("Albedo did not return a signature");
      return { signedMessage, signerAddress: result.pubkey ?? opts?.address };
    } catch (e) {
      throw parseError(e);
    }
  }
}

/** xBull bridge tuned for mobile Safari vs in-app browser. */
export class MobileAwareXBullModule extends xBullModule {
  override async getAddress() {
    try {
      const bridge = createXBullBridge();
      const publicKey = await bridge.connect();
      bridge.closeConnections();
      return { address: publicKey };
    } catch (e) {
      throw parseError(e);
    }
  }

  override async signTransaction(
    xdr: string,
    opts?: { address?: string; networkPassphrase?: string }
  ) {
    try {
      const bridge = createXBullBridge();
      const signedXdr = await bridge.sign({
        xdr,
        publicKey: opts?.address,
        network: opts?.networkPassphrase,
      });
      bridge.closeConnections();
      return { signedTxXdr: signedXdr, signerAddress: opts?.address };
    } catch (e) {
      throw parseError(e);
    }
  }

  override async signMessage(
    message: string,
    opts?: { address?: string; networkPassphrase?: string }
  ) {
    try {
      const bridge = createXBullBridge();
      const result = await bridge.signMessage(message, {
        address: opts?.address,
        networkPassphrase: opts?.networkPassphrase,
      });
      bridge.closeConnections();
      return result;
    } catch (e) {
      throw parseError(e);
    }
  }
}

export function createWalletModules() {
  return defaultModules().map((mod) => {
    if (mod.productId === ALBEDO_ID) return new MobileAwareAlbedoModule();
    if (mod.productId === XBULL_ID) return new MobileAwareXBullModule();
    return mod;
  });
}

export { ALBEDO_ID, XBULL_ID };
