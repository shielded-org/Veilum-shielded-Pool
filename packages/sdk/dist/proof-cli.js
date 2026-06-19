import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { PROOF_BYTES, PUBLIC_INPUT_COUNT } from "./types.js";
export function writeProverToml(circuitsDir, payload) {
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
`.trimStart();
    writeFileSync(join(circuitsDir, "Prover.toml"), toml, "utf8");
}
function toolEnv() {
    const extra = [
        process.env.NOIR_TOOLCHAIN_BIN,
        join(homedir(), ".nargo/bin"),
        join(homedir(), ".bb/bin"),
    ]
        .filter(Boolean)
        .join(":");
    return { ...process.env, PATH: `${extra}:${process.env.PATH ?? ""}` };
}
function runOrThrow(cmd, args, cwd) {
    try {
        execFileSync(cmd, args, {
            cwd,
            env: toolEnv(),
            stdio: ["ignore", "pipe", "pipe"],
        });
    }
    catch (error) {
        const e = error;
        const detail = [e.stderr?.toString(), e.stdout?.toString(), e.message]
            .filter(Boolean)
            .join("\n")
            .trim();
        throw new Error(`${cmd} ${args[0]} failed${detail ? `:\n${detail}` : ""}`);
    }
}
function proveInCircuitsDir(circuitsDir, inputs) {
    const bytecode = join(circuitsDir, "target/shielded_transfer.json");
    if (!existsSync(bytecode)) {
        throw new Error(`Missing circuit bytecode at ${bytecode} — run npm run build:circuits from the repo root`);
    }
    const targetDir = join(circuitsDir, "target");
    mkdirSync(targetDir, { recursive: true });
    writeProverToml(circuitsDir, inputs);
    runOrThrow("nargo", ["execute"], circuitsDir);
    runOrThrow("bb", [
        "prove",
        "-b",
        "target/shielded_transfer.json",
        "-w",
        "target/shielded_transfer.gz",
        "-o",
        targetDir,
        "--scheme",
        "ultra_honk",
        "--oracle_hash",
        "keccak",
        "--output_format",
        "bytes_and_fields",
    ], circuitsDir);
    const proofFile = readFileSync(join(targetDir, "proof"));
    const proofBytes = proofFile.length === PUBLIC_INPUT_COUNT * 32 + PROOF_BYTES
        ? proofFile.subarray(PUBLIC_INPUT_COUNT * 32)
        : proofFile;
    const publicInputsBytes = readFileSync(join(targetDir, "public_inputs"));
    return { proofBytes: Buffer.from(proofBytes), publicInputsBytes };
}
let proveChain = Promise.resolve();
/** Serialized nargo+bb prove — one at a time on the shared circuits dir. */
export async function generateUltraHonkProofCli(circuitsDir, inputs) {
    const run = () => proveInCircuitsDir(circuitsDir, inputs);
    const next = proveChain.then(run, run);
    proveChain = next.then(() => undefined, () => undefined);
    return next;
}
