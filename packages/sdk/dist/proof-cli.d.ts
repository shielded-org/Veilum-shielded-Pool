import type { ProofInputs } from "./proof.js";
export declare function writeProverToml(circuitsDir: string, payload: ProofInputs): void;
export declare function generateUltraHonkProofCli(circuitsDir: string, inputs: ProofInputs): {
    proofBytes: NonSharedBuffer;
    publicInputsBytes: NonSharedBuffer;
};
