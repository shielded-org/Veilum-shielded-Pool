#!/usr/bin/env node
import { execFileSync } from "node:child_process";
import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
const WASM_DIR = path.join(ROOT, "target/wasm32v1-none/release");
const OUT = path.join(ROOT, "packages/contract-clients");

const CONTRACTS = [
  { name: "mock-token", wasm: "mock_token.wasm" },
  { name: "shielded-pool", wasm: "shielded_pool.wasm" },
  { name: "merkle-tree", wasm: "merkle_tree.wasm" },
];

function run(cmd, args) {
  execFileSync(cmd, args, { stdio: "inherit", cwd: ROOT });
}

if (!existsSync(path.join(WASM_DIR, "mock_token.wasm"))) {
  console.log("Building contracts…");
  run("npm", ["run", "build:contracts"]);
}

for (const { name, wasm } of CONTRACTS) {
  const wasmPath = path.join(WASM_DIR, wasm);
  if (!existsSync(wasmPath)) {
    throw new Error(`Missing WASM: ${wasmPath}`);
  }
  const outDir = path.join(OUT, name);
  console.log(`Generating bindings for ${name}…`);
  run("stellar", [
    "contract",
    "bindings",
    "typescript",
    "--wasm",
    wasmPath,
    "--output-dir",
    outDir,
    "--overwrite",
  ]);
}

console.log("Contract bindings generated in packages/contract-clients/");
