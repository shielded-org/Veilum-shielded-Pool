import { getBrowserPoseidonHasher, deriveOwnerPk } from "../lib/hasher";
import { deriveUserKeys, keySeedFromStellarSecret, viewingPrivToPub } from "../lib/keys";
import type { Hex32, ShieldedKeys } from "../lib/types";

export async function deriveShieldKeysFromSecret(secretKey: string): Promise<ShieldedKeys> {
  const seed = await keySeedFromStellarSecret(secretKey);
  const { spendingKey, viewingPriv } = await deriveUserKeys(seed, "owner");
  const hasher = await getBrowserPoseidonHasher();
  const ownerPk = await deriveOwnerPk(hasher, spendingKey);
  const viewingPub = viewingPrivToPub(viewingPriv);
  return {
    spendingKey,
    viewingPriv,
    viewingPub,
    ownerPk,
  };
}

export type LoadedShieldIdentity = ShieldedKeys & { address: string };

export async function loadShieldIdentity(
  secretKey: string,
  publicKey: string
): Promise<LoadedShieldIdentity> {
  const keys = await deriveShieldKeysFromSecret(secretKey);
  return { ...keys, address: publicKey };
}
