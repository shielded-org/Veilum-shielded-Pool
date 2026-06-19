import { randomUUID } from "node:crypto";

import { BN254_FIELD_MODULUS } from "@stellar-shielded/sdk";

import { scanFundSources } from "./onchain-scan.js";

function toFieldHex32(value) {
  const mod = ((value % BN254_FIELD_MODULUS) + BN254_FIELD_MODULUS) % BN254_FIELD_MODULUS;
  return `0x${mod.toString(16).padStart(64, "0")}`;
}

export function deriveMembershipBlinding(ownerPk, createHash, label = "veilum-asp-v1") {
  const digest = createHash("sha256")
    .update(label)
    .update(Buffer.from(ownerPk.replace(/^0x/, ""), "hex"))
    .digest("hex");
  return toFieldHex32(BigInt(`0x${digest}`));
}

export function membershipStatus(db, ownerPk) {
  if (db.denied.some((d) => d.ownerPk === ownerPk)) return "denied";
  if (db.approved.some((a) => a.ownerPk === ownerPk)) return "approved";
  if (db.pending.some((p) => p.ownerPk === ownerPk)) return "pending";
  return "unknown";
}

export function approveMember(
  db,
  saveDb,
  ownerPk,
  membershipBlinding,
  invokeInsertMember,
  extra = {}
) {
  const onchain = invokeInsertMember(ownerPk, membershipBlinding);
  const approved = {
    ownerPk,
    membershipBlinding,
    leafIndex: onchain.leafIndex,
    aspRoot: onchain.aspRoot,
    contractId: extra.contractId ?? null,
    approvedAt: new Date().toISOString(),
    ...extra,
  };
  db.pending = db.pending.filter((p) => p.ownerPk !== ownerPk);
  db.approved = db.approved.filter((a) => a.ownerPk !== ownerPk);
  db.approved.push(approved);
  if (!Array.isArray(db.memberships)) db.memberships = [];
  db.memberships.push(approved);
  saveDb(db);
  return approved;
}

/**
 * Ordered membership records for indices [0..leafIndex] on the current ASP contract.
 * Picks the latest approval per leaf index; ignores entries from other contracts when tagged.
 */
export function getCanonicalMembershipChain(db, contractId, leafIndex) {
  const target = Number(leafIndex);
  if (!Number.isInteger(target) || target < 0) {
    throw new Error("Invalid ASP leaf index");
  }

  const candidates = (db.memberships ?? []).filter((m) => {
    if (m.leafIndex == null || m.leafIndex > target) return false;
    if (contractId && m.contractId && m.contractId !== contractId) return false;
    return true;
  });

  const byIndex = new Map();
  for (const m of candidates) {
    const idx = m.leafIndex;
    const prev = byIndex.get(idx);
    const mTime = Date.parse(m.approvedAt || m.screenedAt || 0);
    const pTime = prev ? Date.parse(prev.approvedAt || prev.screenedAt || 0) : -1;
    if (!prev || mTime >= pTime) byIndex.set(idx, m);
  }

  const chain = [];
  for (let i = 0; i <= target; i++) {
    const m = byIndex.get(i);
    if (!m) throw new Error(`ASP tree missing member at leaf index ${i}`);
    chain.push(m);
  }
  return chain;
}

export function denyMember(db, saveDb, ownerPk, invokeDenyOnChain, extra = {}) {
  const denied = {
    ownerPk,
    deniedAt: new Date().toISOString(),
    ...extra,
  };
  db.pending = db.pending.filter((p) => p.ownerPk !== ownerPk);
  db.approved = db.approved.filter((a) => a.ownerPk !== ownerPk);
  if (!db.denied.some((d) => d.ownerPk === ownerPk)) {
    db.denied.push(denied);
  }
  saveDb(db);
  invokeDenyOnChain(ownerPk, true);
  return denied;
}

/**
 * On-chain fund scan → auto approve or deny + full ASP on-chain procedure.
 */
export async function runAspScreen({
  ownerPk,
  stellarAddress,
  tokenContractId,
  db,
  saveDb,
  dataDir,
  horizonUrl,
  deriveBlinding,
  invokeInsertMember,
  invokeDenyOnChain,
  contractId = null,
}) {
  const status = membershipStatus(db, ownerPk);
  if (status === "approved") {
    const record = db.approved.find((a) => a.ownerPk === ownerPk);
    return { ok: true, status: "approved", ownerPk, record, scan: record?.lastScan ?? null, auto: false };
  }
  if (status === "denied") {
    const record = db.denied.find((d) => d.ownerPk === ownerPk);
    return {
      ok: false,
      status: "denied",
      ownerPk,
      record,
      scan: record?.lastScan ?? null,
      auto: false,
      error: "Owner is denied",
    };
  }

  const scan = await scanFundSources({
    horizonUrl,
    accountId: stellarAddress,
    tokenContractId: tokenContractId ?? null,
    dataDir,
  });

  const membershipBlinding = deriveBlinding(ownerPk);
  const screenMeta = {
    stellarAddress: scan.stellarAddress ?? stellarAddress,
    lastScan: scan,
    screenedAt: scan.scannedAt,
  };

  if (scan.clean) {
    const approved = approveMember(db, saveDb, ownerPk, membershipBlinding, invokeInsertMember, {
      ...screenMeta,
      contractId,
    });
    return { ok: true, status: "approved", auto: true, scan, ...approved };
  }

  const denied = denyMember(db, saveDb, ownerPk, invokeDenyOnChain, screenMeta);
  return {
    ok: false,
    status: "denied",
    auto: true,
    scan,
    ownerPk,
    ...denied,
    error: scan.reasons.join("; ") || "on_chain_scan_failed",
  };
}

export function queuePending(db, saveDb, ownerPk, membershipBlinding) {
  if (!db.pending.some((p) => p.ownerPk === ownerPk)) {
    db.pending.push({
      id: randomUUID(),
      ownerPk,
      membershipBlinding,
      createdAt: new Date().toISOString(),
    });
    saveDb(db);
  }
}
