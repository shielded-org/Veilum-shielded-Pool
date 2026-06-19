import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { writeFileSync, mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { BN254_FIELD_MODULUS, type Hex32 } from "./types.js";
import { resolveNoirPackage } from "./noir-packages.js";

const hash2Cache = new Map<string, Hex32>();
const noteHashCache = new Map<string, Hex32>();

function cacheKey(values: bigint[]): string {
  return values.map((v) => v.toString()).join("|");
}

function fieldFromNoirOutput(out: string): Hex32 {
  const match = out.match(/Circuit output: Field\((-?\d+)\)/);
  if (!match) throw new Error(`Failed to parse noir field output: ${out}`);
  const field = BigInt(match[1]);
  const normalized = ((field % BN254_FIELD_MODULUS) + BN254_FIELD_MODULUS) % BN254_FIELD_MODULUS;
  return toHex32(normalized);
}

export type PoseidonHasher = {
  hash2: (a: bigint, b: bigint) => Promise<Hex32>;
  hash4: (a: bigint, b: bigint, c: bigint, d: bigint) => Promise<Hex32>;
};

function toHex32(value: bigint): Hex32 {
  const hex = value.toString(16).padStart(64, "0");
  return `0x${hex}` as Hex32;
}

function parseHex32(hex: Hex32 | bigint): bigint {
  if (typeof hex === "bigint") return hex % BN254_FIELD_MODULUS;
  return BigInt(hex) % BN254_FIELD_MODULUS;
}

function bytes32Arg(value: bigint | Hex32): string {
  const v = typeof value === "bigint" ? value : parseHex32(value);
  return v.toString(16).padStart(64, "0");
}

export function computeHash2ViaNoir(left: bigint, right: bigint): Hex32 {
  const key = cacheKey([left, right]);
  const cached = hash2Cache.get(key);
  if (cached) return cached;

  const dir = mkdtempSync(join(tmpdir(), "hash2-"));
  execFileSync("cp", ["-R", resolveNoirPackage("hash2") + "/.", dir + "/"], { stdio: "pipe" });
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
export function createLocalPoseidonHasher(): PoseidonHasher {
  return {
    hash2: async (a, b) => computeHash2ViaNoir(a, b),
    hash4: async (a, b, c, d) => computeNoteHashViaNoir(a, b, c, d),
  };
}

/** Default hasher for proofs: local Noir (fast, no network). */
export const createPoseidonHasher = createLocalPoseidonHasher;

export function createCliPoseidonHasher(
  merkleContractId: string,
  network: string,
  sourceAccount: string
): PoseidonHasher {
  function invokeHash2(a: bigint, b: bigint): Hex32 {
    const out = execFileSync(
      "stellar",
      [
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
      ],
      { encoding: "utf8" }
    );
    const line = out.trim().split("\n").pop() ?? "";
    const hex = line.replace(/"/g, "").replace(/^0x/, "").padStart(64, "0");
    return `0x${hex.slice(-64)}` as Hex32;
  }

  return {
    hash2: async (a, b) => invokeHash2(a, b),
    hash4: async (a, b, c, d) => computeNoteHashViaNoir(a, b, c, d),
  };
}

export function computeNoteHashViaNoir(
  owner: bigint | Hex32,
  token: bigint | Hex32,
  amount: bigint,
  blinding: bigint
): Promise<Hex32> {
  const ownerNorm = typeof owner === "bigint" ? owner : parseHex32(owner);
  const tokenNorm = typeof token === "bigint" ? token : parseHex32(token);
  const key = cacheKey([ownerNorm, tokenNorm, amount, blinding]);
  const cached = noteHashCache.get(key);
  if (cached) return Promise.resolve(cached);

  const dir = mkdtempSync(join(tmpdir(), "note-hash-"));
  execFileSync("cp", ["-R", resolveNoirPackage("note-hash") + "/.", dir + "/"], { stdio: "pipe" });
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

export async function deriveOwnerPk(hasher: PoseidonHasher, spendingKey: bigint): Promise<Hex32> {
  return hasher.hash2(spendingKey, 1n);
}

export async function noteCommitment(
  hasher: PoseidonHasher,
  ownerPk: bigint,
  tokenField: Hex32,
  amount: bigint,
  blinding: bigint
): Promise<Hex32> {
  return hasher.hash4(ownerPk, parseHex32(tokenField), amount, blinding);
}

export async function nullifier(hasher: PoseidonHasher, spendingKey: bigint, commitment: Hex32): Promise<Hex32> {
  return hasher.hash2(spendingKey, parseHex32(commitment));
}

export async function buildZeroes(hasher: PoseidonHasher, depth: number): Promise<bigint[]> {
  const zeroes: bigint[] = [];
  let cur = 0n;
  for (let i = 0; i < depth; i += 1) {
    zeroes.push(cur);
    cur = BigInt(await hasher.hash2(cur, cur));
  }
  return zeroes;
}

/** Matches on-chain append-only incremental merkle insert (ASP + pool trees). */
async function incrementalInsertLeaf(
  hasher: PoseidonHasher,
  leaf: bigint,
  leafIndex: number,
  depth: number,
  zeroes: bigint[],
  filledSubtrees: bigint[]
): Promise<void> {
  let index = leafIndex;
  let currentHash = leaf;
  for (let level = 0; level < depth; level += 1) {
    if ((index & 1) === 0) {
      filledSubtrees[level] = currentHash;
      currentHash = BigInt(await hasher.hash2(currentHash, zeroes[level]));
    } else {
      currentHash = BigInt(await hasher.hash2(filledSubtrees[level], currentHash));
    }
    index >>= 1;
  }
}

/** Siblings/path for a sequentially-inserted leaf — matches contract verify_path. */
export async function computeIncrementalMerklePath(
  hasher: PoseidonHasher,
  leaves: Hex32[],
  targetIndex: number,
  depth = 20
): Promise<{ root: Hex32; siblings: Hex32[]; directions: boolean[]; leafIndex: number }> {
  if (targetIndex < 0 || targetIndex >= leaves.length) {
    throw new Error("targetIndex out of range for incremental merkle path");
  }
  const zeroes = await buildZeroes(hasher, depth);
  const filledSubtrees = new Array<bigint>(depth).fill(0n);

  for (let leafIdx = 0; leafIdx < targetIndex; leafIdx += 1) {
    await incrementalInsertLeaf(hasher, parseHex32(leaves[leafIdx]), leafIdx, depth, zeroes, filledSubtrees);
  }

  const siblings: Hex32[] = [];
  const directions: boolean[] = [];
  let index = targetIndex;
  let currentHash = parseHex32(leaves[targetIndex]);

  for (let level = 0; level < depth; level += 1) {
    if ((index & 1) === 0) {
      siblings.push(toHex32(zeroes[level]));
      directions.push(false);
      filledSubtrees[level] = currentHash;
      currentHash = BigInt(await hasher.hash2(currentHash, zeroes[level]));
    } else {
      siblings.push(toHex32(filledSubtrees[level]));
      directions.push(true);
      currentHash = BigInt(await hasher.hash2(filledSubtrees[level], currentHash));
    }
    index >>= 1;
  }

  return { root: toHex32(currentHash), siblings, directions, leafIndex: targetIndex };
}

export async function buildLevelMaps(hasher: PoseidonHasher, leaves: Hex32[], depth = 20) {
  const zeroes = await buildZeroes(hasher, depth);
  const levels: Map<number, bigint>[] = [];
  let current = new Map<number, bigint>();
  for (let i = 0; i < leaves.length; i += 1) {
    if (leaves[i]) current.set(i, parseHex32(leaves[i]));
  }
  levels.push(current);

  for (let level = 0; level < depth; level += 1) {
    const next = new Map<number, bigint>();
    const parentIndices = new Set<number>();
    for (const idx of current.keys()) parentIndices.add(idx >> 1);
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

export function extractPath(
  levelMaps: Map<number, bigint>[],
  zeroes: bigint[],
  targetIndex: number,
  depth = 20
) {
  const siblings: Hex32[] = [];
  const directions: boolean[] = [];
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
export function tokenFieldFromContractId(contractId: string): Hex32 {
  const digest = createHash("sha256").update(contractId).digest();
  digest[0] = 0;
  return `0x${digest.toString("hex")}` as Hex32;
}

export const tokenFieldFromAddress = tokenFieldFromContractId;

export { toHex32, parseHex32 };
