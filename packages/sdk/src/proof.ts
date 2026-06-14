import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { Noir } from "@noir-lang/noir_js";
import { UltraHonkBackend } from "@aztec/bb.js";

import type { Hex32 } from "./types.js";

const __dirname = dirname(fileURLToPath(import.meta.url));

export type ProofInputs = {
  /** Decimal string field element (matches nargo Prover.toml). */
  spending_key: string;
  in_amounts: [string, string];
  in_blindings: [Hex32, Hex32];
  merkle_siblings: [Hex32[], Hex32[]];
  merkle_directions: [boolean[], boolean[]];
  out_amounts: [string, string];
  out_recipient_pks: [Hex32, Hex32];
  out_blindings: [Hex32, Hex32];
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
};

export function loadCircuitArtifact(circuitsDir?: string) {
  const base = circuitsDir ?? join(__dirname, "../../circuits");
  const jsonPath = join(base, "target/shielded_transfer.json");
  return JSON.parse(readFileSync(jsonPath, "utf8")) as { bytecode: string; abi: unknown };
}

export async function generateUltraHonkProof(
  inputs: ProofInputs,
  circuitsDir?: string
): Promise<{ proofBytes: Buffer; publicInputsBytes: Buffer }> {
  const circuit = loadCircuitArtifact(circuitsDir);
  const noir = new Noir(circuit as never);
  const { witness } = await noir.execute(inputs);
  const backend = new UltraHonkBackend(circuit.bytecode);
  const { proof, publicInputs } = await backend.generateProof(witness, { keccak: true });
  await backend.destroy();

  const proofBuf = Buffer.from(proof);
  const publicInputsBuf = Buffer.concat(
    publicInputs.map((pi) => {
      const hex = pi.startsWith("0x") ? pi.slice(2) : pi;
      return Buffer.from(hex.padStart(64, "0"), "hex");
    })
  );
  return { proofBytes: proofBuf, publicInputsBytes: publicInputsBuf };
}

export function stripPublicInputsFromProof(proofWithPublicInputs: Buffer): Buffer {
  return proofWithPublicInputs.subarray(12 * 32);
}
