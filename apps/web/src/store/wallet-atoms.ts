import { atomWithStorage } from "jotai/utils";

/** Persisted wallet address — survives reload until user disconnects. */
export const walletAddressAtom = atomWithStorage<string | null>("stellar-shielded-wallet", null);
