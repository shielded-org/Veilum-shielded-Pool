import { useAtom } from "jotai";
import { useCallback } from "react";

import { walletAddressAtom } from "../store/wallet-atoms";

export function useWallet() {
  const [address, setAddress] = useAtom(walletAddressAtom);

  const connect = useCallback((addr: string) => {
    setAddress(addr);
  }, [setAddress]);

  const disconnect = useCallback(() => {
    setAddress(null);
  }, [setAddress]);

  return { address, connect, disconnect, setAddress };
}
