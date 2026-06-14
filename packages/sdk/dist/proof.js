import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { Noir } from "@noir-lang/noir_js";
import { UltraHonkBackend } from "@aztec/bb.js";
const __dirname = dirname(fileURLToPath(import.meta.url));
export function loadCircuitArtifact(circuitsDir) {
    const base = circuitsDir ?? join(__dirname, "../../circuits");
    const jsonPath = join(base, "target/shielded_transfer.json");
    return JSON.parse(readFileSync(jsonPath, "utf8"));
}
export async function generateUltraHonkProof(inputs, circuitsDir) {
    const circuit = loadCircuitArtifact(circuitsDir);
    const noir = new Noir(circuit);
    const { witness } = await noir.execute(inputs);
    const backend = new UltraHonkBackend(circuit.bytecode);
    const { proof, publicInputs } = await backend.generateProof(witness, { keccak: true });
    await backend.destroy();
    const proofBuf = Buffer.from(proof);
    const publicInputsBuf = Buffer.concat(publicInputs.map((pi) => {
        const hex = pi.startsWith("0x") ? pi.slice(2) : pi;
        return Buffer.from(hex.padStart(64, "0"), "hex");
    }));
    return { proofBytes: proofBuf, publicInputsBytes: publicInputsBuf };
}
export function stripPublicInputsFromProof(proofWithPublicInputs) {
    return proofWithPublicInputs.subarray(12 * 32);
}
