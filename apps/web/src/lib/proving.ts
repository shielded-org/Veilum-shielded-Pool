import { Noir } from "@noir-lang/noir_js";
import { UltraHonkBackend } from "@aztec/bb.js";

import { initializeWasm } from "./wasm-init";
import { PROOF_BYTES } from "./types";
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

const PUBLIC_INPUT_COUNT = 12;

export async function loadCircuitArtifact(): Promise<CircuitJson> {
  const res = await fetch("/circuits/shielded_transfer.json");
  if (!res.ok) throw new Error("Missing shielded_transfer.json");
  return (await res.json()) as CircuitJson;
}

function stripPublicInputsFromProofIfPresent(proof: Uint8Array): Uint8Array {
  const withPi = PUBLIC_INPUT_COUNT * 32 + PROOF_BYTES;
  if (proof.length === withPi) return proof.subarray(PUBLIC_INPUT_COUNT * 32);
  return proof;
}

export async function generateUltraHonkProof(inputs: ProofInputs): Promise<Uint8Array> {
  await initializeWasm();
  const circuit = await loadCircuitArtifact();
  const noir = new Noir(circuit as never);
  const { witness } = await noir.execute(inputs);
  const backend = new UltraHonkBackend(circuit.bytecode);
  const { proof, publicInputs } = await backend.generateProof(witness, { keccak: true });

  const proofBytes = stripPublicInputsFromProofIfPresent(new Uint8Array(proof));
  if (proofBytes.length !== PROOF_BYTES) {
    await backend.destroy();
    throw new Error(`Transfer proof must be ${PROOF_BYTES} bytes, got ${proofBytes.length}`);
  }

  const verified = await backend.verifyProof({ proof: proofBytes, publicInputs }, { keccak: true });
  await backend.destroy();
  if (!verified) {
    throw new Error("Transfer proof failed local verification — retry after a hard refresh");
  }

  return proofBytes;
}

/** 256-byte transfer_meta blob (must match shielded-pool `shielded_transfer_routed`). */
export function packTransferMeta(params: {
  nullifier0: Hex32;
  nullifier1: Hex32;
  outCommitment0: Hex32;
  outCommitment1: Hex32;
  merkleRoot: Hex32;
  token: Hex32;
  feeRecipientPk: Hex32;
}): string {
  const parts = [
    params.nullifier0,
    params.nullifier1,
    params.outCommitment0,
    params.outCommitment1,
    params.merkleRoot,
    params.token,
    params.feeRecipientPk,
    toHex32(0n),
  ];
  return parts.map((p) => p.replace(/^0x/, "").padStart(64, "0")).join("");
}
