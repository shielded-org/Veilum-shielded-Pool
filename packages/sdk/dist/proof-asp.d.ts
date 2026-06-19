import type { Hex32 } from "./types.js";
export type AspProofInputs = {
    spending_key: string;
    in_amounts: [string, string];
    in_blindings: [Hex32, Hex32];
    merkle_siblings: [Hex32[], Hex32[]];
    merkle_directions: [boolean[], boolean[]];
    out_amounts: [string, string];
    out_recipient_pks: [Hex32, Hex32];
    out_blindings: [Hex32, Hex32];
    membership_blinding: Hex32;
    asp_merkle_siblings: Hex32[];
    asp_merkle_directions: boolean[];
    token: Hex32;
    merkle_root: Hex32;
    nullifiers: [Hex32, Hex32];
    out_commitments: [Hex32, Hex32];
    fee: string;
    fee_recipient_pk: Hex32;
    mode: string;
    unshield_recipient: Hex32;
    unshield_amount: string;
    unshield_token_address: Hex32;
    asp_membership_root: Hex32;
    owner_pk_public: Hex32;
};
export declare function loadAspCircuitArtifact(circuitsDir: string): {
    bytecode: string;
    abi: unknown;
};
export declare function writeAspProverToml(circuitsDir: string, payload: AspProofInputs): void;
export declare function generateAspUltraHonkProofCli(circuitsDir: string, inputs: AspProofInputs): {
    proofBytes: NonSharedBuffer;
    publicInputsBytes: NonSharedBuffer;
};
