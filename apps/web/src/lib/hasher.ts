import { Noir } from "@noir-lang/noir_js";

import { initializeWasm } from "./wasm-init";
import { parseHex32, toHex32 } from "./utils";
import type { Hex32 } from "./types";

type CircuitJson = { bytecode: string; abi: unknown };

const hash2Cache = new Map<string, Hex32>();
const noteHashCache = new Map<string, Hex32>();
let hash2Circuit: CircuitJson | null = null;
let noteHashCircuit: CircuitJson | null = null;

function cacheKey(values: bigint[]): string {
  return values.map((v) => v.toString()).join("|");
}

function fieldFromReturnValue(returnValue: string): Hex32 {
  const s = String(returnValue).trim();
  // noir_js may return `0xf5de7e…` (63 hex digits) — pad before validating length.
  const hexMatch = s.match(/^0x([0-9a-fA-F]{1,64})$/i);
  if (hexMatch) {
    return `0x${hexMatch[1].padStart(64, "0")}` as Hex32;
  }
  const bareHex = s.match(/^[0-9a-fA-F]{1,64}$/i);
  if (bareHex) {
    return `0x${bareHex[0].padStart(64, "0")}` as Hex32;
  }
  const numMatch = s.match(/(-?\d+)/);
  if (!numMatch) throw new Error(`Cannot parse noir return: ${returnValue}`);
  return toHex32(BigInt(numMatch[1]));
}

async function loadCircuit(name: string): Promise<CircuitJson> {
  const res = await fetch(`/circuits/${name}.json`);
  if (!res.ok) throw new Error(`Missing circuit ${name}.json`);
  return (await res.json()) as CircuitJson;
}

async function getHash2Circuit(): Promise<CircuitJson> {
  if (!hash2Circuit) hash2Circuit = await loadCircuit("hash2");
  return hash2Circuit;
}

async function getNoteHashCircuit(): Promise<CircuitJson> {
  if (!noteHashCircuit) noteHashCircuit = await loadCircuit("note_hash");
  return noteHashCircuit;
}

export type PoseidonHasher = {
  hash2: (a: bigint, b: bigint) => Promise<Hex32>;
  hash4: (a: bigint, b: bigint, c: bigint, d: bigint) => Promise<Hex32>;
};

let browserHasherPromise: Promise<PoseidonHasher> | null = null;

/** Clear WASM hash caches (e.g. after fixing field parsing — hard refresh also works). */
export function clearPoseidonCaches(): void {
  hash2Cache.clear();
  noteHashCache.clear();
  browserHasherPromise = null;
  cachedZeroes = null;
}

/** Singleton WASM hasher — avoids re-init on every wallet refresh. */
export function getBrowserPoseidonHasher(): Promise<PoseidonHasher> {
  if (!browserHasherPromise) browserHasherPromise = createBrowserPoseidonHasher();
  return browserHasherPromise;
}

export async function createBrowserPoseidonHasher(): Promise<PoseidonHasher> {
  await initializeWasm();

  async function hash2(a: bigint, b: bigint): Promise<Hex32> {
    const key = cacheKey([a, b]);
    const cached = hash2Cache.get(key);
    if (cached) return cached;
    const circuit = await getHash2Circuit();
    const noir = new Noir(circuit as never);
    const { returnValue } = await noir.execute({ left: a.toString(), right: b.toString() });
    const result = fieldFromReturnValue(String(returnValue));
    hash2Cache.set(key, result);
    return result;
  }

  async function hash4(a: bigint, b: bigint, c: bigint, d: bigint): Promise<Hex32> {
    const key = cacheKey([a, b, c, d]);
    const cached = noteHashCache.get(key);
    if (cached) return cached;
    const circuit = await getNoteHashCircuit();
    const noir = new Noir(circuit as never);
    const { returnValue } = await noir.execute({
      owner: toHex32(a),
      token: toHex32(b),
      amount: c.toString(),
      blinding: d.toString(),
    });
    const result = fieldFromReturnValue(String(returnValue));
    noteHashCache.set(key, result);
    return result;
  }

  return { hash2, hash4 };
}

export async function deriveOwnerPk(hasher: PoseidonHasher, spendingKey: bigint): Promise<Hex32> {
  return hasher.hash2(spendingKey, 1n);
}

export async function noteCommitment(
  hasher: PoseidonHasher,
  ownerPk: bigint | Hex32,
  tokenField: Hex32,
  amount: bigint,
  blinding: bigint
): Promise<Hex32> {
  const owner = typeof ownerPk === "bigint" ? ownerPk : parseHex32(ownerPk);
  return hasher.hash4(owner, parseHex32(tokenField), amount, blinding);
}

export async function nullifier(
  hasher: PoseidonHasher,
  spendingKey: bigint,
  commitment: Hex32
): Promise<Hex32> {
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

let cachedZeroes: { depth: number; values: bigint[] } | null = null;

async function zeroesForDepth(hasher: PoseidonHasher, depth: number): Promise<bigint[]> {
  if (cachedZeroes?.depth === depth) return cachedZeroes.values;
  const values = await buildZeroes(hasher, depth);
  cachedZeroes = { depth, values };
  return values;
}

/** Merkle spend path — builds sparse level maps (correct for any leaf count). */
export async function buildSpendPath(
  hasher: PoseidonHasher,
  leaves: Hex32[],
  targetIndex: number,
  depth = 20
) {
  const { levels, zeroes } = await buildLevelMaps(hasher, leaves, depth);
  return extractPath(levels, zeroes, targetIndex, depth);
}

/** Matches IncrementalMerkleTree::try_insert — same root as on-chain append-only inserts. */
export async function computeIncrementalMerkleRoot(
  hasher: PoseidonHasher,
  leaves: Hex32[],
  depth = 20
): Promise<Hex32> {
  const zeroes = await zeroesForDepth(hasher, depth);
  const filledSubtrees = new Array<bigint>(depth).fill(0n);

  let currentRoot = 0n;
  for (let i = 0; i < depth; i += 1) {
    currentRoot = BigInt(await hasher.hash2(currentRoot, currentRoot));
  }

  for (let leafIndex = 0; leafIndex < leaves.length; leafIndex += 1) {
    let index = leafIndex;
    let currentHash = parseHex32(leaves[leafIndex]);
    for (let level = 0; level < depth; level += 1) {
      if ((index & 1) === 0) {
        filledSubtrees[level] = currentHash;
        currentHash = BigInt(await hasher.hash2(currentHash, zeroes[level]));
      } else {
        currentHash = BigInt(await hasher.hash2(filledSubtrees[level], currentHash));
      }
      index >>= 1;
    }
    currentRoot = currentHash;
  }
  return toHex32(currentRoot);
}

/** Batch sparse-tree root (shielded-token parity). */
export async function computeBatchMerkleRoot(
  hasher: PoseidonHasher,
  leaves: Hex32[],
  depth = 20
): Promise<Hex32> {
  if (leaves.length === 0) return computeIncrementalMerkleRoot(hasher, [], depth);
  const path = await buildSpendPath(hasher, leaves, 0, depth);
  return path.root;
}

/** Prefer incremental root (matches contract); fall back to batch rebuild. */
export async function computeMerkleRootFromLeaves(
  hasher: PoseidonHasher,
  leaves: Hex32[],
  depth = 20
): Promise<{ root: Hex32; method: "incremental" | "batch" }> {
  const incremental = await computeIncrementalMerkleRoot(hasher, leaves, depth);
  const batch = await computeBatchMerkleRoot(hasher, leaves, depth);
  if (incremental.toLowerCase() === batch.toLowerCase()) {
    return { root: incremental, method: "incremental" };
  }
  return { root: incremental, method: "batch" };
}

export async function buildLevelMaps(hasher: PoseidonHasher, leaves: Hex32[], depth = 20) {
  const zeroes = await zeroesForDepth(hasher, depth);
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
