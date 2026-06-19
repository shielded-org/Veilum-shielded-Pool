import { execFileSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
export function loadAspCircuitArtifact(circuitsDir) {
    const jsonPath = join(circuitsDir, "target/shielded_transfer_asp.json");
    return JSON.parse(readFileSync(jsonPath, "utf8"));
}
export function writeAspProverToml(circuitsDir, payload) {
    const toml = `
spending_key = "${payload.spending_key}"
in_amounts = ["${payload.in_amounts[0]}", "${payload.in_amounts[1]}"]
in_blindings = ["${payload.in_blindings[0]}", "${payload.in_blindings[1]}"]
merkle_siblings = [
  [${payload.merkle_siblings[0].map((x) => `"${x}"`).join(", ")}],
  [${payload.merkle_siblings[1].map((x) => `"${x}"`).join(", ")}]
]
merkle_directions = [
  [${payload.merkle_directions[0].map((x) => (x ? "true" : "false")).join(", ")}],
  [${payload.merkle_directions[1].map((x) => (x ? "true" : "false")).join(", ")}]
]
out_amounts = ["${payload.out_amounts[0]}", "${payload.out_amounts[1]}"]
out_recipient_pks = ["${payload.out_recipient_pks[0]}", "${payload.out_recipient_pks[1]}"]
out_blindings = ["${payload.out_blindings[0]}", "${payload.out_blindings[1]}"]
membership_blinding = "${payload.membership_blinding}"
asp_merkle_siblings = [${payload.asp_merkle_siblings.map((x) => `"${x}"`).join(", ")}]
asp_merkle_directions = [${payload.asp_merkle_directions.map((x) => (x ? "true" : "false")).join(", ")}]
token = "${payload.token}"
merkle_root = "${payload.merkle_root}"
nullifiers = ["${payload.nullifiers[0]}", "${payload.nullifiers[1]}"]
out_commitments = ["${payload.out_commitments[0]}", "${payload.out_commitments[1]}"]
fee = "${payload.fee}"
fee_recipient_pk = "${payload.fee_recipient_pk}"
mode = "${payload.mode}"
unshield_recipient = "${payload.unshield_recipient}"
unshield_amount = "${payload.unshield_amount}"
unshield_token_address = "${payload.unshield_token_address}"
asp_membership_root = "${payload.asp_membership_root}"
owner_pk_public = "${payload.owner_pk_public}"
`.trimStart();
    writeFileSync(join(circuitsDir, "Prover.toml"), toml, "utf8");
}
export function generateAspUltraHonkProofCli(circuitsDir, inputs) {
    writeAspProverToml(circuitsDir, inputs);
    execFileSync("nargo", ["execute"], { cwd: circuitsDir, stdio: "inherit" });
    execFileSync("bb", [
        "prove",
        "-b",
        "target/shielded_transfer_asp.json",
        "-w",
        "target/shielded_transfer_asp.gz",
        "-o",
        "target",
        "--scheme",
        "ultra_honk",
        "--oracle_hash",
        "keccak",
        "--output_format",
        "bytes_and_fields",
    ], { cwd: circuitsDir, stdio: "inherit" });
    const proofFile = readFileSync(join(circuitsDir, "target/proof"));
    const proofBytes = proofFile.length === 14 * 32 + 456 * 32 ? proofFile.subarray(14 * 32) : proofFile;
    const publicInputsBytes = readFileSync(join(circuitsDir, "target/public_inputs"));
    return { proofBytes, publicInputsBytes };
}
