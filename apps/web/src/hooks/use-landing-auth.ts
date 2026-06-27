import { useAtomValue } from "jotai";

import { marketingBrowseAtom } from "../store/session-atoms";
import { useWalletConnection } from "./use-wallet-connection";

export function useLandingAuth() {
  const marketingBrowse = useAtomValue(marketingBrowseAtom);
  const auth = useWalletConnection();

  const returnToDashboard = {
    label: marketingBrowse ? "Return to dashboard" : "Open dashboard",
  };

  return {
    ...auth,
    marketingBrowse,
    returnToDashboard,
  };
}
