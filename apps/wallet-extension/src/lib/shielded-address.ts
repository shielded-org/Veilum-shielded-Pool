import { keccak_256 } from "@noble/hashes/sha3";

import type { Hex32, NetworkName } from "./types";
import { toHex32 } from "./utils";

const FORMAT_VERSION = 1;
const PREFIX = "shd_";
const OWNER_PK_BYTES = 32;
const VIEWING_PUB_BYTES = 33;
const CHECKSUM_BYTES = 4;
const PAYLOAD_BYTES = 1 + 4 + OWNER_PK_BYTES + VIEWING_PUB_BYTES;

export const NETWORK_IDS: Record<NetworkName, number> = {
  local: 1,
  futurenet: 2,
  testnet: 3,
  mainnet: 4,
};

export type DecodedShieldedAddress = {
  ownerPk: Hex32;
  viewingPub: Hex32;
  networkId: number;
  version: number;
};

function toBase64Url(bytes: Uint8Array): string {
  let binary = "";
  for (const b of bytes) binary += String.fromCharCode(b);
  const b64 = btoa(binary);
  return b64.replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function fromBase64Url(text: string): Uint8Array {
  const b64 = text.replace(/-/g, "+").replace(/_/g, "/");
  const padded = b64 + "===".slice((b64.length + 3) % 4);
  const binary = atob(padded);
  const out = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) out[i] = binary.charCodeAt(i);
  return out;
}

function checksum4(payload: Uint8Array): Uint8Array {
  return keccak_256(payload).slice(0, CHECKSUM_BYTES);
}

function u32be(value: number): Uint8Array {
  const out = new Uint8Array(4);
  out[0] = (value >>> 24) & 0xff;
  out[1] = (value >>> 16) & 0xff;
  out[2] = (value >>> 8) & 0xff;
  out[3] = value & 0xff;
  return out;
}

function readU32be(bytes: Uint8Array, offset: number): number {
  return (
    ((bytes[offset] << 24) >>> 0) +
    (bytes[offset + 1] << 16) +
    (bytes[offset + 2] << 8) +
    bytes[offset + 3]
  );
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
  return `0x${Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("")}` as Hex32;
}

export function encodeShieldedAddress(params: {
  ownerPk: Hex32 | bigint;
  viewingPub: Hex32;
  network: NetworkName;
}): string {
  const ownerBytes = hexToBytes(
    typeof params.ownerPk === "bigint" ? toHex32(params.ownerPk) : params.ownerPk
  );
  if (ownerBytes.length !== OWNER_PK_BYTES) {
    throw new Error("Owner PK must be 32 bytes");
  }
  const viewingBytes = hexToBytes(params.viewingPub);
  if (viewingBytes.length !== VIEWING_PUB_BYTES) {
    throw new Error("Viewing public key must be compressed (33 bytes)");
  }
  const networkId = NETWORK_IDS[params.network];
  const payload = new Uint8Array(PAYLOAD_BYTES);
  payload[0] = FORMAT_VERSION;
  payload.set(u32be(networkId), 1);
  payload.set(ownerBytes, 5);
  payload.set(viewingBytes, 5 + OWNER_PK_BYTES);
  const full = new Uint8Array(PAYLOAD_BYTES + CHECKSUM_BYTES);
  full.set(payload, 0);
  full.set(checksum4(payload), PAYLOAD_BYTES);
  return `${PREFIX}${toBase64Url(full)}`;
}

export function decodeShieldedAddress(address: string): DecodedShieldedAddress {
  const trimmed = address.trim();
  if (!trimmed.startsWith(PREFIX)) {
    throw new Error("Invalid shielded address prefix (expected shd_)");
  }
  const raw = fromBase64Url(trimmed.slice(PREFIX.length));
  if (raw.length !== PAYLOAD_BYTES + CHECKSUM_BYTES) {
    throw new Error("Invalid shielded address length");
  }
  const payload = raw.slice(0, PAYLOAD_BYTES);
  const givenChecksum = raw.slice(PAYLOAD_BYTES);
  const expectedChecksum = checksum4(payload);
  for (let i = 0; i < CHECKSUM_BYTES; i += 1) {
    if (givenChecksum[i] !== expectedChecksum[i]) {
      throw new Error("Invalid shielded address checksum");
    }
  }
  const version = payload[0];
  if (version !== FORMAT_VERSION) {
    throw new Error(`Unsupported shielded address version ${version}`);
  }
  const networkId = readU32be(payload, 1);
  const ownerPk = bytesToHex(payload.slice(5, 5 + OWNER_PK_BYTES));
  const viewingPub = bytesToHex(payload.slice(5 + OWNER_PK_BYTES, 5 + OWNER_PK_BYTES + VIEWING_PUB_BYTES));
  return { ownerPk, viewingPub, networkId, version };
}

export function networkNameFromId(networkId: number): NetworkName | null {
  const entry = Object.entries(NETWORK_IDS).find(([, id]) => id === networkId);
  return entry ? (entry[0] as NetworkName) : null;
}

export function isShieldedAddress(value: string): boolean {
  try {
    decodeShieldedAddress(value);
    return true;
  } catch {
    return false;
  }
}

/** Accept shd_… or legacy raw viewing pub + owner pk fields. */
export function parseRecipientInput(input: string): {
  ownerPk: Hex32;
  viewingPub: Hex32;
  networkId?: number;
} {
  const trimmed = input.trim();
  if (trimmed.startsWith(PREFIX)) {
    const decoded = decodeShieldedAddress(trimmed);
    return {
      ownerPk: decoded.ownerPk,
      viewingPub: decoded.viewingPub,
      networkId: decoded.networkId,
    };
  }
  throw new Error("Paste a shielded receive address (shd_…)");
}
