import { sha256 } from "@noble/hashes/sha256";

import { getServiceUrls } from "./service-urls";
import { ASP_ADMIN_TOKEN, type Hex32 } from "./types";
import { BN254_FIELD_MODULUS } from "./types";
import { toHex32 } from "./utils";

export const ASP_TREE_DEPTH = 10;

export type AspStatus = "pending" | "approved" | "denied" | "unknown";

export type AspScanResult = {
  clean: boolean;
  reasons: string[];
  inboundSources: Array<{ address: string; reason: string; txHash?: string; hits: number }>;
  inboundCount?: number;
  stellarAddress?: string;
  scannedAt: string;
};

export type AspScreenResponse = {
  ok: boolean;
  status: AspStatus;
  ownerPk: Hex32;
  auto?: boolean;
  scan?: AspScanResult | null;
  error?: string;
  leafIndex?: number;
  aspRoot?: Hex32;
  membershipBlinding?: Hex32;
};

export type AspRecord = {
  ownerPk: Hex32;
  membershipBlinding?: Hex32;
  leafIndex?: number | null;
  aspRoot?: Hex32;
  status: AspStatus;
  stellarAddress?: string;
  lastScan?: AspScanResult;
};

async function aspBase() {
  const { aspUrl } = await getServiceUrls();
  return aspUrl.replace(/\/$/, "");
}

export async function fetchAspStatus(ownerPk: Hex32): Promise<AspRecord> {
  const res = await fetch(`${await aspBase()}/asp/status/${encodeURIComponent(ownerPk)}`);
  if (!res.ok) throw new Error(`ASP status failed (${res.status})`);
  const data = (await res.json()) as { status: AspStatus; record?: Partial<AspRecord> };
  return {
    ownerPk,
    membershipBlinding: data.record?.membershipBlinding,
    leafIndex: data.record?.leafIndex ?? null,
    aspRoot: data.record?.aspRoot,
    status: data.status,
    stellarAddress: (data.record as AspRecord | undefined)?.stellarAddress,
    lastScan: (data.record as AspRecord | undefined)?.lastScan,
  };
}

export async function registerAspMembership(
  ownerPk: Hex32,
  stellarAddress?: string,
  tokenContractId?: string
): Promise<{ ok: boolean; status: AspStatus }> {
  const res = await fetch(`${await aspBase()}/asp/register`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ ownerPk, stellarAddress, tokenContractId }),
  });
  const body = (await res.json()) as { ok: boolean; status: AspStatus; error?: string };
  if (!res.ok && res.status !== 202 && res.status !== 403) {
    throw new Error(body.error || `ASP register failed (${res.status})`);
  }
  return body;
}

export async function screenAspMembership(
  ownerPk: Hex32,
  stellarAddress: string,
  tokenContractId?: string
): Promise<AspScreenResponse> {
  const res = await fetch(`${await aspBase()}/asp/screen`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ ownerPk, stellarAddress, tokenContractId }),
  });
  const body = (await res.json()) as AspScreenResponse;
  if (!res.ok && res.status !== 403) {
    throw new Error(body.error || `ASP screen failed (${res.status})`);
  }
  return body;
}

/** On-chain fund scan + auto approve/deny; throws if denied. */
export async function ensureAspMembership(
  ownerPk: Hex32,
  stellarAddress: string,
  tokenContractId?: string
): Promise<AspScreenResponse> {
  const current = await fetchAspStatus(ownerPk);
  if (current.status === "approved") {
    return { ok: true, status: "approved", ownerPk, auto: false };
  }
  if (current.status === "denied") {
    const detail = current.lastScan?.reasons?.join(", ") || "previously denied";
    throw new Error(`ASP denied: ${detail}`);
  }
  const screened = await screenAspMembership(ownerPk, stellarAddress, tokenContractId);
  if (screened.status === "denied") {
    const detail = screened.scan?.reasons?.join(", ") || screened.error || "scan failed";
    throw new Error(`ASP denied: ${detail}`);
  }
  if (screened.status !== "approved") {
    throw new Error("ASP membership not approved after on-chain scan");
  }
  return screened;
}

export async function fetchAspPending(adminToken = ASP_ADMIN_TOKEN): Promise<
  Array<{ id: string; ownerPk: Hex32; membershipBlinding: Hex32; createdAt: string }>
> {
  const res = await fetch(`${await aspBase()}/asp/pending`, {
    headers: { authorization: `Bearer ${adminToken}` },
  });
  if (!res.ok) throw new Error(`ASP pending list failed (${res.status})`);
  const data = (await res.json()) as {
    pending: Array<{ id: string; ownerPk: Hex32; membershipBlinding: Hex32; createdAt: string }>;
  };
  return data.pending;
}

export async function approveAspMembership(
  ownerPk: Hex32,
  adminToken = ASP_ADMIN_TOKEN,
  membershipBlinding?: Hex32
) {
  const res = await fetch(`${await aspBase()}/asp/approve`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${adminToken}`,
    },
    body: JSON.stringify({ ownerPk, membershipBlinding }),
  });
  const body = await res.json();
  if (!res.ok) throw new Error((body as { error?: string }).error || `ASP approve failed (${res.status})`);
  return body as AspRecord & { leafIndex: number; aspRoot: Hex32 };
}

export async function denyAspMembership(ownerPk: Hex32, adminToken = ASP_ADMIN_TOKEN) {
  const res = await fetch(`${await aspBase()}/asp/deny`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${adminToken}`,
    },
    body: JSON.stringify({ ownerPk }),
  });
  const body = await res.json();
  if (!res.ok) throw new Error((body as { error?: string }).error || `ASP deny failed (${res.status})`);
  return body;
}

export function deriveMembershipBlinding(ownerPk: Hex32, label = "veilum-asp-v1"): Hex32 {
  const ownerBytes = hexToBytes(ownerPk);
  const labelBytes = new TextEncoder().encode(label);
  const input = new Uint8Array(labelBytes.length + ownerBytes.length);
  input.set(labelBytes, 0);
  input.set(ownerBytes, labelBytes.length);
  const digest = sha256(input);
  let v = 0n;
  for (const b of digest) v = (v << 8n) + BigInt(b);
  return toHex32(v % BN254_FIELD_MODULUS);
}

function hexToBytes(hex: Hex32): Uint8Array {
  const h = hex.replace(/^0x/, "");
  const out = new Uint8Array(h.length / 2);
  for (let i = 0; i < out.length; i += 1) {
    out[i] = Number.parseInt(h.slice(i * 2, i * 2 + 2), 16);
  }
  return out;
}

export async function fetchAspMembershipPath(ownerPk: Hex32): Promise<{
  membershipBlinding: Hex32;
  leafIndex: number;
  aspRoot: Hex32;
  siblings: Hex32[];
  directions: boolean[];
}> {
  const res = await fetch(`${await aspBase()}/asp/path/${encodeURIComponent(ownerPk)}`);
  const body = (await res.json()) as {
    ok: boolean;
    error?: string;
    membershipBlinding: Hex32;
    leafIndex: number;
    aspRoot: Hex32;
    siblings: Hex32[];
    directions: boolean[];
  };
  if (!res.ok) throw new Error(body.error || `ASP path failed (${res.status})`);
  return body;
}

export function packAspMeta(params: {
  ownerPk: Hex32;
  membershipBlinding: Hex32;
  leafIndex: number;
  siblings: Hex32[];
  aspRoot: Hex32;
}): string {
  if (params.siblings.length !== ASP_TREE_DEPTH) {
    throw new Error(`Expected ${ASP_TREE_DEPTH} ASP siblings`);
  }
  const u32be = (n: number) =>
    [(n >>> 24) & 0xff, (n >>> 16) & 0xff, (n >>> 8) & 0xff, n & 0xff]
      .map((b) => b.toString(16).padStart(2, "0"))
      .join("");
  const hex32 = (h: Hex32) => h.replace(/^0x/, "").padStart(64, "0").slice(-64);
  return [
    hex32(params.ownerPk),
    hex32(params.membershipBlinding),
    u32be(params.leafIndex),
    ...params.siblings.map(hex32),
    hex32(params.aspRoot),
  ].join("");
}
