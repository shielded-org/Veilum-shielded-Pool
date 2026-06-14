import { Noir } from "@noir-lang/noir_js";
import { UltraHonkBackend } from "@aztec/bb.js";

import { initializeWasm } from "./wasm-init";
import { toHex32 } from "./utils";
import type { Hex32 } from "./types";

export type ProofInputs = {
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

type CircuitJson = { bytecode: string; abi: unknown };

export async function loadCircuitArtifact(): Promise<CircuitJson> {
  const res = await fetch("/circuits/shielded_transfer.json");
  if (!res.ok) throw new Error("Missing shielded_transfer.json");
  return (await res.json()) as CircuitJson;
}

export async function generateUltraHonkProof(inputs: ProofInputs): Promise<Uint8Array> {
  await initializeWasm();
  const circuit = await loadCircuitArtifact();
  const noir = new Noir(circuit as never);
  const { witness } = await noir.execute(inputs);
  const backend = new UltraHonkBackend(circuit.bytecode);
  const { proof } = await backend.generateProof(witness, { keccak: true });
  await backend.destroy();
  return new Uint8Array(proof);
}

export function packTransferMeta(params: {
  nullifier0: Hex32;
  nullifier1: Hex32;
  outCommitment0: Hex32;
  outCommitment1: Hex32;
  merkleRoot: Hex32;
  token: Hex32;
  fee: bigint;
}): string {
  const parts = [
    params.nullifier0,
    params.nullifier1,
    params.outCommitment0,
    params.outCommitment1,
    params.merkleRoot,
    params.token,
    toHex32(params.fee),
    toHex32(0n),
  ];
  return parts.map((p) => p.replace(/^0x/, "").padStart(64, "0")).join("");
}
