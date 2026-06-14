import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { writeFileSync, mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { BN254_FIELD_MODULUS } from "./types.js";
const __dirname = dirname(fileURLToPath(import.meta.url));
const NOTE_HASH_DIR = join(__dirname, "../../note-hash");
const HASH2_DIR = join(__dirname, "../../hash2");
const hash2Cache = new Map();
const noteHashCache = new Map();
function cacheKey(values) {
    return values.map((v) => v.toString()).join("|");
}
function fieldFromNoirOutput(out) {
    const match = out.match(/Circuit output: Field\((-?\d+)\)/);
    if (!match)
        throw new Error(`Failed to parse noir field output: ${out}`);
    const field = BigInt(match[1]);
    const normalized = ((field % BN254_FIELD_MODULUS) + BN254_FIELD_MODULUS) % BN254_FIELD_MODULUS;
    return toHex32(normalized);
}
function toHex32(value) {
    const hex = value.toString(16).padStart(64, "0");
    return `0x${hex}`;
}
function parseHex32(hex) {
    if (typeof hex === "bigint")
        return hex % BN254_FIELD_MODULUS;
    return BigInt(hex) % BN254_FIELD_MODULUS;
}
function bytes32Arg(value) {
    const v = typeof value === "bigint" ? value : parseHex32(value);
    return v.toString(16).padStart(64, "0");
}
export function computeHash2ViaNoir(left, right) {
    const key = cacheKey([left, right]);
    const cached = hash2Cache.get(key);
    if (cached)
        return cached;
    const dir = mkdtempSync(join(tmpdir(), "hash2-"));
    execFileSync("cp", ["-R", HASH2_DIR + "/.", dir + "/"], { stdio: "pipe" });
    const toml = `
left = "${left.toString()}"
right = "${right.toString()}"
`.trimStart();
    writeFileSync(join(dir, "Prover.toml"), toml);
    const out = execFileSync("nargo", ["execute"], { cwd: dir, encoding: "utf8" });
    const result = fieldFromNoirOutput(out);
    hash2Cache.set(key, result);
    return result;
}
/** Local Noir Poseidon2 — matches on-chain merkle tree and circuit (no RPC). */
export function createLocalPoseidonHasher() {
    return {
        hash2: async (a, b) => computeHash2ViaNoir(a, b),
        hash4: async (a, b, c, d) => computeNoteHashViaNoir(a, b, c, d),
    };
}
/** Default hasher for proofs: local Noir (fast, no network). */
export const createPoseidonHasher = createLocalPoseidonHasher;
export function createCliPoseidonHasher(merkleContractId, network, sourceAccount) {
    function invokeHash2(a, b) {
        const out = execFileSync("stellar", [
            "contract",
            "invoke",
            "--id",
            merkleContractId,
            "--source-account",
            sourceAccount,
            "--network",
            network,
            "--",
            "hash2",
            "--left",
            bytes32Arg(a),
            "--right",
            bytes32Arg(b),
        ], { encoding: "utf8" });
        const line = out.trim().split("\n").pop() ?? "";
        const hex = line.replace(/"/g, "").replace(/^0x/, "").padStart(64, "0");
        return `0x${hex.slice(-64)}`;
    }
    return {
        hash2: async (a, b) => invokeHash2(a, b),
        hash4: async (a, b, c, d) => computeNoteHashViaNoir(a, b, c, d),
    };
}
export function computeNoteHashViaNoir(owner, token, amount, blinding) {
    const ownerNorm = typeof owner === "bigint" ? owner : parseHex32(owner);
    const tokenNorm = typeof token === "bigint" ? token : parseHex32(token);
    const key = cacheKey([ownerNorm, tokenNorm, amount, blinding]);
    const cached = noteHashCache.get(key);
    if (cached)
        return Promise.resolve(cached);
    const dir = mkdtempSync(join(tmpdir(), "note-hash-"));
    execFileSync("cp", ["-R", NOTE_HASH_DIR + "/.", dir + "/"], { stdio: "pipe" });
    const ownerStr = typeof owner === "bigint" ? owner.toString() : owner;
    const tokenStr = typeof token === "bigint" ? token.toString() : token;
    const toml = `
owner = "${ownerStr}"
token = "${tokenStr}"
amount = "${amount}"
blinding = "${blinding}"
`.trimStart();
    writeFileSync(join(dir, "Prover.toml"), toml);
    const out = execFileSync("nargo", ["execute"], { cwd: dir, encoding: "utf8" });
    const result = fieldFromNoirOutput(out);
    noteHashCache.set(key, result);
    return Promise.resolve(result);
}
export async function deriveOwnerPk(hasher, spendingKey) {
    return hasher.hash2(spendingKey, 1n);
}
export async function noteCommitment(hasher, ownerPk, tokenField, amount, blinding) {
    return hasher.hash4(ownerPk, parseHex32(tokenField), amount, blinding);
}
export async function nullifier(hasher, spendingKey, commitment) {
    return hasher.hash2(spendingKey, parseHex32(commitment));
}
export async function buildZeroes(hasher, depth) {
    const zeroes = [];
    let cur = 0n;
    for (let i = 0; i < depth; i += 1) {
        zeroes.push(cur);
        cur = BigInt(await hasher.hash2(cur, cur));
    }
    return zeroes;
}
export async function buildLevelMaps(hasher, leaves, depth = 20) {
    const zeroes = await buildZeroes(hasher, depth);
    const levels = [];
    let current = new Map();
    for (let i = 0; i < leaves.length; i += 1) {
        if (leaves[i])
            current.set(i, parseHex32(leaves[i]));
    }
    levels.push(current);
    for (let level = 0; level < depth; level += 1) {
        const next = new Map();
        const parentIndices = new Set();
        for (const idx of current.keys())
            parentIndices.add(idx >> 1);
        for (const pIdx of parentIndices) {
            const left = current.get(pIdx * 2) ?? zeroes[level];
            const right = current.get(pIdx * 2 + 1) ?? zeroes[level];
            const h = BigInt(await hasher.hash2(left, right));
            next.set(pIdx, h);
        }
        current = next;
        levels.push(current);
    }
    return { levels, zeroes };
}
export function extractPath(levelMaps, zeroes, targetIndex, depth = 20) {
    const siblings = [];
    const directions = [];
    let idx = targetIndex;
    for (let level = 0; level < depth; level += 1) {
        const map = levelMaps[level];
        const siblingIdx = idx ^ 1;
        siblings.push(toHex32(map.get(siblingIdx) ?? zeroes[level]));
        directions.push((idx & 1) === 1);
        idx >>= 1;
    }
    const rootMap = levelMaps[depth];
    const root = toHex32(rootMap.get(0) ?? zeroes[depth - 1]);
    return { root, siblings, directions };
}
/** BN254 field for a Soroban token contract (sha256 of strkey, high byte cleared). */
export function tokenFieldFromContractId(contractId) {
    const digest = createHash("sha256").update(contractId).digest();
    digest[0] = 0;
    return `0x${digest.toString("hex")}`;
}
export const tokenFieldFromAddress = tokenFieldFromContractId;
export { toHex32, parseHex32 };
