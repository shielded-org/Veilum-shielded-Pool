export declare function normalizeSeedToBytes32(seedInput: string): string;
export declare function deriveDeterministicScalar(seedBytes32: string, label: string, modulus: bigint): bigint;
export declare function buildDeterministicUsers(seedBytes32: string): Record<string, {
    spendingKey: bigint;
    viewingPriv: bigint;
}>;
