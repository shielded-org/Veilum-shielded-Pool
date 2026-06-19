import type { ProofInputs } from "./proof.js";
export declare function writeProverToml(circuitsDir: string, payload: ProofInputs): void;
export declare function nativeProvingToolchainAvailable(): boolean;
/** Prove with native nargo+bb when available, otherwise bb.js WASM (Render-friendly). */
export declare function generateUltraHonkProofCli(circuitsDir: string, inputs: ProofInputs): Promise<{
    proofBytes: Buffer<ArrayBufferLike>;
    publicInputsBytes: Buffer<ArrayBufferLike>;
}>;
