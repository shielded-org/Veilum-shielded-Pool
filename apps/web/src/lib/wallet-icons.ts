import { defaultModules } from "@creit.tech/stellar-wallets-kit/modules/utils";

type WalletModule = ReturnType<typeof defaultModules>[number];

/** Same-origin icons — required because dev COEP blocks cross-origin wallet logos. */
const LOCAL_WALLET_ICONS: Record<string, string> = {
  albedo: "/wallet-icons/albedo.png",
  freighter: "/wallet-icons/freighter.png",
  fordefi: "/wallet-icons/fordefi.png",
  xbull: "/wallet-icons/xbull.png",
  lobstr: "/wallet-icons/lobstr.png",
  rabet: "/wallet-icons/rabet.png",
  hana: "/wallet-icons/hana.png",
  klever: "/wallet-icons/klever.png",
  bitget: "/wallet-icons/bitget.png",
  cactuslink: "/wallet-icons/cactuslink.png",
  onekey: "/wallet-icons/onekey.png",
};

export function applyLocalWalletIcons(modules: WalletModule[]): WalletModule[] {
  for (const mod of modules) {
    const local = LOCAL_WALLET_ICONS[mod.productId];
    if (local) mod.productIcon = local;
  }
  return modules;
}
