import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { Noir } from "@noir-lang/noir_js";

import { BN254_FIELD_MODULUS, type Hex32 } from "./types.js";

const __dirname = dirname(fileURLToPath(import.meta.url));

type CircuitJson = { bytecode: string; abi: unknown };

const circuitCache = new Map<string, CircuitJson>();
const noirCache = new Map<string, Noir>();

function fieldFromReturnValue(returnValue: string): Hex32 {
  const s = String(returnValue).trim();
  const hexMatch = s.match(/^0x([0-9a-fA-F]{1,64})$/i);
  if (hexMatch) {
    return `0x${hexMatch[1].padStart(64, "0")}` as Hex32;
  }
  const bareHex = s.match(/^[0-9a-fA-F]{1,64}$/i);
  if (bareHex) {
    return `0x${bareHex[0].padStart(64, "0")}` as Hex32;
  }
  const cliMatch = s.match(/Circuit output: Field\((-?\d+)\)/);
  if (cliMatch) {
    const field = BigInt(cliMatch[1]);
    const normalized = ((field % BN254_FIELD_MODULUS) + BN254_FIELD_MODULUS) % BN254_FIELD_MODULUS;
    return toHex32(normalized);
  }
  const numMatch = s.match(/(-?\d+)/);
  if (!numMatch) throw new Error(`Cannot parse noir return: ${returnValue}`);
  return toHex32(BigInt(numMatch[1]));
}

function toHex32(value: bigint): Hex32 {
  const normalized = ((value % BN254_FIELD_MODULUS) + BN254_FIELD_MODULUS) % BN254_FIELD_MODULUS;
  return `0x${normalized.toString(16).padStart(64, "0")}` as Hex32;
}

function resolveCircuitJson(circuitName: string): string {
  const fileName = circuitName === "note-hash" ? "note_hash.json" : `${circuitName}.json`;
  const envDir = process.env.CIRCUIT_ARTIFACTS_DIR;
  const candidates = [
    envDir ? join(envDir, fileName) : "",
    join(__dirname, "..", "artifacts", fileName),
    join(__dirname, "..", "..", "..", "services", "asp", "artifacts", fileName),
    join(__dirname, "..", "..", "..", "apps", "web", "public", "circuits", fileName),
    join(__dirname, "..", "..", circuitName, "target", fileName),
    join(__dirname, "..", "..", "..", "packages", circuitName, "target", fileName),
  ].filter(Boolean);

  for (const path of candidates) {
    if (existsSync(path)) return path;
  }

  throw new Error(
    `Missing ${fileName} for noir.js — commit services/asp/artifacts or run nargo compile in packages/${circuitName}`
  );
}

function loadCircuit(circuitName: string): CircuitJson {
  const cached = circuitCache.get(circuitName);
  if (cached) return cached;
  const jsonPath = resolveCircuitJson(circuitName);
  const circuit = JSON.parse(readFileSync(jsonPath, "utf8")) as CircuitJson;
  circuitCache.set(circuitName, circuit);
  return circuit;
}

function getNoir(circuitName: string): Noir {
  const cached = noirCache.get(circuitName);
  if (cached) return cached;
  const circuit = loadCircuit(circuitName);
  const noir = new Noir(circuit as never);
  noirCache.set(circuitName, noir);
  return noir;
}

export async function executeNoirWasm(
  circuitName: string,
  inputs: Record<string, string | boolean>
): Promise<Hex32> {
  const noir = getNoir(circuitName);
  const { returnValue } = await noir.execute(inputs);
  return fieldFromReturnValue(String(returnValue));
}
