#!/usr/bin/env node
/**
 * End-to-end shielded ERC20 pool on Stellar.
 *
 * - bevis: deployer, admin, relayer gas sponsor
 * - kenzmans: user account (mint recipient, shield deposit — visible on-chain)
 * - taiwo: private transfer recipient; unshields ~20 via relayer
 * - private transfer / unshield: submitted by relayer (bevis signs)
 */
import { execFileSync, spawn } from "node:child_process";
import { readFileSync, writeFileSync, existsSync, mkdirSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { loadEnvFile } from "node:process";
import { fileURLToPath } from "node:url";

import {
  buildDeterministicUsers,
  buildLevelMaps,
  createLocalPoseidonHasher,
  decryptNoteECDH,
  deriveOwnerPk,
  encryptNoteECDH,
  extractPath,
  generateUltraHonkProofCli,
  loadNetworkConfig,
  mergeDeployment,
  noteCommitment,
  nullifier,
  normalizeSeedToBytes32,
  routeForRecipient,
  submitShieldedTransferToRelayer,
  submitUnshieldToRelayer,
  toHex32,
  tokenFieldFromContractId,
  viewingPrivToPub,
  waitForRelayerConfirmation,
} from "../packages/sdk/dist/index.js";
import { Address, xdr, rpc } from "@stellar/stellar-sdk";

const { Api, Server: SorobanRpc } = rpc;

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
const ENV_PATH = path.join(ROOT, ".env");
if (existsSync(ENV_PATH)) {
  loadEnvFile(ENV_PATH);
}

const CIRCUITS_DIR = path.join(ROOT, "packages/circuits");
const DEPLOYMENT_PATH = path.join(ROOT, "scripts/deployment.json");
const PUBLIC_DEPLOYMENT_PATH = path.join(ROOT, "apps/web/public/deployment.json");
const RELAYER_DIR = path.join(ROOT, "services/relayer");
const RELAYER_SCRIPT = path.join(RELAYER_DIR, "src/server.js");
const ULTRAHONK_WASM = path.join(
  ROOT,
  "packages/contracts/rs-soroban-ultrahonk/target/wasm32v1-none/release/rs_soroban_ultrahonk.wasm"
);
const MERKLE_WASM = path.join(ROOT, "target/wasm32v1-none/release/merkle_tree.wasm");
const MOCK_TOKEN_WASM = path.join(ROOT, "target/wasm32v1-none/release/mock_token.wasm");
const POOL_WASM = path.join(ROOT, "target/wasm32v1-none/release/shielded_pool.wasm");

const STABLES = [
  { key: "USDC", symbol: "USDC", name: "USD Coin" },
  { key: "EURC", symbol: "EURC", name: "Euro Coin" },
  { key: "YLDS", symbol: "YLDS", name: "Figure YLDS" },
  { key: "MGUSD", symbol: "MGUSD", name: "MoneyGram USD" },
];

const NETWORK = process.env.STELLAR_NETWORK || "futurenet";
const DEPLOYER_ACCOUNT = process.env.SOURCE_ACCOUNT || "bevis";
const STELLAR_SECRET_KEY = process.env.STELLAR_SECRET_KEY || null;
const STELLAR_PUBLIC_KEY = process.env.STELLAR_PUBLIC_KEY || null;
const USER_ACCOUNT = process.env.USER_ACCOUNT || "kenzmans";
const USER_SECRET_KEY = process.env.USER_SECRET_KEY || null;
const RECIPIENT_ACCOUNT = process.env.RECIPIENT_ACCOUNT || "taiwo";
const RECIPIENT_SECRET_KEY = process.env.RECIPIENT_SECRET_KEY || null;
const RELAYER_URL = process.env.RELAYER_URL || "http://127.0.0.1:8787";
const KEY_SEED = process.env.KEY_DERIVATION_SEED || "stellar-shielded-deterministic-seed-v1";
const SKIP_DEPLOY = process.env.SKIP_DEPLOY === "1";
const SKIP_VERIFIER_DEPLOY = process.env.SKIP_VERIFIER_DEPLOY === "1";
const SKIP_FUND = process.env.SKIP_FUND === "1";
const SKIP_USER_FUND = process.env.SKIP_USER_FUND === "1";
const SKIP_RECIPIENT_FUND = process.env.SKIP_RECIPIENT_FUND === "1";
const SKIP_CIRCUIT_BUILD = process.env.SKIP_CIRCUIT_BUILD === "1";
const SKIP_RELAYER_START = process.env.SKIP_RELAYER_START === "1";

let relayerProcess = null;

function run(cmd, args, opts = {}) {
  console.log(`→ ${cmd} ${args.join(" ")}`);
  execFileSync(cmd, args, { stdio: "inherit", ...opts });
}

function runCapture(cmd, args) {
  return execFileSync(cmd, args, { encoding: "utf8" }).trim();
}

function keyExists(account) {
  try {
    runCapture("stellar", ["keys", "address", account]);
    return true;
  } catch {
    return false;
  }
}

function stellarConfigDir() {
  if (process.env.STELLAR_CONFIG_DIR) return process.env.STELLAR_CONFIG_DIR;
  if (process.env.XDG_CONFIG_HOME) return path.join(process.env.XDG_CONFIG_HOME, "stellar");
  return path.join(os.homedir(), ".config", "stellar");
}

function importAccount(account, secret) {
  const identityDir = path.join(stellarConfigDir(), "identity");
  mkdirSync(identityDir, { recursive: true });
  writeFileSync(path.join(identityDir, `${account}.toml`), `secret_key = "${secret}"\n`);
}

function fundAccount(account) {
  for (let i = 0; i < 5; i += 1) {
    try {
      run("stellar", ["keys", "fund", account, "--network", NETWORK]);
      return;
    } catch {
      Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 5000);
    }
  }
}

function setupStellarNetwork(config) {
  try {
    run("stellar", ["network", "remove", NETWORK], { stdio: "ignore" });
  } catch {
    /* may not exist */
  }
  run("stellar", [
    "network",
    "add",
    NETWORK,
    "--rpc-url",
    config.rpcUrl,
    "--network-passphrase",
    config.networkPassphrase,
  ]);
  run("stellar", ["network", "use", NETWORK]);
}

function setupAccount({ name, secret, fund, expectedPublicKey, secretEnvHint }) {
  if (secret) {
    importAccount(name, secret);
    console.log(`Using account "${name}" from secret in .env`);
  } else if (keyExists(name)) {
    console.log(`Using existing Stellar CLI key "${name}"`);
  } else {
    run("stellar", ["keys", "generate", name]);
    const generated = runCapture("stellar", ["keys", "secret", name]);
    const hint = secretEnvHint ?? "USER_SECRET_KEY";
    console.log(`Generated "${name}" — save ${hint}=${generated} in .env to reuse`);
  }

  const addr = runCapture("stellar", ["keys", "address", name]);
  if (expectedPublicKey && addr !== expectedPublicKey) {
    throw new Error(`Public key mismatch for ${name}: expected ${expectedPublicKey}, got ${addr}`);
  }
  if (fund) fundAccount(name);
  return addr;
}

async function waitForRelayerHealth(url, attempts = 40) {
  for (let i = 0; i < attempts; i += 1) {
    try {
      const res = await fetch(`${url.replace(/\/$/, "")}/healthz`);
      if (res.ok) return res.json();
    } catch {
      /* starting */
    }
    await new Promise((r) => setTimeout(r, 500));
  }
  throw new Error(`Relayer not healthy at ${url}`);
}

function relayerChildEnv() {
  const env = { ...process.env };
  // Signer secrets come from services/relayer/.env only
  for (const key of [
    "RELAYER_SECRET_KEY",
    "RELAYER_SOURCE_ACCOUNT",
    "RELAYER_PUBLIC_KEY",
    "STELLAR_SECRET_KEY",
    "STELLAR_PUBLIC_KEY",
    "SOURCE_ACCOUNT",
  ]) {
    delete env[key];
  }
  return env;
}

function startRelayer() {
  if (SKIP_RELAYER_START) {
    console.log("Skipping relayer spawn (SKIP_RELAYER_START=1)");
    return;
  }
  try {
    const port = new URL(RELAYER_URL).port || "8787";
    const pids = execFileSync("lsof", ["-ti", `:${port}`], {
      encoding: "utf8",
    })
      .trim()
      .split("\n")
      .filter(Boolean);
    for (const pid of pids) {
      try {
        process.kill(Number(pid), "SIGTERM");
      } catch {
        /* ignore */
      }
    }
  } catch {
    /* port free */
  }
  relayerProcess = spawn("node", [RELAYER_SCRIPT], {
    cwd: RELAYER_DIR,
    env: relayerChildEnv(),
    stdio: ["ignore", "pipe", "inherit"],
  });
  relayerProcess.stdout?.on("data", (chunk) => process.stdout.write(`[relayer] ${chunk}`));
  relayerProcess.on("exit", (code, signal) => {
    console.log(`[relayer] process exited code=${code} signal=${signal ?? ""}`);
    relayerProcess = null;
  });
  relayerProcess.on("error", (err) => {
    console.error("[relayer] process error:", err);
  });
}

function stopRelayer() {
  if (relayerProcess) {
    relayerProcess.kill("SIGTERM");
    relayerProcess = null;
  }
}

function buildCircuits() {
  if (SKIP_CIRCUIT_BUILD && existsSync(path.join(CIRCUITS_DIR, "target/vk"))) return;
  run("bash", [path.join(ROOT, "scripts/build-circuits.sh")]);
}

function buildContracts() {
  run("stellar", ["contract", "build"], { cwd: path.join(ROOT, "packages/contracts/merkle-tree") });
  run("stellar", ["contract", "build"], { cwd: path.join(ROOT, "packages/contracts/mock-token") });
  run("stellar", ["contract", "build"], { cwd: path.join(ROOT, "packages/contracts/shielded-pool") });
  if (!existsSync(ULTRAHONK_WASM)) {
    run("stellar", ["contract", "build"], {
      cwd: path.join(ROOT, "packages/contracts/rs-soroban-ultrahonk"),
    });
  }
}

function deployVerifier(vkPath, source) {
  const out = runCapture("stellar", [
    "contract",
    "deploy",
    "--wasm",
    ULTRAHONK_WASM,
    "--source-account",
    source,
    "--network",
    NETWORK,
    "--",
    "--vk_bytes-file-path",
    vkPath,
  ]);
  return out.split("\n").pop().trim();
}

function deployWasm(wasmPath, source, initArgs = []) {
  const args = ["contract", "deploy", "--wasm", wasmPath, "--source-account", source, "--network", NETWORK];
  if (initArgs.length) args.push("--", ...initArgs);
  const out = runCapture("stellar", args);
  return out.split("\n").pop().trim();
}

function bytes32Arg(hex) {
  return hex.replace(/^0x/, "");
}

function parseLatestLedgerSequence(output) {
  const m = String(output).match(/Sequence:\s*(\d+)/i);
  if (m) return Number(m[1]);
  const n = Number(String(output).trim());
  return Number.isFinite(n) ? n : null;
}

async function fetchContractDeployLedger(rpcUrl, contractId) {
  const rpcClient = new SorobanRpc(rpcUrl);
  const addr = Address.fromString(contractId);
  const key = xdr.LedgerKey.contractData(
    new xdr.LedgerKeyContractData({
      contract: addr.toScAddress(),
      key: xdr.ScVal.scvLedgerKeyContractInstance(),
      durability: xdr.ContractDataDurability.persistent(),
    })
  );
  const ent = await rpcClient.getLedgerEntries(key);
  const seq = ent.entries?.[0]?.lastModifiedLedgerSeq;
  return typeof seq === "number" ? seq : null;
}

async function resolveDeployLedger(rpcUrl, poolId) {
  const fromContract = await fetchContractDeployLedger(rpcUrl, poolId);
  if (fromContract) return fromContract;
  try {
    return parseLatestLedgerSequence(
      runCapture("stellar", ["ledger", "latest", "--network", NETWORK])
    );
  } catch {
    return null;
  }
}

function deployStableToken(deployerAddr, stable) {
  return deployWasm(MOCK_TOKEN_WASM, DEPLOYER_ACCOUNT, [
    "--admin",
    deployerAddr,
    "--initial_holder",
    deployerAddr,
    "--initial_supply",
    "0",
    "--symbol",
    stable.symbol,
    "--name",
    stable.name,
  ]);
}

function enableTokenInPool(poolId, tokenId) {
  run("stellar", [
    "contract",
    "invoke",
    "--id",
    poolId,
    "--source-account",
    DEPLOYER_ACCOUNT,
    "--network",
    NETWORK,
    "--",
    "set_token_enabled",
    "--token",
    tokenId,
    "--enabled",
    "true",
  ]);
  console.log(`  enabled ${tokenId} in pool`);
}

function enableAllStablesInPool(deployment) {
  console.log("Enabling stables in shielded pool…");
  for (const stable of STABLES) {
    const tokenId = deployment.tokens?.[stable.key];
    if (!tokenId) {
      console.warn(`  skip ${stable.key}: not in deployment.tokens`);
      continue;
    }
    enableTokenInPool(deployment.shieldedPool, tokenId);
  }
}

function usdcToken(deployment) {
  const id = deployment.tokens?.USDC;
  if (!id) throw new Error("deployment.tokens.USDC missing — deploy stables first");
  return id;
}

function normalizeDeployment(deployment) {
  deployment.tokens = deployment.tokens ?? {};
  if (deployment.mockToken && !deployment.tokens.USDC) {
    deployment.tokens.USDC = deployment.mockToken;
  }
  delete deployment.mockToken;
  delete deployment.shieldedToken;
  return deployment;
}

function writeDeploymentFiles(deployment) {
  const out = normalizeDeployment({ ...deployment });
  const json = JSON.stringify(out, null, 2);
  writeFileSync(DEPLOYMENT_PATH, json);
  writeFileSync(PUBLIC_DEPLOYMENT_PATH, json);
}

function bytesArg(hex) {
  return hex.replace(/^0x/, "");
}

function parseEnvelope(envelopeXdr) {
  if (!envelopeXdr) return null;
  if (typeof envelopeXdr === "string") return xdr.TransactionEnvelope.fromXDR(envelopeXdr, "base64");
  return envelopeXdr;
}

function getEnvelopeOperations(envelope) {
  const v1 = envelope.v1?.();
  if (v1) return v1.tx().operations();
  const v0 = envelope.v0?.();
  if (v0) return v0.tx().operations();
  const feeBump = envelope.feeBump?.();
  if (feeBump) {
    const inner = feeBump.tx().innerTx();
    const innerEnv = typeof inner.value === "function" ? inner.value() : inner;
    return getEnvelopeOperations(innerEnv);
  }
  return [];
}

function scValBytesToHex32(val) {
  if (val.switch() !== xdr.ScValType.scvBytes()) return null;
  const hex = Buffer.from(val.bytes()).toString("hex").padStart(64, "0").slice(-64);
  return `0x${hex}`;
}

function scValBytesToHex(val) {
  if (val.switch() !== xdr.ScValType.scvBytes()) return "";
  return Buffer.from(val.bytes()).toString("hex");
}

function extractCommitmentsFromTx(tx, poolId) {
  const out = [];
  const envelope = parseEnvelope(tx.envelopeXdr);
  if (!envelope) return out;
  for (const op of getEnvelopeOperations(envelope)) {
    if (op.body().switch() !== xdr.OperationType.invokeHostFunction()) continue;
    const invoke = op.body().invokeHostFunctionOp();
    const host = invoke.hostFunction();
    if (host.switch() !== xdr.HostFunctionType.hostFunctionTypeInvokeContract()) continue;
    const invokeContract = host.invokeContract();
    const contract = Address.fromScAddress(invokeContract.contractAddress()).toString();
    if (contract !== poolId) continue;
    const fn = invokeContract.functionName().toString();
    const args = invokeContract.args();
    if (fn === "shield_routed" && args.length >= 4) {
      const c = scValBytesToHex32(args[3]);
      if (c) out.push(c);
    } else if (fn === "shielded_transfer_routed" && args.length >= 2) {
      const meta = scValBytesToHex(args[1]);
      if (meta.length >= 256) {
        out.push(`0x${meta.slice(128, 192)}`, `0x${meta.slice(192, 256)}`);
      }
    } else if (fn === "unshield" && args.length >= 7) {
      const c = scValBytesToHex32(args[6]);
      if (c && c !== `0x${"00".repeat(32)}`) out.push(c);
    }
  }
  return out;
}

async function syncPoolMerkleLeavesOnce(rpcUrl, poolId, startLedger) {
  const rpcClient = new SorobanRpc(rpcUrl);
  const eventRefs = [];
  let cursor;
  const latest = await rpcClient.getLatestLedger();
  const endLedger = latest.sequence;
  const safeStart = Number.isFinite(startLedger) && startLedger > 0 ? startLedger : 1;
  const scanFrom = Math.min(safeStart, Math.max(endLedger - 5000, 1));

  for (;;) {
    const page = cursor
      ? await rpcClient.getEvents({ cursor, filters: [{ type: "contract", contractIds: [poolId] }], limit: 200 })
      : await rpcClient.getEvents({
          startLedger: scanFrom,
          endLedger,
          filters: [{ type: "contract", contractIds: [poolId] }],
          limit: 200,
        });
    for (const ev of page.events) {
      eventRefs.push({
        txHash: ev.txHash,
        ledger: ev.ledger,
        transactionIndex: ev.transactionIndex,
        operationIndex: ev.operationIndex,
      });
    }
    if (!page.cursor || page.events.length === 0) break;
    cursor = page.cursor;
  }

  eventRefs.sort(
    (a, b) =>
      a.ledger - b.ledger ||
      a.transactionIndex - b.transactionIndex ||
      a.operationIndex - b.operationIndex
  );

  const leaves = [];
  const seenTx = new Set();
  const uniqueRefs = [];
  for (const ref of eventRefs) {
    if (seenTx.has(ref.txHash)) continue;
    seenTx.add(ref.txHash);
    uniqueRefs.push(ref);
  }

  const BATCH = 8;
  for (let i = 0; i < uniqueRefs.length; i += BATCH) {
    const chunk = uniqueRefs.slice(i, i + BATCH);
    const txs = await Promise.all(
      chunk.map(async (ref) => {
        try {
          const tx = await rpcClient.getTransaction(ref.txHash);
          if (tx.status !== Api.GetTransactionStatus.SUCCESS) return [];
          return extractCommitmentsFromTx(tx, poolId);
        } catch {
          return [];
        }
      })
    );
    for (const extracted of txs) leaves.push(...extracted);
  }

  return { leaves, txCount: uniqueRefs.length };
}

async function syncPoolMerkleLeaves(rpcUrl, poolId, startLedger, opts = {}) {
  const { retries = 0, delayMs = 1500 } = opts;
  for (let attempt = 0; attempt <= retries; attempt++) {
    const { leaves, txCount } = await syncPoolMerkleLeavesOnce(rpcUrl, poolId, startLedger);
    if (leaves.length > 0 || attempt >= retries) {
      console.log(`Synced ${leaves.length} merkle leaves from ${txCount} pool txs`);
      return leaves;
    }
    console.log(`No pool events indexed yet (${attempt + 1}/${retries + 1}), retrying…`);
    await new Promise((r) => setTimeout(r, delayMs));
  }
  return [];
}

function findLeafIndex(leaves, commitment) {
  const target = bytes32Arg(commitment).toLowerCase();
  return leaves.findIndex((l) => bytes32Arg(l).toLowerCase() === target);
}

async function merklePathForCommitment(hasher, leaves, commitment) {
  const leafIndex = findLeafIndex(leaves, commitment);
  if (leafIndex < 0) throw new Error(`Commitment not in synced merkle leaves: ${commitment}`);
  const { levels, zeroes } = await buildLevelMaps(hasher, leaves);
  return { leafIndex, ...extractPath(levels, zeroes, leafIndex) };
}

function parseBalance(raw) {
  const cleaned = raw.replace(/"/g, "").trim();
  return BigInt(cleaned);
}

function fetchTokenBalance(tokenId, owner) {
  const raw = runCapture("stellar", [
    "contract",
    "invoke",
    "--id",
    tokenId,
    "--source-account",
    DEPLOYER_ACCOUNT,
    "--network",
    NETWORK,
    "--",
    "balance",
    "--id",
    owner,
  ]);
  return parseBalance(raw);
}

async function main() {
  const config = loadNetworkConfig(NETWORK);
  setupStellarNetwork(config);

  const deployerAddr = setupAccount({
    name: DEPLOYER_ACCOUNT,
    secret: STELLAR_SECRET_KEY,
    fund: config.friendbotUrl && !SKIP_FUND,
    expectedPublicKey: STELLAR_PUBLIC_KEY,
  });
  const userAddr = setupAccount({
    name: USER_ACCOUNT,
    secret: USER_SECRET_KEY,
    fund: config.friendbotUrl && !SKIP_USER_FUND,
    expectedPublicKey: null,
    secretEnvHint: "USER_SECRET_KEY",
  });
  const recipientAddr = setupAccount({
    name: RECIPIENT_ACCOUNT,
    secret: RECIPIENT_SECRET_KEY,
    fund: config.friendbotUrl && !SKIP_RECIPIENT_FUND,
    expectedPublicKey: null,
    secretEnvHint: "RECIPIENT_SECRET_KEY",
  });

  startRelayer();
  const relayerHealth = await waitForRelayerHealth(RELAYER_URL);
  console.log(
    `Relayer ready at ${RELAYER_URL} (signer: ${relayerHealth.relayerAccount} / ${relayerHealth.relayerAddress})`
  );

  buildCircuits();
  buildContracts();

  const vkPath = path.join(CIRCUITS_DIR, "target/vk");
  let deployment = existsSync(DEPLOYMENT_PATH)
    ? JSON.parse(readFileSync(DEPLOYMENT_PATH, "utf8"))
    : {};

  if (SKIP_DEPLOY && deployment.verifier) {
    console.log("Reusing verifier:", deployment.verifier);
  } else if (SKIP_VERIFIER_DEPLOY && deployment.verifier) {
    console.log("Reusing verifier:", deployment.verifier);
  } else {
    deployment.verifier = deployVerifier(vkPath, DEPLOYER_ACCOUNT);
    console.log("Verifier:", deployment.verifier);
  }

  if (!SKIP_DEPLOY) {
    deployment.merkleTree = deployWasm(MERKLE_WASM, DEPLOYER_ACCOUNT);
    console.log("Merkle tree:", deployment.merkleTree);

    deployment.tokens = {};
    for (const stable of STABLES) {
      const tokenId = deployStableToken(deployerAddr, stable);
      deployment.tokens[stable.key] = tokenId;
      console.log(`${stable.key}: ${tokenId}`);
    }

    deployment.shieldedPool = deployWasm(POOL_WASM, DEPLOYER_ACCOUNT, [
      "--owner",
      deployerAddr,
      "--verifier",
      deployment.verifier,
      "--merkle_tree",
      deployment.merkleTree,
    ]);
    console.log("Shielded pool:", deployment.shieldedPool);

    deployment.deployLedger = await resolveDeployLedger(config.rpcUrl, deployment.shieldedPool);
    deployment.indexedRouteEvents = true;
    console.log("Deploy ledger:", deployment.deployLedger);

    enableAllStablesInPool(deployment);
  } else {
    enableAllStablesInPool(deployment);
  }

  normalizeDeployment(deployment);

  if (!deployment.tokens?.USDC || !deployment.shieldedPool) {
    throw new Error("Missing tokens.USDC or shieldedPool — run without SKIP_DEPLOY=1");
  }

  deployment.network = NETWORK;
  if (deployment.indexedRouteEvents == null && deployment.shieldedPool) {
    deployment.indexedRouteEvents = true;
  }
  if (!deployment.deployLedger && deployment.shieldedPool) {
    deployment.deployLedger = await resolveDeployLedger(config.rpcUrl, deployment.shieldedPool);
  }
  writeDeploymentFiles(deployment);

  const net = mergeDeployment(config, deployment);
  const usdc = usdcToken(deployment);
  console.log("Computing Merkle path and proof (local Poseidon)...");
  const hasher = createLocalPoseidonHasher();
  const seed = normalizeSeedToBytes32(KEY_SEED);
  const users = buildDeterministicUsers(seed);
  const owner = { ...users.owner, routeCursor: 0 };
  const taiwo = { ...users.taiwo, routeCursor: 0 };
  owner.viewingPub = viewingPrivToPub(owner.viewingPriv);
  taiwo.viewingPub = viewingPrivToPub(taiwo.viewingPriv);

  const ownerPk = await deriveOwnerPk(hasher, owner.spendingKey);
  const recipientPk = await deriveOwnerPk(hasher, taiwo.spendingKey);

  const tokenFieldRaw = runCapture("stellar", [
    "contract",
    "invoke",
    "--id",
    deployment.shieldedPool,
    "--source-account",
    DEPLOYER_ACCOUNT,
    "--network",
    NETWORK,
    "--",
    "token_field",
    "--token",
    usdc,
  ]);
  const tokenField = `0x${tokenFieldRaw.replace(/"/g, "").replace(/^0x/, "").padStart(64, "0").slice(-64)}`;

  const shieldAmount = 100n;
  const mintAmount = 1000n;

  // Admin mints to user (kenzmans), not deployer
  run("stellar", [
    "contract",
    "invoke",
    "--id",
    usdc,
    "--source-account",
    DEPLOYER_ACCOUNT,
    "--network",
    NETWORK,
    "--",
    "mint",
    "--to",
    userAddr,
    "--amount",
    mintAmount.toString(),
  ]);

  run("stellar", [
    "contract",
    "invoke",
    "--id",
    usdc,
    "--source-account",
    USER_ACCOUNT,
    "--network",
    NETWORK,
    "--",
    "approve",
    "--owner",
    userAddr,
    "--spender",
    deployment.shieldedPool,
    "--amount",
    mintAmount.toString(),
  ]);

  const blinding0 = 41n;
  const commitment0 = await noteCommitment(hasher, ownerPk, tokenField, shieldAmount, blinding0);

  const depositRoute = routeForRecipient(owner.viewingPub, owner.routeCursor++);

  const encryptedDepositNote = encryptNoteECDH(
    {
      owner_pk: toHex32(ownerPk),
      token: tokenField,
      amount: shieldAmount.toString(),
      blinding: toHex32(blinding0),
      commitment: commitment0,
    },
    owner.viewingPub
  );

  console.log(`Shield deposit by user ${USER_ACCOUNT} (${userAddr})`);
  run("stellar", [
    "contract",
    "invoke",
    "--id",
    deployment.shieldedPool,
    "--source-account",
    USER_ACCOUNT,
    "--network",
    NETWORK,
    "--",
    "shield_routed",
    "--caller",
    userAddr,
    "--token",
    usdc,
    "--amount",
    shieldAmount.toString(),
    "--commitment",
    bytes32Arg(commitment0),
    "--encrypted_note",
    bytesArg(encryptedDepositNote),
    "--channel",
    bytes32Arg(depositRoute.channel),
    "--subchannel",
    bytes32Arg(depositRoute.subchannel),
    "--asp_meta",
    "00",
  ]);

  const onChainRoot = `0x${runCapture("stellar", [
    "contract",
    "invoke",
    "--id",
    deployment.merkleTree,
    "--source-account",
    DEPLOYER_ACCOUNT,
    "--network",
    NETWORK,
    "--",
    "get_last_root",
  ]).replace(/"/g, "")}`;

  const merkleStart = deployment.deployLedger ? Math.max(deployment.deployLedger - 50, 1) : 1;
  const syncedLeaves = await syncPoolMerkleLeaves(net.rpcUrl, deployment.shieldedPool, merkleStart, {
    retries: 12,
    delayMs: 2000,
  });
  const path0 = await merklePathForCommitment(hasher, syncedLeaves, commitment0);
  const leafIndex = path0.leafIndex;
  if (path0.root.toLowerCase() !== onChainRoot.toLowerCase()) {
    throw new Error(`Merkle root mismatch: computed ${path0.root} != on-chain ${onChainRoot}`);
  }

  const nf0 = await nullifier(hasher, owner.spendingKey, commitment0);
  const outBlinding0 = 77n;
  const outBlinding1 = 88n;
  const recipientAmount = 40n;
  const changeAmount = 60n;
  const outCommitment0 = await noteCommitment(hasher, recipientPk, tokenField, recipientAmount, outBlinding0);
  const outCommitment1 = await noteCommitment(hasher, ownerPk, tokenField, changeAmount, outBlinding1);

  const route0 = routeForRecipient(taiwo.viewingPub, taiwo.routeCursor++);
  const route1 = routeForRecipient(owner.viewingPub, owner.routeCursor++);

  const encryptedNote0 = encryptNoteECDH(
    { token: tokenField, amount: recipientAmount.toString(), blinding: toHex32(outBlinding0), commitment: outCommitment0 },
    taiwo.viewingPub
  );
  const encryptedNote1 = encryptNoteECDH(
    { token: tokenField, amount: changeAmount.toString(), blinding: toHex32(outBlinding1), commitment: outCommitment1 },
    owner.viewingPub
  );

  const decryptedPay = decryptNoteECDH(encryptedNote0, taiwo.viewingPriv);
  const decryptedChange = decryptNoteECDH(encryptedNote1, owner.viewingPriv);
  if (!decryptedPay || decryptedPay.amount !== recipientAmount.toString()) {
    throw new Error("Payment note encryption self-check failed");
  }
  if (!decryptedChange || decryptedChange.amount !== changeAmount.toString()) {
    throw new Error("Change note encryption self-check failed");
  }

  const transferMeta = Buffer.concat([
    Buffer.from(nf0.replace(/^0x/, ""), "hex"),
    Buffer.from(toHex32(0n).replace(/^0x/, ""), "hex"),
    Buffer.from(outCommitment0.replace(/^0x/, ""), "hex"),
    Buffer.from(outCommitment1.replace(/^0x/, ""), "hex"),
    Buffer.from(onChainRoot.replace(/^0x/, ""), "hex"),
    Buffer.from(tokenField.replace(/^0x/, ""), "hex"),
    Buffer.from(toHex32(0n).replace(/^0x/, ""), "hex"),
    Buffer.alloc(32),
  ]);

  const { proofBytes } = await generateUltraHonkProofCli(CIRCUITS_DIR, {
    spending_key: owner.spendingKey.toString(),
    in_amounts: [shieldAmount.toString(), "0"],
    in_blindings: [toHex32(blinding0), toHex32(0n)],
    merkle_siblings: [path0.siblings, Array(20).fill(toHex32(0n))],
    merkle_directions: [path0.directions, Array(20).fill(false)],
    out_amounts: [recipientAmount.toString(), changeAmount.toString()],
    out_recipient_pks: [recipientPk, ownerPk],
    out_blindings: [toHex32(outBlinding0), toHex32(outBlinding1)],
    token: tokenField,
    merkle_root: onChainRoot,
    nullifiers: [nf0, toHex32(0n)],
    out_commitments: [outCommitment0, outCommitment1],
    fee: "0",
    fee_recipient_pk: toHex32(0n),
    mode: "0",
    unshield_recipient: toHex32(0n),
    unshield_amount: "0",
    unshield_token_address: toHex32(0n),
  });

  console.log(`Private transfer to ${RECIPIENT_ACCOUNT} via relayer (signer: ${relayerHealth.relayerAccount}, not ${USER_ACCOUNT})`);
  const relayed = await submitShieldedTransferToRelayer(RELAYER_URL, {
    network: NETWORK,
    shieldedPool: deployment.shieldedPool,
    proofBytes: proofBytes.toString("hex"),
    transferMeta: transferMeta.toString("hex"),
    encryptedNote0: bytesArg(encryptedNote0),
    encryptedNote1: bytesArg(encryptedNote1),
    channel0: bytes32Arg(route0.channel),
    channel1: bytes32Arg(route1.channel),
    subchannel0: bytes32Arg(route0.subchannel),
    subchannel1: bytes32Arg(route1.subchannel),
    fee: 0,
  });
  console.log("Relayer request:", relayed.requestId, relayed.txHash || "(pending)");
  const confirmed = await waitForRelayerConfirmation(RELAYER_URL, relayed.requestId);
  console.log("Relayer confirmed tx:", confirmed.txHash);

  const spentDeposit = runCapture("stellar", [
    "contract",
    "invoke",
    "--id",
    deployment.shieldedPool,
    "--source-account",
    DEPLOYER_ACCOUNT,
    "--network",
    NETWORK,
    "--",
    "nullifier_spent",
    "--nullifier",
    bytes32Arg(nf0),
  ]);
  console.log("Deposit nullifier spent:", spentDeposit);

  const onChainRootAfterTransfer = `0x${runCapture("stellar", [
    "contract",
    "invoke",
    "--id",
    deployment.merkleTree,
    "--source-account",
    DEPLOYER_ACCOUNT,
    "--network",
    NETWORK,
    "--",
    "get_last_root",
  ]).replace(/"/g, "")}`;

  const syncedAfterTransfer = await syncPoolMerkleLeaves(net.rpcUrl, deployment.shieldedPool, merkleStart, {
    retries: 12,
    delayMs: 2000,
  });
  const pathPayment = await merklePathForCommitment(hasher, syncedAfterTransfer, outCommitment0);
  if (pathPayment.root.toLowerCase() !== onChainRootAfterTransfer.toLowerCase()) {
    throw new Error(
      `Post-transfer root mismatch: computed ${pathPayment.root} != on-chain ${onChainRootAfterTransfer}`
    );
  }

  const unshieldAmount = 20n;
  const unshieldChangeAmount = recipientAmount - unshieldAmount;
  const nfPayment = await nullifier(hasher, taiwo.spendingKey, outCommitment0);
  const unshieldChangeBlinding = 99n;
  const unshieldChangeCommitment = await noteCommitment(
    hasher,
    recipientPk,
    tokenField,
    unshieldChangeAmount,
    unshieldChangeBlinding
  );
  const taiwoRecipientField = tokenFieldFromContractId(recipientAddr);

  const unshieldRoute = routeForRecipient(taiwo.viewingPub, taiwo.routeCursor++);
  const encryptedUnshieldChange = encryptNoteECDH(
    {
      token: tokenField,
      amount: unshieldChangeAmount.toString(),
      blinding: toHex32(unshieldChangeBlinding),
      commitment: unshieldChangeCommitment,
    },
    taiwo.viewingPub
  );

  const taiwoBalanceBefore = fetchTokenBalance(usdc, recipientAddr);
  console.log(
    `${RECIPIENT_ACCOUNT} token balance before unshield:`,
    taiwoBalanceBefore.toString()
  );

  const { proofBytes: unshieldProofBytes } = await generateUltraHonkProofCli(CIRCUITS_DIR, {
    spending_key: taiwo.spendingKey.toString(),
    in_amounts: [recipientAmount.toString(), "0"],
    in_blindings: [toHex32(outBlinding0), toHex32(0n)],
    merkle_siblings: [pathPayment.siblings, Array(20).fill(toHex32(0n))],
    merkle_directions: [pathPayment.directions, Array(20).fill(false)],
    out_amounts: [unshieldChangeAmount.toString(), "0"],
    out_recipient_pks: [recipientPk, toHex32(0n)],
    out_blindings: [toHex32(unshieldChangeBlinding), toHex32(0n)],
    token: tokenField,
    merkle_root: onChainRootAfterTransfer,
    nullifiers: [nfPayment, toHex32(0n)],
    out_commitments: [unshieldChangeCommitment, toHex32(0n)],
    fee: "0",
    fee_recipient_pk: toHex32(0n),
    mode: "1",
    unshield_recipient: taiwoRecipientField,
    unshield_amount: unshieldAmount.toString(),
    unshield_token_address: tokenField,
  });

  console.log(
    `${RECIPIENT_ACCOUNT} partial unshield (${unshieldAmount}) via relayer (signer: ${relayerHealth.relayerAccount})`
  );
  await waitForRelayerHealth(RELAYER_URL);
  const unshieldRelayed = await submitUnshieldToRelayer(RELAYER_URL, {
    network: NETWORK,
    shieldedPool: deployment.shieldedPool,
    proofBytes: unshieldProofBytes.toString("hex"),
    nullifier: bytes32Arg(nfPayment),
    token: usdc,
    recipient: recipientAddr,
    amount: unshieldAmount.toString(),
    merkleRoot: bytes32Arg(onChainRootAfterTransfer),
    newCommitment: bytes32Arg(unshieldChangeCommitment),
    encryptedNote: bytesArg(encryptedUnshieldChange),
    channel: bytes32Arg(unshieldRoute.channel),
    subchannel: bytes32Arg(unshieldRoute.subchannel),
  });
  console.log("Unshield relayer request:", unshieldRelayed.requestId, unshieldRelayed.txHash || "(pending)");
  const unshieldConfirmed = await waitForRelayerConfirmation(RELAYER_URL, unshieldRelayed.requestId);
  console.log("Unshield confirmed tx:", unshieldConfirmed.txHash);

  const spentPayment = runCapture("stellar", [
    "contract",
    "invoke",
    "--id",
    deployment.shieldedPool,
    "--source-account",
    DEPLOYER_ACCOUNT,
    "--network",
    NETWORK,
    "--",
    "nullifier_spent",
    "--nullifier",
    bytes32Arg(nfPayment),
  ]);
  console.log("Payment nullifier spent:", spentPayment);

  const taiwoBalanceAfter = fetchTokenBalance(usdc, recipientAddr);
  const taiwoDelta = taiwoBalanceAfter - taiwoBalanceBefore;
  console.log(`${RECIPIENT_ACCOUNT} token balance after unshield:`, taiwoBalanceAfter.toString());
  if (taiwoDelta !== unshieldAmount) {
    throw new Error(`Unshield balance delta mismatch: expected +${unshieldAmount}, got +${taiwoDelta}`);
  }

  console.log("E2E complete on", NETWORK);

  console.log("\n=== Deployer / relayer (bevis) ===");
  console.log("Name:", DEPLOYER_ACCOUNT);
  console.log("Address:", deployerAddr);
  console.log("Secret:", STELLAR_SECRET_KEY ? "(from .env STELLAR_SECRET_KEY)" : runCapture("stellar", ["keys", "secret", DEPLOYER_ACCOUNT]));

  console.log("\n=== User (kenzmans) ===");
  console.log("Name:", USER_ACCOUNT);
  console.log("Address:", userAddr);
  console.log("Secret:", USER_SECRET_KEY ? "(from .env USER_SECRET_KEY)" : runCapture("stellar", ["keys", "secret", USER_ACCOUNT]));

  console.log(`\n=== Recipient (${RECIPIENT_ACCOUNT}) ===`);
  console.log("Name:", RECIPIENT_ACCOUNT);
  console.log("Address:", recipientAddr);
  console.log(
    "Secret:",
    RECIPIENT_SECRET_KEY
      ? "(from .env RECIPIENT_SECRET_KEY)"
      : runCapture("stellar", ["keys", "secret", RECIPIENT_ACCOUNT])
  );
  console.log("Unshielded:", unshieldAmount.toString(), "tokens");

  console.log("\n=== Routing ===");
  console.log("Deposit channel:", depositRoute.channel);
  console.log("Payment channel:", route0.channel);
  console.log("Change channel:", route1.channel);

  console.log("\n=== Contracts ===");
  console.log(JSON.stringify(net.contracts, null, 2));
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(() => {
    stopRelayer();
  });
