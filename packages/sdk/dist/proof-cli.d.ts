import type { ProofInputs } from "./proof.js";
export declare function writeProverToml(circuitsDir: string, payload: ProofInputs): void;
/** Serialized nargo+bb prove — one at a time on the shared circuits dir. */
export declare function generateUltraHonkProofCli(circuitsDir: string, inputs: ProofInputs): Promise<{
    proofBytes: Buffer<ArrayBuffer>;
    publicInputsBytes: NonSharedBuffer;
}>;
