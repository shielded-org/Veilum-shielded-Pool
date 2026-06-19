import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { writeFileSync, mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { BN254_FIELD_MODULUS } from "./types.js";
import { computeIncrementalMerklePath, parseHex32, toHex32 } from "./hash.js";
import { resolveNoirPackage } from "./noir-packages.js";
export const ASP_TREE_DEPTH = 10;
export const ASP_MEMBERSHIP_DOMAIN = 2n;
const aspLeafCache = new Map();
function fieldFromNoirOutput(out) {
    const match = out.match(/Circuit output: Field\((-?\d+)\)/);
    if (!match)
        throw new Error(`Failed to parse noir field output: ${out}`);
    const field = BigInt(match[1]);
    const normalized = ((field % BN254_FIELD_MODULUS) + BN254_FIELD_MODULUS) % BN254_FIELD_MODULUS;
    return toHex32(normalized);
}
export function deriveMembershipBlinding(ownerPk, label = "veilum-asp-v1") {
    const digest = createHash("sha256")
        .update(label)
        .update(Buffer.from(ownerPk.replace(/^0x/, ""), "hex"))
        .digest("hex");
    // Soroban Poseidon requires BN254 field elements — raw sha256 can exceed the modulus.
    const field = BigInt(`0x${digest}`) % BN254_FIELD_MODULUS;
    return toHex32(field);
}
export function computeAspLeafViaNoir(ownerPk, membershipBlinding) {
    const owner = typeof ownerPk === "bigint" ? ownerPk : parseHex32(ownerPk);
    const blinding = typeof membershipBlinding === "bigint" ? membershipBlinding : parseHex32(membershipBlinding);
    const key = `${owner}|${blinding}`;
    const cached = aspLeafCache.get(key);
    if (cached)
        return cached;
    const dir = mkdtempSync(join(tmpdir(), "hash3-"));
    const hash3Dir = resolveNoirPackage("hash3");
    execFileSync("cp", ["-R", hash3Dir + "/.", dir + "/"], { stdio: "pipe" });
    const toml = `
a = "${owner.toString()}"
b = "${blinding.toString()}"
c = "${ASP_MEMBERSHIP_DOMAIN.toString()}"
`.trimStart();
    writeFileSync(join(dir, "Prover.toml"), toml);
    const out = execFileSync("nargo", ["execute"], { cwd: dir, encoding: "utf8" });
    const result = fieldFromNoirOutput(out);
    aspLeafCache.set(key, result);
    return result;
}
export async function aspLeaf(_hasher, ownerPk, membershipBlinding) {
    return computeAspLeafViaNoir(ownerPk, membershipBlinding);
}
export async function buildAspMembershipPath(hasher, leaves, leafIndex) {
    return computeIncrementalMerklePath(hasher, leaves, leafIndex, ASP_TREE_DEPTH);
}
export async function fetchAspStatus(aspUrl, ownerPk) {
    const base = aspUrl.replace(/\/$/, "");
    const res = await fetch(`${base}/asp/status/${encodeURIComponent(ownerPk)}`);
    if (!res.ok)
        throw new Error(`ASP status failed: ${res.status}`);
    const data = (await res.json());
    return {
        ownerPk,
        membershipBlinding: data.record?.membershipBlinding ?? deriveMembershipBlinding(ownerPk),
        leafIndex: data.record?.leafIndex ?? null,
        aspRoot: data.record?.aspRoot ?? `0x${"0".repeat(64)}`,
        status: data.status,
    };
}
export async function registerAspMembership(aspUrl, ownerPk, options) {
    const base = aspUrl.replace(/\/$/, "");
    const res = await fetch(`${base}/asp/register`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
            ownerPk,
            stellarAddress: options?.stellarAddress,
            tokenContractId: options?.tokenContractId,
        }),
    });
    return res.json();
}
/** On-chain fund-source scan → auto approve/deny + ASP membership insert or deny on-chain. */
export async function screenAspMembership(aspUrl, ownerPk, stellarAddress, tokenContractId) {
    const base = aspUrl.replace(/\/$/, "");
    const res = await fetch(`${base}/asp/screen`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ ownerPk, stellarAddress, tokenContractId }),
    });
    const body = (await res.json());
    if (!res.ok && res.status !== 403) {
        throw new Error(body.error || `ASP screen failed (${res.status})`);
    }
    return body;
}
/** Run screen if needed; returns when status is approved or throws on deny. */
export async function ensureAspMembership(aspUrl, ownerPk, stellarAddress, tokenContractId) {
    const current = await fetchAspStatus(aspUrl, ownerPk);
    if (current.status === "approved") {
        return { ok: true, status: "approved", ownerPk, auto: false };
    }
    if (current.status === "denied") {
        throw new Error("ASP membership denied — fund source failed compliance scan");
    }
    const screened = await screenAspMembership(aspUrl, ownerPk, stellarAddress, tokenContractId);
    if (screened.status === "denied") {
        const detail = screened.scan?.reasons?.join(", ") || screened.error || "scan failed";
        throw new Error(`ASP denied: ${detail}`);
    }
    if (screened.status !== "approved") {
        throw new Error("ASP membership not approved after on-chain scan");
    }
    return screened;
}
export async function approveAspMembership(aspUrl, adminToken, ownerPk, membershipBlinding) {
    const base = aspUrl.replace(/\/$/, "");
    const res = await fetch(`${base}/asp/approve`, {
        method: "POST",
        headers: {
            "content-type": "application/json",
            authorization: `Bearer ${adminToken}`,
        },
        body: JSON.stringify({ ownerPk, membershipBlinding }),
    });
    if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || `ASP approve failed: ${res.status}`);
    }
    return res.json();
}
export function packAspMeta(params) {
    if (params.siblings.length !== ASP_TREE_DEPTH) {
        throw new Error(`Expected ${ASP_TREE_DEPTH} ASP siblings`);
    }
    const leafIndex = Buffer.alloc(4);
    leafIndex.writeUInt32BE(params.leafIndex);
    return Buffer.concat([
        Buffer.from(params.ownerPk.replace(/^0x/, ""), "hex"),
        Buffer.from(params.membershipBlinding.replace(/^0x/, ""), "hex"),
        leafIndex,
        ...params.siblings.map((s) => Buffer.from(s.replace(/^0x/, ""), "hex")),
        Buffer.from(params.aspRoot.replace(/^0x/, ""), "hex"),
    ]);
}
const PROOF_BYTES = 456 * 32;
const PUBLIC_INPUT_COUNT_ASP = 14;
/** proof || public_inputs for asp-gate.unshield_asp */
export function packUnshieldAspProofBundle(proofBytes, publicInputsBytes) {
    if (proofBytes.length !== PROOF_BYTES) {
        throw new Error(`proof must be ${PROOF_BYTES} bytes`);
    }
    if (publicInputsBytes.length !== PUBLIC_INPUT_COUNT_ASP * 32) {
        throw new Error(`public inputs must be ${PUBLIC_INPUT_COUNT_ASP * 32} bytes`);
    }
    return Buffer.concat([proofBytes, publicInputsBytes]);
}
/** Fixed + variable meta for asp-gate.unshield_asp */
export function packUnshieldAspMeta(params) {
    const amountBuf = Buffer.alloc(16);
    amountBuf.writeBigUInt64BE(params.amount >> 64n, 0);
    amountBuf.writeBigUInt64BE(params.amount & ((1n << 64n) - 1n), 8);
    const recipientBuf = Buffer.from(params.recipient, "utf8");
    const tokenBuf = Buffer.from(params.token, "utf8");
    const encHex = (params.encryptedNote ?? "00").replace(/^0x/, "");
    const encBuf = encHex.length > 0 && encHex !== "00" ? Buffer.from(encHex, "hex") : Buffer.alloc(0);
    const recipientLen = Buffer.alloc(4);
    recipientLen.writeUInt32BE(recipientBuf.length);
    const tokenLen = Buffer.alloc(4);
    tokenLen.writeUInt32BE(tokenBuf.length);
    const encLen = Buffer.alloc(4);
    encLen.writeUInt32BE(encBuf.length);
    return Buffer.concat([
        Buffer.from(params.nullifier.replace(/^0x/, ""), "hex"),
        Buffer.from(params.merkleRoot.replace(/^0x/, ""), "hex"),
        Buffer.from(params.newCommitment.replace(/^0x/, ""), "hex"),
        Buffer.from(params.channel.replace(/^0x/, ""), "hex"),
        Buffer.from(params.subchannel.replace(/^0x/, ""), "hex"),
        amountBuf,
        recipientLen,
        recipientBuf,
        tokenLen,
        tokenBuf,
        encLen,
        encBuf,
    ]);
}
export async function checkAspAllowed(aspUrl, ownerPk) {
    const base = aspUrl.replace(/\/$/, "");
    const res = await fetch(`${base}/asp/check/${encodeURIComponent(ownerPk)}`);
    return res.ok;
}
