import { execFileSync } from "node:child_process";
import { createHash, randomUUID } from "node:crypto";
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import http from "node:http";
import os from "node:os";
import path from "node:path";
import { loadEnvFile } from "node:process";
import { fileURLToPath } from "node:url";

import { generateUltraHonkProofCli } from "@stellar-shielded/sdk";

import { createSorobanSubmitter } from "./soroban-submit.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const RELAYER_ROOT = path.resolve(__dirname, "..");
const CIRCUITS_DIR = path.resolve(RELAYER_ROOT, "../../packages/circuits");
const PROOF_BYTES_HEX = 456 * 32 * 2;

if (!existsSync(path.join(CIRCUITS_DIR, "target/shielded_transfer.json"))) {
  console.warn(
    `Warning: circuit bytecode missing at ${CIRCUITS_DIR}/target/shielded_transfer.json — run npm run build:circuits`
  );
}
const ENV_PATH = path.join(RELAYER_ROOT, ".env");
if (existsSync(ENV_PATH)) {
  loadEnvFile(ENV_PATH);
}

const port = Number(process.env.PORT || process.env.RELAYER_PORT || 8787);
const host = process.env.RELAYER_HOST || "0.0.0.0";
const NETWORK = process.env.STELLAR_NETWORK || "testnet";
const RELAYER_ACCOUNT = process.env.RELAYER_SOURCE_ACCOUNT || "bevis";
const RELAYER_SECRET = process.env.RELAYER_SECRET_KEY || null;
const RPC_URL = process.env.STELLAR_RPC_URL || "https://soroban-testnet.stellar.org:443";
const NETWORK_PASSPHRASE =
  process.env.STELLAR_NETWORK_PASSPHRASE || "Test SDF Network ; September 2015";
const RELAYER_PUBLIC_KEY = process.env.RELAYER_PUBLIC_KEY || null;
const confirmTimeoutMs = Number(process.env.RELAYER_CONFIRM_TIMEOUT_MS || 180_000);
const confirmPollMs = Number(process.env.RELAYER_CONFIRM_POLL_MS || 2_000);
const ASP_ENFORCE = process.env.ASP_ENFORCE === "1" || process.env.ASP_ENFORCE === "true";
const ASP_GATE = process.env.ASP_GATE_CONTRACT || null;
const ASP_SERVICE_URL = process.env.ASP_SERVICE_URL || "http://127.0.0.1:8788";

const RPC_FALLBACK_URLS =
  NETWORK === "testnet"
    ? [
        "https://soroban-rpc.testnet.stellar.gateway.fm",
        "https://rpc.ankr.com/stellar_testnet_soroban",
      ]
    : NETWORK === "mainnet"
      ? [
          "https://soroban-rpc.mainnet.stellar.gateway.fm",
          "https://rpc.ankr.com/stellar_soroban",
        ]
      : [];

const sorobanSubmitter = RELAYER_SECRET
  ? createSorobanSubmitter({
      secretKey: RELAYER_SECRET,
      networkPassphrase: NETWORK_PASSPHRASE,
      primaryRpcUrl: RPC_URL,
      fallbackRpcUrls: RPC_FALLBACK_URLS,
    })
  : null;

const requests = new Map();

function stellarConfigDir() {
  if (process.env.STELLAR_CONFIG_DIR) return process.env.STELLAR_CONFIG_DIR;
  if (process.env.XDG_CONFIG_HOME) return path.join(process.env.XDG_CONFIG_HOME, "stellar");
  return path.join(os.homedir(), ".config", "stellar");
}

function run(cmd, args, opts = {}) {
  execFileSync(cmd, args, { stdio: "ignore", ...opts });
}

function ensureStellarNetwork() {
  try {
    run("stellar", ["network", "remove", NETWORK]);
  } catch {
    /* may not exist */
  }
  execFileSync(
    "stellar",
    [
      "network",
      "add",
      NETWORK,
      "--rpc-url",
      RPC_URL,
      "--network-passphrase",
      NETWORK_PASSPHRASE,
    ],
    { stdio: "ignore" }
  );
  run("stellar", ["network", "use", NETWORK]);
}

function ensureRelayerIdentity() {
  if (!RELAYER_SECRET) return;
  const identityDir = path.join(stellarConfigDir(), "identity");
  mkdirSync(identityDir, { recursive: true });
  writeFileSync(path.join(identityDir, `${RELAYER_ACCOUNT}.toml`), `secret_key = "${RELAYER_SECRET}"\n`);
  if (RELAYER_PUBLIC_KEY) {
    const addr = runCapture("stellar", ["keys", "address", RELAYER_ACCOUNT]);
    if (addr !== RELAYER_PUBLIC_KEY) {
      throw new Error(`RELAYER_PUBLIC_KEY mismatch: expected ${RELAYER_PUBLIC_KEY}, got ${addr}`);
    }
  }
}

function runStellarCapture(args) {
  const rpcUrls = [RPC_URL, ...RPC_FALLBACK_URLS];
  let lastError = null;
  for (const rpcUrl of rpcUrls) {
    try {
      try {
        run("stellar", ["network", "remove", NETWORK]);
      } catch {
        /* may not exist */
      }
      execFileSync(
        "stellar",
        [
          "network",
          "add",
          NETWORK,
          "--rpc-url",
          rpcUrl,
          "--network-passphrase",
          NETWORK_PASSPHRASE,
        ],
        { stdio: "ignore" }
      );
      run("stellar", ["network", "use", NETWORK]);
      return runCapture("stellar", args);
    } catch (error) {
      lastError = error;
      const msg = error instanceof Error ? error.message : String(error);
      if (!/503|Networking|protocol error/i.test(msg)) throw error;
    }
  }
  throw lastError ?? new Error("stellar invoke failed");
}

function runCapture(cmd, args) {
  return execFileSync(cmd, args, { encoding: "utf8", maxBuffer: 64 * 1024 * 1024 }).trim();
}

function parseTxHashFromCliOutput(out) {
  const hashLine = out.split("\n").find((line) => /Signing transaction:/i.test(line));
  return hashLine?.split(":").pop()?.trim() ?? null;
}

function normalizeHex(value) {
  if (typeof value !== "string") throw new Error("Expected hex string");
  return value.replace(/^0x/, "");
}

function normalizeBytes32(value) {
  if (typeof value !== "string") throw new Error("Expected hex string");
  const hex = value.replace(/^0x/, "").toLowerCase();
  if (!/^[0-9a-f]{64}$/.test(hex)) {
    throw new Error(`Invalid bytes32 hex (${hex.length} chars)`);
  }
  return hex;
}

function normalizeMeta256(value) {
  if (typeof value !== "string") throw new Error("Expected hex string");
  const hex = value.replace(/^0x/, "").toLowerCase();
  if (!/^[0-9a-f]{512}$/.test(hex)) {
    throw new Error(`Invalid transferMeta (${hex.length} hex chars, expected 512)`);
  }
  return hex;
}

function buildUnshieldAspMeta(body) {
  const recipient = body.recipient;
  const token = body.token;
  const recipientBuf = Buffer.from(recipient, "utf8");
  const tokenBuf = Buffer.from(token, "utf8");
  const encHex =
    body.encryptedNote && normalizeHex(body.encryptedNote).length > 0
      ? normalizeHex(body.encryptedNote)
      : "";
  const encBuf = encHex.length > 0 ? Buffer.from(encHex, "hex") : Buffer.alloc(0);

  const amount = BigInt(body.amount);
  const amountBuf = Buffer.alloc(16);
  amountBuf.writeBigUInt64BE(amount >> 64n, 0);
  amountBuf.writeBigUInt64BE(amount & ((1n << 64n) - 1n), 8);

  return Buffer.concat([
    Buffer.from(normalizeBytes32(body.nullifier), "hex"),
    Buffer.from(normalizeBytes32(body.merkleRoot), "hex"),
    Buffer.from(normalizeBytes32(body.newCommitment), "hex"),
    Buffer.from(normalizeBytes32(body.channel || "0x" + "00".repeat(32)), "hex"),
    Buffer.from(normalizeBytes32(body.subchannel || "0x" + "00".repeat(32)), "hex"),
    amountBuf,
    (() => {
      const b = Buffer.alloc(4);
      b.writeUInt32BE(recipientBuf.length);
      return b;
    })(),
    recipientBuf,
    (() => {
      const b = Buffer.alloc(4);
      b.writeUInt32BE(tokenBuf.length);
      return b;
    })(),
    tokenBuf,
    (() => {
      const b = Buffer.alloc(4);
      b.writeUInt32BE(encBuf.length);
      return b;
    })(),
    encBuf,
  ]);
}

function bufferFromHexLoose(value) {
  const hex = normalizeHex(value);
  return hex.length > 0 ? Buffer.from(hex, "hex") : Buffer.alloc(0);
}

function validateProofInputs(pi) {
  if (!pi || typeof pi !== "object") return "Invalid proofInputs";
  if (typeof pi.spending_key !== "string") return "proofInputs.spending_key required";
  if (!Array.isArray(pi.in_amounts) || pi.in_amounts.length !== 2) {
    return "proofInputs.in_amounts must be [string, string]";
  }
  if (!Array.isArray(pi.merkle_siblings) || pi.merkle_siblings.length !== 2) {
    return "proofInputs.merkle_siblings required";
  }
  if (!Array.isArray(pi.nullifiers) || pi.nullifiers.length !== 2) {
    return "proofInputs.nullifiers required";
  }
  if (!Array.isArray(pi.out_commitments) || pi.out_commitments.length !== 2) {
    return "proofInputs.out_commitments required";
  }
  if (typeof pi.token !== "string" || typeof pi.merkle_root !== "string") {
    return "proofInputs.token and merkle_root required";
  }
  return null;
}

/** CLI proving (nargo + bb) matches on-chain verifier; browser bb.js proofs may not. */
async function resolveTransferProofBytes(body) {
  if (body.proofInputs) {
    const err = validateProofInputs(body.proofInputs);
    if (err) throw new Error(err);
    const { proofBytes } = await generateUltraHonkProofCli(CIRCUITS_DIR, body.proofInputs);
    const hex = proofBytes.toString("hex");
    if (hex.length !== PROOF_BYTES_HEX) {
      throw new Error(`CLI proof length ${hex.length}, expected ${PROOF_BYTES_HEX}`);
    }
    return hex;
  }
  const hex = normalizeHex(body.proofBytes);
  if (hex.length !== PROOF_BYTES_HEX) {
    throw new Error(`proofBytes length ${hex.length}, expected ${PROOF_BYTES_HEX}`);
  }
  return hex;
}

async function invokeShieldedTransfer(body) {
  const proofHex = await resolveTransferProofBytes(body);
  if (sorobanSubmitter) {
    const txHash = await sorobanSubmitter.submitContractInvoke(
      body.shieldedPool,
      "shielded_transfer_routed",
      [
        sorobanSubmitter.bytesArg(Buffer.from(proofHex, "hex")),
        sorobanSubmitter.bytesArg(Buffer.from(normalizeMeta256(body.transferMeta), "hex")),
        sorobanSubmitter.bytesArg(bufferFromHexLoose(body.encryptedNote0)),
        sorobanSubmitter.bytesArg(bufferFromHexLoose(body.encryptedNote1)),
        sorobanSubmitter.bytesArg(Buffer.from(normalizeBytes32(body.channel0), "hex")),
        sorobanSubmitter.bytesArg(Buffer.from(normalizeBytes32(body.channel1), "hex")),
        sorobanSubmitter.bytesArg(Buffer.from(normalizeBytes32(body.subchannel0), "hex")),
        sorobanSubmitter.bytesArg(Buffer.from(normalizeBytes32(body.subchannel1), "hex")),
        sorobanSubmitter.u128Arg(body.fee ?? 0),
      ]
    );
    return { output: `sdk submit ${txHash}`, txHash };
  }

  const args = [
    "contract",
    "invoke",
    "--id",
    body.shieldedPool,
    "--source-account",
    RELAYER_ACCOUNT,
    "--network",
    NETWORK,
    "--",
    "shielded_transfer_routed",
    "--proof_bytes",
    proofHex,
    "--transfer_meta",
    normalizeMeta256(body.transferMeta),
    "--encrypted_note0",
    normalizeHex(body.encryptedNote0),
    "--encrypted_note1",
    normalizeHex(body.encryptedNote1),
    "--channel0",
    normalizeBytes32(body.channel0),
    "--channel1",
    normalizeBytes32(body.channel1),
    "--subchannel0",
    normalizeBytes32(body.subchannel0),
    "--subchannel1",
    normalizeBytes32(body.subchannel1),
    "--fee",
    String(body.fee ?? 0),
  ];
  const out = runStellarCapture(args);
  return { output: out, txHash: parseTxHashFromCliOutput(out) };
}

async function invokeUnshieldAsp(body) {
  const gate = body.aspGate || ASP_GATE;
  if (!gate) throw new Error("ASP gate contract not configured");

  const proofHex = normalizeHex(body.proofBytes);
  const inputsHex = normalizeHex(body.publicInputs);
  const proofBundle = Buffer.from(proofHex + inputsHex, "hex");
  const meta = buildUnshieldAspMeta(body);

  if (sorobanSubmitter) {
    const txHash = await sorobanSubmitter.submitContractInvoke(gate, "unshield_asp", [
      sorobanSubmitter.bytesArg(proofBundle),
      sorobanSubmitter.bytesArg(meta),
    ]);
    return { output: `sdk submit ${txHash}`, txHash };
  }

  const args = [
    "contract",
    "invoke",
    "--id",
    gate,
    "--source-account",
    RELAYER_ACCOUNT,
    "--network",
    NETWORK,
    "--",
    "unshield_asp",
    "--proof_bundle",
    proofBundle.toString("hex"),
    "--meta",
    meta.toString("hex"),
  ];
  const out = runStellarCapture(args);
  return { output: out, txHash: parseTxHashFromCliOutput(out) };
}

async function invokeUnshield(body) {
  if (body.useAsp === true) {
    return invokeUnshieldAsp(body);
  }

  const encBuf =
    body.encryptedNote && normalizeHex(body.encryptedNote).length > 0
      ? bufferFromHexLoose(body.encryptedNote)
      : Buffer.alloc(0);

  if (sorobanSubmitter) {
    const txHash = await sorobanSubmitter.submitContractInvoke(body.shieldedPool, "unshield", [
      sorobanSubmitter.bytesArg(bufferFromHexLoose(body.proofBytes)),
      sorobanSubmitter.bytesArg(Buffer.from(normalizeBytes32(body.nullifier), "hex")),
      sorobanSubmitter.addressArg(body.token),
      sorobanSubmitter.addressArg(body.recipient),
      sorobanSubmitter.i128Arg(body.amount),
      sorobanSubmitter.bytesArg(Buffer.from(normalizeBytes32(body.merkleRoot), "hex")),
      sorobanSubmitter.bytesArg(Buffer.from(normalizeBytes32(body.newCommitment), "hex")),
      sorobanSubmitter.bytesArg(encBuf),
      sorobanSubmitter.bytesArg(
        Buffer.from(normalizeBytes32(body.channel || "0x" + "00".repeat(32)), "hex")
      ),
      sorobanSubmitter.bytesArg(
        Buffer.from(normalizeBytes32(body.subchannel || "0x" + "00".repeat(32)), "hex")
      ),
    ]);
    return { output: `sdk submit ${txHash}`, txHash };
  }

  const args = [
    "contract",
    "invoke",
    "--id",
    body.shieldedPool,
    "--source-account",
    RELAYER_ACCOUNT,
    "--network",
    NETWORK,
    "--",
    "unshield",
    "--proof_bytes",
    normalizeHex(body.proofBytes),
    "--nullifier",
    normalizeBytes32(body.nullifier),
    "--token",
    body.token,
    "--recipient",
    body.recipient,
    "--amount",
    String(body.amount),
    "--merkle_root",
    normalizeBytes32(body.merkleRoot),
    "--new_commitment",
    normalizeBytes32(body.newCommitment),
    "--encrypted_note",
    body.encryptedNote && normalizeHex(body.encryptedNote).length > 0
      ? normalizeHex(body.encryptedNote)
      : "00",
    "--channel",
    normalizeBytes32(body.channel || "0x" + "00".repeat(32)),
    "--subchannel",
    normalizeBytes32(body.subchannel || "0x" + "00".repeat(32)),
  ];
  const out = runStellarCapture(args);
  return { output: out, txHash: parseTxHashFromCliOutput(out) };
}

async function invokeMint(body) {
  if (sorobanSubmitter) {
    const txHash = await sorobanSubmitter.submitContractInvoke(body.token, "mint", [
      sorobanSubmitter.addressArg(body.recipient),
      sorobanSubmitter.i128Arg(body.amount),
    ]);
    return { output: `sdk submit ${txHash}`, txHash };
  }

  const args = [
    "contract",
    "invoke",
    "--id",
    body.token,
    "--source-account",
    RELAYER_ACCOUNT,
    "--network",
    NETWORK,
    "--",
    "mint",
    "--to",
    body.recipient,
    "--amount",
    String(body.amount),
  ];
  const out = runStellarCapture(args);
  return { output: out, txHash: parseTxHashFromCliOutput(out) };
}

function parseFaucetAmount(value) {
  if (typeof value === "bigint") return value;
  if (typeof value === "number" && Number.isFinite(value)) return BigInt(Math.trunc(value));
  if (typeof value === "string" && value.trim() !== "") return BigInt(value.trim());
  throw new Error("Invalid amount");
}

function validateFaucetPayload(body) {
  if (!body || typeof body !== "object") return "Missing payload";
  if (typeof body.token !== "string" || body.token.length < 10) return "Missing or invalid token";
  if (typeof body.recipient !== "string" || !body.recipient.startsWith("G")) {
    return "Invalid recipient address";
  }
  try {
    const amount = parseFaucetAmount(body.amount);
    if (amount <= 0n) return "Amount must be positive";
    if (amount > 1_000_000_000n) return "Amount exceeds faucet limit (1,000,000,000)";
  } catch {
    return "Invalid amount";
  }
  return null;
}

function validateUnshieldPayload(body) {
  if (!body || typeof body !== "object") return "Missing payload";
  if (typeof body.shieldedPool !== "string") return "Missing shieldedPool";
  if (typeof body.proofBytes !== "string") return "Invalid proofBytes";
  if (typeof body.token !== "string") return "Invalid token";
  if (typeof body.recipient !== "string") return "Invalid recipient";
  if (body.amount == null) return "Missing amount";
  for (const field of ["nullifier", "merkleRoot", "newCommitment"]) {
    try {
      normalizeBytes32(body[field]);
    } catch (e) {
      return e instanceof Error ? `${field}: ${e.message}` : `Invalid ${field}`;
    }
  }
  if (body.useAsp === true) {
    for (const field of ["ownerPk", "publicInputs"]) {
      try {
        if (field === "publicInputs") normalizeHex(body[field]);
        else normalizeBytes32(body[field]);
      } catch (e) {
        return e instanceof Error ? `${field}: ${e.message}` : `Invalid ${field}`;
      }
    }
  }
  return null;
}

async function checkAspAllowed(ownerPk) {
  const base = ASP_SERVICE_URL.replace(/\/$/, "");
  const res = await fetch(`${base}/asp/check/${encodeURIComponent(ownerPk)}`);
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error || `ASP check failed (${res.status})`);
  }
}

function json(res, statusCode, payload) {
  res.writeHead(statusCode, {
    "content-type": "application/json",
    "access-control-allow-origin": "*",
    "access-control-allow-methods": "GET,POST,OPTIONS",
    "access-control-allow-headers": "content-type",
  });
  res.end(JSON.stringify(payload));
}

function validatePayload(body) {
  if (!body || typeof body !== "object") return "Missing payload";
  if (typeof body.shieldedPool !== "string" || body.shieldedPool.length < 10) {
    return "Missing or invalid shieldedPool contract id";
  }
  const hasProofInputs = body.proofInputs && typeof body.proofInputs === "object";
  const proofHexLen =
    typeof body.proofBytes === "string" ? body.proofBytes.replace(/^0x/, "").length : 0;
  if (!hasProofInputs && proofHexLen !== PROOF_BYTES_HEX) {
    return `Provide proofInputs or proofBytes (${PROOF_BYTES_HEX} hex chars)`;
  }
  if (hasProofInputs) {
    const piErr = validateProofInputs(body.proofInputs);
    if (piErr) return piErr;
  }
  if (typeof body.transferMeta !== "string") {
    return "Invalid transferMeta";
  }
  try {
    normalizeMeta256(body.transferMeta);
  } catch (e) {
    return e instanceof Error ? e.message : "transferMeta must be 256 bytes";
  }
  for (const field of [
    "encryptedNote0",
    "encryptedNote1",
    "channel0",
    "channel1",
    "subchannel0",
    "subchannel1",
  ]) {
    if (typeof body[field] !== "string" || body[field].length === 0) {
      return `Missing ${field}`;
    }
  }
  for (const field of ["channel0", "channel1", "subchannel0", "subchannel1"]) {
    try {
      normalizeBytes32(body[field]);
    } catch (e) {
      return e instanceof Error ? `${field}: ${e.message}` : `Invalid ${field}`;
    }
  }
  return null;
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function waitForTx(txHash) {
  const started = Date.now();
  while (Date.now() - started < confirmTimeoutMs) {
    try {
      if (sorobanSubmitter) {
        const result = await sorobanSubmitter.fetchTransactionStatus(txHash);
        if (result.status === "confirmed" || result.status === "failed") return result;
      } else {
        const out = runStellarCapture(["tx", "fetch", txHash, "--network", NETWORK]);
        if (/Success/i.test(out)) return { status: "confirmed", detail: out };
        if (/Failed/i.test(out)) return { status: "failed", detail: out };
      }
    } catch {
      /* not yet available */
    }
    await sleep(confirmPollMs);
  }
  return { status: "timeout", detail: null };
}

ensureStellarNetwork();
ensureRelayerIdentity();

const server = http.createServer((req, res) => {
  if (req.method === "OPTIONS") {
    res.writeHead(204, {
      "access-control-allow-origin": "*",
      "access-control-allow-methods": "GET,POST,OPTIONS",
      "access-control-allow-headers": "content-type",
      "access-control-max-age": "86400",
    });
    res.end();
    return;
  }

  if (req.method === "GET" && req.url === "/healthz") {
    let relayerAddress = null;
    try {
      relayerAddress = runCapture("stellar", ["keys", "address", RELAYER_ACCOUNT]);
    } catch {
      /* ignore */
    }
    return json(res, 200, {
      ok: true,
      mode: sorobanSubmitter ? "sdk" : RELAYER_SECRET ? "sdk-missing" : "cli-identity",
      proveMode: "cli",
      network: NETWORK,
      relayerAccount: RELAYER_ACCOUNT,
      relayerAddress: sorobanSubmitter?.publicKey ?? relayerAddress,
      queueSize: requests.size,
      aspEnforce: ASP_ENFORCE,
      aspServiceUrl: ASP_SERVICE_URL,
    });
  }

  if (req.method === "GET" && req.url?.startsWith("/relay/status/")) {
    const requestId = req.url.split("/").at(-1);
    const status = requests.get(requestId);
    if (!status) return json(res, 404, { error: "Request not found" });
    return json(res, 200, status);
  }

  if (req.method === "POST" && req.url === "/relay/shielded-transfer") {
    let raw = "";
    req.on("data", (chunk) => {
      raw += chunk;
      if (raw.length > 2_000_000) req.destroy();
    });
    req.on("end", async () => {
      let body;
      try {
        body = JSON.parse(raw || "{}");
      } catch {
        return json(res, 400, { accepted: false, error: "Invalid JSON" });
      }
      const err = validatePayload(body);
      if (err) return json(res, 400, { accepted: false, error: err });

      const requestId = randomUUID();
      const record = {
        accepted: true,
        requestId,
        network: NETWORK,
        status: "queued",
        txHash: null,
        createdAt: new Date().toISOString(),
        relayerAccount: RELAYER_ACCOUNT,
      };
      requests.set(requestId, record);

      try {
        const { txHash, output } = await invokeShieldedTransfer(body);
        const submitted = { ...record, status: "submitted", txHash, outputTail: output.split("\n").slice(-5).join("\n") };
        requests.set(requestId, submitted);

        if (txHash) {
          void waitForTx(txHash).then((result) => {
            const current = requests.get(requestId);
            if (!current) return;
            const nextStatus =
              result.status === "confirmed"
                ? "confirmed"
                : result.status === "failed"
                  ? "failed"
                  : "timeout";
            requests.set(requestId, {
              ...current,
              status: nextStatus,
              confirmDetail: result.detail,
              ...(nextStatus !== "confirmed" ? { error: `On-chain ${nextStatus}` } : {}),
            });
          });
        } else {
          requests.set(requestId, {
            ...submitted,
            status: "failed",
            error: "No transaction hash returned from submitter",
          });
        }
        return json(res, 200, requests.get(requestId));
      } catch (error) {
        const failed = {
          ...record,
          status: "failed",
          error: error instanceof Error ? error.message : String(error),
        };
        requests.set(requestId, failed);
        return json(res, 500, failed);
      }
    });
    return;
  }

  if (req.method === "POST" && req.url === "/relay/shield") {
    return json(res, 410, {
      accepted: false,
      error: "Relayed shield is disabled: shield_routed requires depositor auth and leaks identity.",
    });
  }

  if (req.method === "POST" && req.url === "/relay/unshield") {
    let raw = "";
    req.on("data", (chunk) => {
      raw += chunk;
      if (raw.length > 2_000_000) req.destroy();
    });
    req.on("end", async () => {
      let body;
      try {
        body = JSON.parse(raw || "{}");
      } catch {
        return json(res, 400, { accepted: false, error: "Invalid JSON" });
      }
      const err = validateUnshieldPayload(body);
      if (err) return json(res, 400, { accepted: false, error: err });

      if (ASP_ENFORCE || body.useAsp === true) {
        if (!body.ownerPk) {
          return json(res, 400, { accepted: false, error: "ownerPk required when ASP is enforced" });
        }
        try {
          await checkAspAllowed(body.ownerPk);
        } catch (error) {
          return json(res, 403, {
            accepted: false,
            error: error instanceof Error ? error.message : String(error),
          });
        }
      }

      const requestId = randomUUID();
      const record = {
        accepted: true,
        requestId,
        network: NETWORK,
        status: "queued",
        txHash: null,
        createdAt: new Date().toISOString(),
        relayerAccount: RELAYER_ACCOUNT,
      };
      requests.set(requestId, record);

      try {
        const { txHash, output } = await invokeUnshield(body);
        const submitted = { ...record, status: "submitted", txHash, outputTail: output.split("\n").slice(-5).join("\n") };
        requests.set(requestId, submitted);

        if (txHash) {
          void waitForTx(txHash).then((result) => {
            const current = requests.get(requestId);
            if (!current) return;
            const nextStatus =
              result.status === "confirmed"
                ? "confirmed"
                : result.status === "failed"
                  ? "failed"
                  : "timeout";
            requests.set(requestId, {
              ...current,
              status: nextStatus,
              confirmDetail: result.detail,
              ...(nextStatus !== "confirmed" ? { error: `On-chain ${nextStatus}` } : {}),
            });
          });
        } else {
          requests.set(requestId, {
            ...submitted,
            status: "failed",
            error: "No transaction hash returned from submitter",
          });
        }
        return json(res, 200, requests.get(requestId));
      } catch (error) {
        const failed = {
          ...record,
          status: "failed",
          error: error instanceof Error ? error.message : String(error),
        };
        requests.set(requestId, failed);
        return json(res, 500, failed);
      }
    });
    return;
  }

  if (req.method === "POST" && req.url === "/faucet/mint") {
    let raw = "";
    req.on("data", (chunk) => {
      raw += chunk;
      if (raw.length > 10_000) req.destroy();
    });
    req.on("end", async () => {
      let body;
      try {
        body = JSON.parse(raw || "{}");
      } catch {
        return json(res, 400, { accepted: false, error: "Invalid JSON" });
      }
      const err = validateFaucetPayload(body);
      if (err) return json(res, 400, { accepted: false, error: err });

      const requestId = randomUUID();
      const record = {
        accepted: true,
        requestId,
        network: NETWORK,
        status: "queued",
        txHash: null,
        createdAt: new Date().toISOString(),
        relayerAccount: RELAYER_ACCOUNT,
      };
      requests.set(requestId, record);

      try {
        const { txHash, output } = await invokeMint(body);
        const submitted = { ...record, status: "submitted", txHash, outputTail: output.split("\n").slice(-5).join("\n") };
        requests.set(requestId, submitted);

        if (txHash) {
          void waitForTx(txHash).then((result) => {
            const current = requests.get(requestId);
            if (!current) return;
            const nextStatus =
              result.status === "confirmed"
                ? "confirmed"
                : result.status === "failed"
                  ? "failed"
                  : "timeout";
            requests.set(requestId, {
              ...current,
              status: nextStatus,
              confirmDetail: result.detail,
              ...(nextStatus !== "confirmed" ? { error: `On-chain ${nextStatus}` } : {}),
            });
          });
        } else {
          requests.set(requestId, {
            ...submitted,
            status: "failed",
            error: "No transaction hash returned from submitter",
          });
        }
        return json(res, 200, requests.get(requestId));
      } catch (error) {
        const failed = {
          ...record,
          status: "failed",
          error: error instanceof Error ? error.message : String(error),
        };
        requests.set(requestId, failed);
        return json(res, 500, failed);
      }
    });
    return;
  }

  return json(res, 404, { error: "Not found" });
});

server.listen(port, host, () => {
  console.log(`Stellar relayer listening on http://${host}:${port}`);
  console.log(`Network=${NETWORK} signer=${RELAYER_ACCOUNT}`);
});
server.on("error", (err) => {
  console.error("Relayer server error:", err);
  process.exit(1);
});
