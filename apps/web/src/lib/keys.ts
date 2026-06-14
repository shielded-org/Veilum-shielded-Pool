import { keccak_256 } from "@noble/hashes/sha3";
import { getPublicKey, getSharedSecret } from "@noble/secp256k1";

import { BN254_FIELD_MODULUS, SECP256K1_ORDER } from "./types";
import { toHex32 } from "./utils";
import type { Hex32 } from "./types";

export const SHIELD_KEY_DERIVATION_CONSENT_MESSAGE =
  "Stellar shielded key derivation consent (deterministic, no transaction)" as const;

async function sha256(data: Uint8Array): Promise<Uint8Array> {
  return new Uint8Array(await crypto.subtle.digest("SHA-256", data));
}

async function deriveScalar(seedLabel: string, label: string, modulus: bigint): Promise<bigint> {
  const enc = new TextEncoder();
  const parts = [
    enc.encode("stellar-shielded-key-v1"),
    enc.encode(seedLabel.replace(/^0x/, "")),
    enc.encode(label),
  ];
  const total = parts.reduce((n, p) => n + p.length, 0);
  const buf = new Uint8Array(total);
  let off = 0;
  for (const p of parts) {
    buf.set(p, off);
    off += p.length;
  }
  const digest = await sha256(buf);
  let v = 0n;
  for (const b of digest) v = (v << 8n) + BigInt(b);
  return (v % (modulus - 1n)) + 1n;
}

export async function keySeedFromWalletSignature(
  address: string,
  signature: string
): Promise<`0x${string}`> {
  const enc = new TextEncoder();
  const data = new Uint8Array([
    ...enc.encode("stellar-shielded-wallet-seed-v1"),
    ...enc.encode(address),
    ...enc.encode(signature),
  ]);
  const digest = await sha256(data);
  return `0x${Buffer.from(digest).toString("hex")}` as `0x${string}`;
}

export async function deriveUserKeys(seedBytes32: `0x${string}`, label = "owner") {
  const spendingKey = await deriveScalar(seedBytes32, `${label}:spending`, BN254_FIELD_MODULUS);
  const viewingPriv = await deriveScalar(seedBytes32, `${label}:viewing`, SECP256K1_ORDER);
  return { spendingKey, viewingPriv };
}

export function viewingPrivToPub(viewingPriv: bigint): Hex32 {
  const privBytes = hexToBytes(toHex32(viewingPriv));
  const pub = getPublicKey(privBytes, true);
  return `0x${Buffer.from(pub).toString("hex")}` as Hex32;
}

function hexToBytes(hex: string): Uint8Array {
  const clean = hex.replace(/^0x/, "");
  const out = new Uint8Array(clean.length / 2);
  for (let i = 0; i < out.length; i += 1) {
    out[i] = Number.parseInt(clean.slice(i * 2, i * 2 + 2), 16);
  }
  return out;
}

function bytesToHex(bytes: Uint8Array): Hex32 {
  return `0x${Buffer.from(bytes).toString("hex")}` as Hex32;
}

function keccak256(data: Uint8Array): Hex32 {
  return bytesToHex(keccak_256(data));
}

export type ViewingRoute = { channel: Hex32; subchannel: Hex32 };

export function routeForRecipient(viewingPubHex: Hex32, subchannelId: number | bigint): ViewingRoute {
  const channel = keccak256(hexToBytes(viewingPubHex));
  const idBuf = new Uint8Array(8);
  new DataView(idBuf.buffer).setBigUint64(0, BigInt(subchannelId), false);
  const subchannel = keccak256(new Uint8Array([...hexToBytes(channel), ...idBuf]));
  return { channel, subchannel };
}

export type NotePlaintext = {
  token: string;
  amount: string;
  blinding: string;
  commitment: string;
  owner_pk?: string;
};

const HKDF_INFO = "zkproject-note-v1";

async function hkdfSha256(ikm: Uint8Array, salt: Uint8Array, info: Uint8Array, len = 32) {
  const key = await crypto.subtle.importKey("raw", ikm, "HKDF", false, ["deriveBits"]);
  const bits = await crypto.subtle.deriveBits(
    { name: "HKDF", hash: "SHA-256", salt, info },
    key,
    len * 8
  );
  return new Uint8Array(bits);
}

export async function encryptNoteECDH(
  note: NotePlaintext,
  recipientViewingPubHex: Hex32
): Promise<`0x${string}`> {
  const ephPriv = crypto.getRandomValues(new Uint8Array(32));
  const ephPub = getPublicKey(ephPriv, true);
  const shared = getSharedSecret(ephPriv, hexToBytes(recipientViewingPubHex), true);
  const salt = crypto.getRandomValues(new Uint8Array(32));
  const key = await hkdfSha256(shared, salt, new TextEncoder().encode(HKDF_INFO));
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const cryptoKey = await crypto.subtle.importKey("raw", key, "AES-GCM", false, ["encrypt"]);
  const plaintext = new TextEncoder().encode(JSON.stringify(note));
  const ct = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, cryptoKey, plaintext);
  const ctArr = new Uint8Array(ct);
  const tag = ctArr.slice(-16);
  const body = ctArr.slice(0, -16);
  const envelope = {
    v: 1,
    eph: bytesToHex(ephPub),
    salt: bytesToHex(salt),
    iv: bytesToHex(iv),
    ct: bytesToHex(body),
    tag: bytesToHex(tag),
  };
  return bytesToHex(new TextEncoder().encode(JSON.stringify(envelope)));
}

export async function decryptNoteECDH(
  encryptedNoteHex: string,
  recipientViewingPriv: bigint
): Promise<NotePlaintext | null> {
  try {
    const envelopeRaw = new TextDecoder().decode(hexToBytes(encryptedNoteHex.replace(/^0x/, "")));
    const envelope = JSON.parse(envelopeRaw) as {
      v: number;
      eph: string;
      salt: string;
      iv: string;
      ct: string;
      tag: string;
    };
    if (envelope.v !== 1) return null;
    const privBytes = hexToBytes(toHex32(recipientViewingPriv));
    const shared = getSharedSecret(privBytes, hexToBytes(envelope.eph), true);
    const key = await hkdfSha256(shared, hexToBytes(envelope.salt), new TextEncoder().encode(HKDF_INFO));
    const cryptoKey = await crypto.subtle.importKey("raw", key, "AES-GCM", false, ["decrypt"]);
    const combined = new Uint8Array([...hexToBytes(envelope.ct), ...hexToBytes(envelope.tag)]);
    const plain = await crypto.subtle.decrypt(
      { name: "AES-GCM", iv: hexToBytes(envelope.iv) },
      cryptoKey,
      combined
    );
    return JSON.parse(new TextDecoder().decode(plain)) as NotePlaintext;
  } catch {
    return null;
  }
}
