import { execFileSync } from "node:child_process";
import { createHash, randomUUID } from "node:crypto";
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import http from "node:http";
import os from "node:os";
import path from "node:path";
import { loadEnvFile } from "node:process";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const RELAYER_ROOT = path.resolve(__dirname, "..");
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

function runCapture(cmd, args) {
  return execFileSync(cmd, args, { encoding: "utf8", maxBuffer: 64 * 1024 * 1024 }).trim();
}

function invokeShieldedTransfer(body) {
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
    normalizeHex(body.proofBytes),
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
  const out = runCapture("stellar", args);
  const hashLine = out.split("\n").find((line) => /Signing transaction:/i.test(line));
  const txHash = hashLine?.split(":").pop()?.trim() ?? null;
  return { output: out, txHash };
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

function invokeUnshield(body) {
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
  const out = runCapture("stellar", args);
  const hashLine = out.split("\n").find((line) => /Signing transaction:/i.test(line));
  const txHash = hashLine?.split(":").pop()?.trim() ?? null;
  return { output: out, txHash };
}

function invokeMint(body) {
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
  const out = runCapture("stellar", args);
  const hashLine = out.split("\n").find((line) => /Signing transaction:/i.test(line));
  const txHash = hashLine?.split(":").pop()?.trim() ?? null;
  return { output: out, txHash };
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
  return null;
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
  if (typeof body.proofBytes !== "string" || body.proofBytes.replace(/^0x/, "").length < 64) {
    return "Invalid proofBytes";
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
      const out = runCapture("stellar", ["tx", "fetch", txHash, "--network", NETWORK]);
      if (/Success/i.test(out)) return { status: "confirmed", detail: out };
      if (/Failed/i.test(out)) return { status: "failed", detail: out };
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
      mode: RELAYER_SECRET ? "onchain" : "cli-identity",
      network: NETWORK,
      relayerAccount: RELAYER_ACCOUNT,
      relayerAddress,
      queueSize: requests.size,
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
        const { txHash, output } = invokeShieldedTransfer(body);
        const submitted = { ...record, status: "submitted", txHash, outputTail: output.split("\n").slice(-5).join("\n") };
        requests.set(requestId, submitted);

        if (txHash) {
          void waitForTx(txHash).then((result) => {
            const current = requests.get(requestId);
            if (!current) return;
            requests.set(requestId, { ...current, status: result.status, confirmDetail: result.detail });
          });
        } else {
          requests.set(requestId, { ...submitted, status: "confirmed" });
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
        const { txHash, output } = invokeUnshield(body);
        const submitted = { ...record, status: "submitted", txHash, outputTail: output.split("\n").slice(-5).join("\n") };
        requests.set(requestId, submitted);

        if (txHash) {
          void waitForTx(txHash).then((result) => {
            const current = requests.get(requestId);
            if (!current) return;
            requests.set(requestId, { ...current, status: result.status, confirmDetail: result.detail });
          });
        } else {
          requests.set(requestId, { ...submitted, status: "confirmed" });
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
        const { txHash, output } = invokeMint(body);
        const submitted = { ...record, status: "submitted", txHash, outputTail: output.split("\n").slice(-5).join("\n") };
        requests.set(requestId, submitted);

        if (txHash) {
          void waitForTx(txHash).then((result) => {
            const current = requests.get(requestId);
            if (!current) return;
            requests.set(requestId, { ...current, status: result.status, confirmDetail: result.detail });
          });
        } else {
          requests.set(requestId, { ...submitted, status: "confirmed" });
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
