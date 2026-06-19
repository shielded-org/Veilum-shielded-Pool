import { type Hex32 } from "./types.js";
import type { PoseidonHasher } from "./hash.js";
export declare const ASP_TREE_DEPTH = 10;
export declare const ASP_MEMBERSHIP_DOMAIN = 2n;
export declare function deriveMembershipBlinding(ownerPk: Hex32, label?: string): Hex32;
export declare function computeAspLeafWasm(ownerPk: Hex32 | bigint, membershipBlinding: Hex32 | bigint): Promise<Hex32>;
export declare function computeAspLeafViaNoir(ownerPk: Hex32 | bigint, membershipBlinding: Hex32 | bigint): Promise<Hex32>;
export declare function aspLeaf(_hasher: {
    hash2: (a: bigint, b: bigint) => Promise<Hex32>;
}, ownerPk: Hex32 | bigint, membershipBlinding: Hex32 | bigint): Promise<Hex32>;
export declare function buildAspMembershipPath(hasher: PoseidonHasher, leaves: Hex32[], leafIndex: number): Promise<{
    root: Hex32;
    siblings: Hex32[];
    directions: boolean[];
    leafIndex: number;
}>;
export type AspApprovalRecord = {
    ownerPk: Hex32;
    membershipBlinding: Hex32;
    leafIndex: number | null;
    aspRoot: Hex32;
    status: "pending" | "approved" | "denied" | "unknown";
};
export declare function fetchAspStatus(aspUrl: string, ownerPk: Hex32): Promise<AspApprovalRecord>;
export declare function registerAspMembership(aspUrl: string, ownerPk: Hex32, options?: {
    stellarAddress?: string;
    tokenContractId?: string;
}): Promise<any>;
export type AspScanResult = {
    clean: boolean;
    reasons: string[];
    inboundSources: Array<{
        address: string;
        reason: string;
        txHash?: string;
        hits: number;
    }>;
    inboundCount?: number;
    stellarAddress?: string;
    scannedAt: string;
};
export type AspScreenResponse = {
    ok: boolean;
    status: "approved" | "denied" | "pending" | "unknown";
    ownerPk: Hex32;
    auto?: boolean;
    scan?: AspScanResult | null;
    error?: string;
    leafIndex?: number;
    aspRoot?: Hex32;
    membershipBlinding?: Hex32;
};
/** On-chain fund-source scan → auto approve/deny + ASP membership insert or deny on-chain. */
export declare function screenAspMembership(aspUrl: string, ownerPk: Hex32, stellarAddress: string, tokenContractId?: string): Promise<AspScreenResponse>;
/** Run screen if needed; returns when status is approved or throws on deny. */
export declare function ensureAspMembership(aspUrl: string, ownerPk: Hex32, stellarAddress: string, tokenContractId?: string): Promise<AspScreenResponse>;
export declare function approveAspMembership(aspUrl: string, adminToken: string, ownerPk: Hex32, membershipBlinding?: Hex32): Promise<any>;
export declare function packAspMeta(params: {
    ownerPk: Hex32;
    membershipBlinding: Hex32;
    leafIndex: number;
    siblings: Hex32[];
    aspRoot: Hex32;
}): Buffer;
/** proof || public_inputs for asp-gate.unshield_asp */
export declare function packUnshieldAspProofBundle(proofBytes: Buffer, publicInputsBytes: Buffer): Buffer;
/** Fixed + variable meta for asp-gate.unshield_asp */
export declare function packUnshieldAspMeta(params: {
    nullifier: Hex32;
    merkleRoot: Hex32;
    newCommitment: Hex32;
    channel: Hex32;
    subchannel: Hex32;
    amount: bigint;
    recipient: string;
    token: string;
    encryptedNote?: string;
}): Buffer;
export declare function checkAspAllowed(aspUrl: string, ownerPk: Hex32): Promise<boolean>;
