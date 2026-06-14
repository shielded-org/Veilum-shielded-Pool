import type { Hex32 } from "./types";
import { BN254_FIELD_MODULUS } from "./types";

export function toHex32(value: bigint): Hex32 {
  const mod = ((value % BN254_FIELD_MODULUS) + BN254_FIELD_MODULUS) % BN254_FIELD_MODULUS;
  return `0x${mod.toString(16).padStart(64, "0")}` as Hex32;
}

export function parseHex32(hex: Hex32 | string): bigint {
  const clean = hex.replace(/^0x/, "");
  return BigInt(`0x${clean}`) % BN254_FIELD_MODULUS;
}

export function bytes32Arg(hex: Hex32 | string): string {
  return hex.replace(/^0x/, "").padStart(64, "0").slice(-64);
}

export function bytesArg(hex: string): string {
  return hex.replace(/^0x/, "");
}

export function randomBlinding(): bigint {
  const buf = crypto.getRandomValues(new Uint8Array(31));
  let v = 0n;
  for (const b of buf) v = (v << 8n) + BigInt(b);
  return (v % (BN254_FIELD_MODULUS - 1n)) + 1n;
}

export function formatTokenAmount(raw: bigint, decimals = 7): string {
  const base = 10n ** BigInt(decimals);
  const whole = raw / base;
  const frac = raw % base;
  if (frac === 0n) return whole.toString();
  const fracStr = frac.toString().padStart(decimals, "0").replace(/0+$/, "");
  return `${whole}.${fracStr}`;
}

export function parseTokenAmount(input: string, decimals = 7): bigint {
  const trimmed = input.trim();
  if (!trimmed) return 0n;
  const [whole, frac = ""] = trimmed.split(".");
  const base = 10n ** BigInt(decimals);
  const fracPadded = (frac + "0".repeat(decimals)).slice(0, decimals);
  return BigInt(whole || "0") * base + BigInt(fracPadded || "0");
}

export function shortenAddress(addr: string, chars = 4): string {
  if (addr.length <= chars * 2 + 3) return addr;
  return `${addr.slice(0, chars + 1)}…${addr.slice(-chars)}`;
}

export function scValBytesToHex(val: unknown): Hex32 | null {
  if (!val || typeof val !== "object") return null;
  const v = val as { type?: string; value?: unknown };
  if (v.type === "bytes" && v.value instanceof Uint8Array) {
    return `0x${Buffer.from(v.value).toString("hex")}` as Hex32;
  }
  if (typeof v === "string" && /^[0-9a-fA-F]{64}$/.test(v.replace(/^0x/, ""))) {
    return `0x${v.replace(/^0x/, "").padStart(64, "0")}` as Hex32;
  }
  return null;
}
