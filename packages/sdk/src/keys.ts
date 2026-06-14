import { createHash } from "node:crypto";

import { BN254_FIELD_MODULUS } from "./types.js";

const SECP256K1_ORDER = 0xfffffffffffffffffffffffffffffffebaaedce6af48a03bbfd25e8cd0364141n;

export function normalizeSeedToBytes32(seedInput: string): string {
  if (/^0x[0-9a-fA-F]{64}$/.test(seedInput)) return seedInput;
  if (seedInput.startsWith("0x")) {
    return `0x${seedInput.slice(2).padStart(64, "0")}`;
  }
  const digest = createHash("sha256").update(seedInput).digest("hex");
  return `0x${digest}`;
}

export function deriveDeterministicScalar(seedBytes32: string, label: string, modulus: bigint): bigint {
  const digest = createHash("sha256")
    .update("stellar-shielded-key-v1")
    .update(Buffer.from(seedBytes32.replace(/^0x/, ""), "hex"))
    .update(label)
    .digest("hex");
  return (BigInt(`0x${digest}`) % (modulus - 1n)) + 1n;
}

export function buildDeterministicUsers(seedBytes32: string) {
  const names = ["owner", "taiwo", "userC", "userD"];
  const users: Record<string, { spendingKey: bigint; viewingPriv: bigint }> = {};
  for (const name of names) {
    users[name] = {
      spendingKey: deriveDeterministicScalar(seedBytes32, `${name}:spending`, BN254_FIELD_MODULUS),
      viewingPriv: deriveDeterministicScalar(seedBytes32, `${name}:viewing`, SECP256K1_ORDER),
    };
  }
  return users;
}
