import { type Hex32 } from "./types.js";
export type PoseidonHasher = {
    hash2: (a: bigint, b: bigint) => Promise<Hex32>;
    hash4: (a: bigint, b: bigint, c: bigint, d: bigint) => Promise<Hex32>;
};
declare function toHex32(value: bigint): Hex32;
declare function parseHex32(hex: Hex32 | bigint): bigint;
export declare function computeHash2ViaNoir(left: bigint, right: bigint): Hex32;
/** Local Noir Poseidon2 — matches on-chain merkle tree and circuit (no RPC). */
export declare function createLocalPoseidonHasher(): PoseidonHasher;
/** Default hasher for proofs: local Noir (fast, no network). */
export declare const createPoseidonHasher: typeof createLocalPoseidonHasher;
export declare function createCliPoseidonHasher(merkleContractId: string, network: string, sourceAccount: string): PoseidonHasher;
export declare function computeNoteHashViaNoir(owner: bigint | Hex32, token: bigint | Hex32, amount: bigint, blinding: bigint): Promise<Hex32>;
export declare function deriveOwnerPk(hasher: PoseidonHasher, spendingKey: bigint): Promise<Hex32>;
export declare function noteCommitment(hasher: PoseidonHasher, ownerPk: bigint, tokenField: Hex32, amount: bigint, blinding: bigint): Promise<Hex32>;
export declare function nullifier(hasher: PoseidonHasher, spendingKey: bigint, commitment: Hex32): Promise<Hex32>;
export declare function buildZeroes(hasher: PoseidonHasher, depth: number): Promise<bigint[]>;
/** Siblings/path for a sequentially-inserted leaf — matches contract verify_path. */
export declare function computeIncrementalMerklePath(hasher: PoseidonHasher, leaves: Hex32[], targetIndex: number, depth?: number): Promise<{
    root: Hex32;
    siblings: Hex32[];
    directions: boolean[];
    leafIndex: number;
}>;
export declare function buildLevelMaps(hasher: PoseidonHasher, leaves: Hex32[], depth?: number): Promise<{
    levels: Map<number, bigint>[];
    zeroes: bigint[];
}>;
export declare function extractPath(levelMaps: Map<number, bigint>[], zeroes: bigint[], targetIndex: number, depth?: number): {
    root: `0x${string}`;
    siblings: `0x${string}`[];
    directions: boolean[];
};
/** BN254 field for a Soroban token contract (sha256 of strkey, high byte cleared). */
export declare function tokenFieldFromContractId(contractId: string): Hex32;
export declare const tokenFieldFromAddress: typeof tokenFieldFromContractId;
export { toHex32, parseHex32 };
