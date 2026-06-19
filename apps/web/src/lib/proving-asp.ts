import { Noir } from "@noir-lang/noir_js";
import { UltraHonkBackend } from "@aztec/bb.js";

import { initializeWasm } from "./wasm-init";
import type { Hex32 } from "./types";
import type { ProofInputs } from "./proving";

export type AspProofInputs = ProofInputs & {
  membership_blinding: Hex32;
  asp_merkle_siblings: Hex32[];
  asp_merkle_directions: boolean[];
  asp_membership_root: Hex32;
  owner_pk_public: Hex32;
};

type CircuitJson = { bytecode: string; abi: unknown };

/** Noir returns public inputs as hex field strings — Soroban expects 32-byte big-endian limbs. */
function packPublicInputs(publicInputs: string[]): Uint8Array {
  const chunks = publicInputs.map((pi) => {
    const hex = pi.startsWith("0x") ? pi.slice(2) : pi;
    return Uint8Array.from(Buffer.from(hex.padStart(64, "0"), "hex"));
  });
  const out = new Uint8Array(chunks.length * 32);
  chunks.forEach((chunk, i) => out.set(chunk, i * 32));
  return out;
}

export async function loadAspCircuitArtifact(): Promise<CircuitJson> {
  const res = await fetch("/circuits/shielded_transfer_asp.json");
  if (!res.ok) throw new Error("Missing shielded_transfer_asp.json — run build:circuits:asp");
  return (await res.json()) as CircuitJson;
}

export async function generateAspUltraHonkProof(
  inputs: AspProofInputs
): Promise<{ proof: Uint8Array; publicInputs: Uint8Array }> {
  await initializeWasm();
  const circuit = await loadAspCircuitArtifact();
  const noir = new Noir(circuit as never);
  const { witness } = await noir.execute(inputs);
  const backend = new UltraHonkBackend(circuit.bytecode);
  const { proof, publicInputs } = await backend.generateProof(witness, { keccak: true });
  await backend.destroy();
  const proofBytes = new Uint8Array(proof);
  const publicInputBytes = packPublicInputs(publicInputs);
  if (proofBytes.length !== 456 * 32) {
    throw new Error(`ASP proof must be ${456 * 32} bytes, got ${proofBytes.length}`);
  }
  if (publicInputBytes.length !== 14 * 32) {
    throw new Error(`ASP public inputs must be ${14 * 32} bytes, got ${publicInputBytes.length}`);
  }
  return { proof: proofBytes, publicInputs: publicInputBytes };
}
