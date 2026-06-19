#!/usr/bin/env node
/**
 * ASP phases 0–4 end-to-end:
 * deploy asp-membership + asp-deny, configure pool, approve user, shield with ASP path,
 * private transfer, unshield with ASP circuit + relayer gate, deny-list rejection.
 */
import { execFileSync, spawn } from "node:child_process";
import { readFileSync, writeFileSync, existsSync, mkdirSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { loadEnvFile } from "node:process";
import { fileURLToPath } from "node:url";

import {
  screenAspMembership,
  buildAspMembershipPath,
  buildDeterministicUsers,
  buildLevelMaps,
  computeAspLeafViaNoir,
  createLocalPoseidonHasher,
  decryptNoteECDH,
  deriveMembershipBlinding,
  deriveOwnerPk,
  encryptNoteECDH,
  extractPath,
  generateAspUltraHonkProofCli,
  generateUltraHonkProofCli,
  loadNetworkConfig,
  mergeDeployment,
  noteCommitment,
  nullifier,
  normalizeSeedToBytes32,
  packAspMeta,
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
if (existsSync(ENV_PATH)) loadEnvFile(ENV_PATH);

const CIRCUITS_DIR = path.join(ROOT, "packages/circuits");
const CIRCUITS_ASP_DIR = path.join(ROOT, "packages/circuits-asp");
const DEPLOYMENT_PATH = path.join(ROOT, "scripts/deployment.json");
const PUBLIC_DEPLOYMENT_PATH = path.join(ROOT, "apps/web/public/deployment.json");
const RELAYER_DIR = path.join(ROOT, "services/relayer");
const ASP_DIR = path.join(ROOT, "services/asp");
const RELAYER_SCRIPT = path.join(RELAYER_DIR, "src/server.js");
const ASP_SCRIPT = path.join(ASP_DIR, "src/server.js");
const ULTRAHONK_WASM = path.join(
  ROOT,
  "packages/contracts/rs-soroban-ultrahonk/target/wasm32v1-none/release/rs_soroban_ultrahonk.wasm"
);
const MERKLE_WASM = path.join(ROOT, "target/wasm32v1-none/release/merkle_tree.wasm");
const ASP_MEMBERSHIP_WASM = path.join(ROOT, "target/wasm32v1-none/release/asp_membership.wasm");
const ASP_DENY_WASM = path.join(ROOT, "target/wasm32v1-none/release/asp_deny.wasm");
const MOCK_TOKEN_WASM = path.join(ROOT, "target/wasm32v1-none/release/mock_token.wasm");
const POOL_WASM = path.join(ROOT, "target/wasm32v1-none/release/shielded_pool.wasm");
const ASP_GATE_WASM = path.join(ROOT, "target/wasm32v1-none/release/asp_gate.wasm");

const NETWORK = process.env.STELLAR_NETWORK || "futurenet";
const DEPLOYER_ACCOUNT = process.env.SOURCE_ACCOUNT || "bevis";
const STELLAR_SECRET_KEY = process.env.STELLAR_SECRET_KEY || null;
const USER_ACCOUNT = process.env.USER_ACCOUNT || "kenzmans";
const USER_SECRET_KEY = process.env.USER_SECRET_KEY || null;
const RECIPIENT_ACCOUNT = process.env.RECIPIENT_ACCOUNT || "taiwo";
const RECIPIENT_SECRET_KEY = process.env.RECIPIENT_SECRET_KEY || null;
const RELAYER_URL = process.env.RELAYER_URL || "http://127.0.0.1:8787";
const ASP_URL = process.env.ASP_URL || "http://127.0.0.1:8788";
const ASP_ADMIN_TOKEN = process.env.ASP_ADMIN_TOKEN || "dev-asp-admin-token";
const KEY_SEED = process.env.KEY_DERIVATION_SEED || "stellar-shielded-deterministic-seed-v1";

let relayerProcess = null;
let aspProcess = null;

function run(cmd, args, opts = {}) {
  console.log(`→ ${cmd} ${args.join(" ")}`);
  execFileSync(cmd, args, { stdio: "inherit", ...opts });
}

function sleepMs(ms) {
  try {
    execFileSync("sleep", [String(Math.ceil(ms / 1000))]);
  } catch {
    const end = Date.now() + ms;
    while (Date.now() < end) {}
  }
}

function runWithRetry(cmd, args, { attempts = 8, delayMs = 3000 } = {}) {
  for (let i = 1; i <= attempts; i++) {
    try {
      return runCapture(cmd, args);
    } catch (err) {
      const msg = String(err.stderr || err.message || "");
      const retryable = /contract not found|not found on network|try again/i.test(msg);
      if (!retryable || i === attempts) throw err;
      console.warn(`↻ retry ${i}/${attempts - 1} after: ${msg.trim().split("\n")[0]}`);
      sleepMs(delayMs);
    }
  }
}

function runCapture(cmd, args) {
  return execFileSync(cmd, args, { encoding: "utf8" }).trim();
}

function runContractInvoke(contractId, account, fn, extraArgs = []) {
  const args = [
    "contract",
    "invoke",
    "--id",
    contractId,
    "--source-account",
    account,
    "--network",
    NETWORK,
    "--",
    fn,
    ...extraArgs,
  ];
  for (let i = 1; i <= 8; i++) {
    console.log(`→ stellar ${args.join(" ")}`);
    try {
      const out = execFileSync("stellar", args, { encoding: "utf8" });
      if (out.trim()) process.stdout.write(out);
      return;
    } catch (err) {
      const msg = String(err.stderr || err.stdout || err.message || "");
      const retryable = /contract not found|not found on network|try again/i.test(msg);
      if (!retryable || i === 8) {
        if (msg.trim()) process.stderr.write(msg);
        throw err;
      }
      console.warn(`↻ retry ${i}/7 after: ${msg.trim().split("\n")[0]}`);
      sleepMs(3000);
    }
  }
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

function setupAccount({ name, secret, fund, secretEnvHint }) {
  if (secret) {
    importAccount(name, secret);
  } else if (!keyExists(name)) {
    run("stellar", ["keys", "generate", name]);
    const generated = runCapture("stellar", ["keys", "secret", name]);
    console.log(`Generated "${name}" — save ${secretEnvHint ?? "SECRET_KEY"}=${generated}`);
  }
  if (fund) fundAccount(name);
  return runCapture("stellar", ["keys", "address", name]);
}

async function waitForHealth(url, attempts = 40) {
  for (let i = 0; i < attempts; i += 1) {
    try {
      const res = await fetch(`${url.replace(/\/$/, "")}/healthz`);
      if (res.ok) return res.json();
    } catch {
      /* starting */
    }
    await new Promise((r) => setTimeout(r, 500));
  }
  throw new Error(`Service not healthy at ${url}`);
}

function killPort(port) {
  try {
    const pids = execFileSync("lsof", ["-ti", `:${port}`], { encoding: "utf8" })
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
    /* free */
  }
}

function startAsp(deployment, horizonUrl) {
  killPort(new URL(ASP_URL).port || "8788");
  aspProcess = spawn("node", [ASP_SCRIPT], {
    cwd: ASP_DIR,
    env: {
      ...process.env,
      PORT: new URL(ASP_URL).port || "8788",
      ASP_ADMIN_TOKEN,
      ASP_AUTO_SCREEN: "1",
      ASP_MEMBERSHIP_CONTRACT: deployment.aspMembership,
      ASP_DENY_CONTRACT: deployment.aspDeny,
      ASP_GATE_CONTRACT: deployment.aspGate,
      ASP_SOURCE_ACCOUNT: DEPLOYER_ACCOUNT,
      STELLAR_NETWORK: NETWORK,
      STELLAR_HORIZON_URL: horizonUrl,
      STELLAR_RPC_URL: process.env.STELLAR_RPC_URL,
      STELLAR_NETWORK_PASSPHRASE: process.env.STELLAR_NETWORK_PASSPHRASE,
    },
    stdio: ["ignore", "pipe", "inherit"],
  });
  aspProcess.stdout?.on("data", (c) => process.stdout.write(`[asp] ${c}`));
}

function startRelayer(deployment) {
  killPort(new URL(RELAYER_URL).port || "8787");
  relayerProcess = spawn("node", [RELAYER_SCRIPT], {
    cwd: RELAYER_DIR,
    env: {
      ...process.env,
      ASP_ENFORCE: "1",
      ASP_SERVICE_URL: ASP_URL,
      ASP_GATE_CONTRACT: deployment.aspGate,
      STELLAR_NETWORK: NETWORK,
    },
    stdio: ["ignore", "pipe", "inherit"],
  });
  relayerProcess.stdout?.on("data", (c) => process.stdout.write(`[relayer] ${c}`));
}

function stopProcesses() {
  for (const proc of [relayerProcess, aspProcess]) {
    if (proc) proc.kill("SIGTERM");
  }
  relayerProcess = null;
  aspProcess = null;
}

function buildAll() {
  run("bash", [path.join(ROOT, "scripts/build-circuits.sh")]);
  run("bash", [path.join(ROOT, "scripts/build-circuits-asp.sh")]);
  for (const dir of [
    "merkle-tree",
    "mock-token",
    "asp-membership",
    "asp-deny",
    "asp-gate",
    "shielded-pool",
    "rs-soroban-ultrahonk",
  ]) {
    run("stellar", ["contract", "build"], { cwd: path.join(ROOT, "packages/contracts", dir) });
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
  return runCapture("stellar", args).split("\n").pop().trim();
}

function bytes32Arg(hex) {
  return hex.replace(/^0x/, "");
}

function bytesArg(hex) {
  return hex.replace(/^0x/, "");
}

function writeDeployment(deployment) {
  const json = JSON.stringify(deployment, null, 2);
  writeFileSync(DEPLOYMENT_PATH, json);
  writeFileSync(PUBLIC_DEPLOYMENT_PATH, json);
}

async function syncPoolMerkleLeavesOnce(rpcUrl, poolId, startLedger) {
  const rpcClient = new SorobanRpc(rpcUrl);
  const eventRefs = [];
  let cursor;
  const latest = await rpcClient.getLatestLedger();
  const scanFrom = Math.max(startLedger ?? 1, latest.sequence - 5000);

  for (;;) {
    const page = cursor
      ? await rpcClient.getEvents({ cursor, filters: [{ type: "contract", contractIds: [poolId] }], limit: 200 })
      : await rpcClient.getEvents({
          startLedger: scanFrom,
          endLedger: latest.sequence,
          filters: [{ type: "contract", contractIds: [poolId] }],
          limit: 200,
        });
    for (const ev of page.events) {
      eventRefs.push({ txHash: ev.txHash, ledger: ev.ledger, transactionIndex: ev.transactionIndex, operationIndex: ev.operationIndex });
    }
    if (!page.cursor || page.events.length === 0) break;
    cursor = page.cursor;
  }

  eventRefs.sort(
    (a, b) => a.ledger - b.ledger || a.transactionIndex - b.transactionIndex || a.operationIndex - b.operationIndex
  );

  const leaves = [];
  const seen = new Set();
  for (const ref of eventRefs) {
    if (seen.has(ref.txHash)) continue;
    seen.add(ref.txHash);
    try {
      const tx = await rpcClient.getTransaction(ref.txHash);
      if (tx.status !== Api.GetTransactionStatus.SUCCESS) continue;
      const envelope = xdr.TransactionEnvelope.fromXDR(tx.envelopeXdr, "base64");
      const ops = envelope.v1?.().tx().operations() ?? [];
      for (const op of ops) {
        if (op.body().switch() !== xdr.OperationType.invokeHostFunction()) continue;
        const invoke = op.body().invokeHostFunctionOp().hostFunction().invokeContract();
        const contract = Address.fromScAddress(invoke.contractAddress()).toString();
        if (contract !== poolId) continue;
        const fn = invoke.functionName().toString();
        const args = invoke.args();
        if (fn === "shield_routed" || fn === "shield_routed_with_asp") {
          const c = args[3]?.bytes();
          if (c) leaves.push(`0x${Buffer.from(c).toString("hex").padStart(64, "0").slice(-64)}`);
        } else if (fn === "shielded_transfer_routed" && args[1]?.bytes()) {
          const meta = Buffer.from(args[1].bytes()).toString("hex");
          if (meta.length >= 256) {
            leaves.push(`0x${meta.slice(128, 192)}`, `0x${meta.slice(192, 256)}`);
          }
        } else if ((fn === "unshield" || fn === "unshield_with_asp" || fn === "fulfill_unshield") && args.length >= 7) {
          const c = args[6]?.bytes?.() ?? args[6]?.bytesN?.();
          if (c) {
            const hex = Buffer.from(c).toString("hex");
            if (hex !== "00".repeat(64)) leaves.push(`0x${hex.padStart(64, "0").slice(-64)}`);
          }
        }
      }
    } catch {
      /* skip */
    }
  }
  return leaves;
}

async function syncPoolMerkleLeaves(rpcUrl, poolId, startLedger, opts = {}) {
  const { retries = 12, delayMs = 3000 } = opts;
  for (let attempt = 0; attempt <= retries; attempt++) {
    const leaves = await syncPoolMerkleLeavesOnce(rpcUrl, poolId, startLedger);
    if (leaves.length > 0 || attempt >= retries) {
      console.log(`Synced ${leaves.length} merkle leaves`);
      return leaves;
    }
    console.log(`No pool events indexed yet (${attempt + 1}/${retries + 1}), retrying…`);
    await new Promise((r) => setTimeout(r, delayMs));
  }
  return [];
}

async function waitForCommitmentInLeaves(rpcUrl, poolId, startLedger, commitment) {
  const target = bytes32Arg(commitment).toLowerCase();
  for (let attempt = 0; attempt < 20; attempt++) {
    const leaves = await syncPoolMerkleLeavesOnce(rpcUrl, poolId, startLedger);
    if (leaves.some((l) => bytes32Arg(l).toLowerCase() === target)) {
      console.log(`Found commitment in merkle after ${attempt + 1} scan(s)`);
      return leaves;
    }
    await new Promise((r) => setTimeout(r, 3000));
  }
  throw new Error(`Commitment not indexed after retries: ${commitment}`);
}

async function merklePathForCommitment(hasher, leaves, commitment) {
  const target = bytes32Arg(commitment).toLowerCase();
  const leafIndex = leaves.findIndex((l) => bytes32Arg(l).toLowerCase() === target);
  if (leafIndex < 0) throw new Error(`Commitment not in leaves: ${commitment}`);
  const { levels, zeroes } = await buildLevelMaps(hasher, leaves);
  return { leafIndex, ...extractPath(levels, zeroes, leafIndex) };
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
  return BigInt(raw.replace(/"/g, "").trim());
}

async function main() {
  const config = loadNetworkConfig(NETWORK);
  setupStellarNetwork(config);

  const deployerAddr = setupAccount({ name: DEPLOYER_ACCOUNT, secret: STELLAR_SECRET_KEY, fund: !!config.friendbotUrl });
  const userAddr = setupAccount({ name: USER_ACCOUNT, secret: USER_SECRET_KEY, fund: !!config.friendbotUrl, secretEnvHint: "USER_SECRET_KEY" });
  const recipientAddr = setupAccount({
    name: RECIPIENT_ACCOUNT,
    secret: RECIPIENT_SECRET_KEY,
    fund: !!config.friendbotUrl,
    secretEnvHint: "RECIPIENT_SECRET_KEY",
  });

  buildAll();

  const vkPath = path.join(CIRCUITS_DIR, "target/vk");
  const vkAspPath = path.join(CIRCUITS_ASP_DIR, "target/vk");

  const deployment = {
    verifier: deployVerifier(vkPath, DEPLOYER_ACCOUNT),
    verifierAsp: deployVerifier(vkAspPath, DEPLOYER_ACCOUNT),
    merkleTree: deployWasm(MERKLE_WASM, DEPLOYER_ACCOUNT),
    aspMembership: deployWasm(ASP_MEMBERSHIP_WASM, DEPLOYER_ACCOUNT, ["--owner", deployerAddr]),
    aspDeny: deployWasm(ASP_DENY_WASM, DEPLOYER_ACCOUNT, ["--owner", deployerAddr]),
    tokens: {
      USDC: deployWasm(MOCK_TOKEN_WASM, DEPLOYER_ACCOUNT, [
        "--admin",
        deployerAddr,
        "--initial_holder",
        deployerAddr,
        "--initial_supply",
        "0",
        "--symbol",
        "USDC",
        "--name",
        "USD Coin",
      ]),
    },
  };

  deployment.shieldedPool = deployWasm(POOL_WASM, DEPLOYER_ACCOUNT, [
    "--owner",
    deployerAddr,
    "--verifier",
    deployment.verifier,
    "--merkle_tree",
    deployment.merkleTree,
  ]);

  deployment.aspGate = deployWasm(ASP_GATE_WASM, DEPLOYER_ACCOUNT, [
    "--owner",
    deployerAddr,
    "--pool",
    deployment.shieldedPool,
    "--asp_membership",
    deployment.aspMembership,
    "--asp_deny",
    deployment.aspDeny,
    "--verifier_asp",
    deployment.verifierAsp,
  ]);

  run("stellar", [
    "contract",
    "invoke",
    "--id",
    deployment.shieldedPool,
    "--source-account",
    DEPLOYER_ACCOUNT,
    "--network",
    NETWORK,
    "--",
    "configure_asp",
    "--asp_membership",
    deployment.aspMembership,
    "--asp_deny",
    deployment.aspDeny,
    "--verifier_asp",
    deployment.verifierAsp,
    "--asp_gate",
    deployment.aspGate,
    "--enforce_shield",
    "true",
  ]);

  run("stellar", [
    "contract",
    "invoke",
    "--id",
    deployment.shieldedPool,
    "--source-account",
    DEPLOYER_ACCOUNT,
    "--network",
    NETWORK,
    "--",
    "set_token_enabled",
    "--token",
    deployment.tokens.USDC,
    "--enabled",
    "true",
  ]);

  deployment.aspEnforceShield = true;
  deployment.network = NETWORK;
  writeDeployment(deployment);

  startAsp(deployment, config.horizonUrl);
  startRelayer(deployment);
  await waitForHealth(ASP_URL);
  const relayerHealth = await waitForHealth(RELAYER_URL);
  console.log("ASP + relayer ready", relayerHealth);

  const hasher = createLocalPoseidonHasher();
  const seed = normalizeSeedToBytes32(KEY_SEED);
  const users = buildDeterministicUsers(seed);
  const owner = { ...users.owner, routeCursor: 0 };
  const taiwo = { ...users.taiwo, routeCursor: 0 };
  owner.viewingPub = viewingPrivToPub(owner.viewingPriv);
  taiwo.viewingPub = viewingPrivToPub(taiwo.viewingPriv);

  const ownerPk = await deriveOwnerPk(hasher, owner.spendingKey);
  const recipientPk = await deriveOwnerPk(hasher, taiwo.spendingKey);
  const ownerPkHex = ownerPk;
  const membershipBlinding = deriveMembershipBlinding(ownerPkHex);

  const approved = await screenAspMembership(ASP_URL, ownerPkHex, userAddr);
  if (approved.status !== "approved") throw new Error(`ASP screen failed: ${approved.error}`);
  console.log("ASP approved via on-chain scan:", approved);

  const aspLeaves = [computeAspLeafViaNoir(ownerPkHex, membershipBlinding)];
  const aspPath = await buildAspMembershipPath(hasher, aspLeaves, approved.leafIndex ?? 0);

  const usdc = deployment.tokens.USDC;
  const tokenField = tokenFieldFromContractId(usdc);

  const shieldAmount = 100n;
  runContractInvoke(usdc, DEPLOYER_ACCOUNT, "mint", ["--to", userAddr, "--amount", "1000"]);
  runContractInvoke(usdc, USER_ACCOUNT, "approve", [
    "--owner",
    userAddr,
    "--spender",
    deployment.shieldedPool,
    "--amount",
    "1000",
  ]);

  const blinding0 = 41n;
  const commitment0 = await noteCommitment(hasher, ownerPk, tokenField, shieldAmount, blinding0);
  const depositRoute = routeForRecipient(owner.viewingPub, owner.routeCursor++);
  const encryptedDepositNote = encryptNoteECDH(
    {
      owner_pk: ownerPkHex,
      token: tokenField,
      amount: shieldAmount.toString(),
      blinding: toHex32(blinding0),
      commitment: commitment0,
    },
    owner.viewingPub
  );

  const aspMeta = packAspMeta({
    ownerPk: ownerPkHex,
    membershipBlinding,
    leafIndex: approved.leafIndex ?? 0,
    siblings: aspPath.siblings,
    aspRoot: approved.aspRoot ?? aspPath.root,
  });

  console.log("Shield with ASP membership path");
  runContractInvoke(deployment.shieldedPool, USER_ACCOUNT, "shield_routed", [
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
    aspMeta.toString("hex"),
  ]);

  const net = mergeDeployment(config, deployment);
  const poolLeaves = [commitment0];
  const path0 = await merklePathForCommitment(hasher, poolLeaves, commitment0);

  const onChainRoot = `0x${runWithRetry("stellar", [
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

  const nf0 = await nullifier(hasher, owner.spendingKey, commitment0);
  const recipientAmount = 40n;
  const changeAmount = 60n;
  const outBlinding0 = 77n;
  const outBlinding1 = 88n;
  const outCommitment0 = await noteCommitment(hasher, recipientPk, tokenField, recipientAmount, outBlinding0);
  const outCommitment1 = await noteCommitment(hasher, ownerPk, tokenField, changeAmount, outBlinding1);
  const route0 = routeForRecipient(taiwo.viewingPub, taiwo.routeCursor++);
  const route1 = routeForRecipient(owner.viewingPub, owner.routeCursor++);

  const transferMeta = Buffer.concat([
    Buffer.from(nf0.replace(/^0x/, ""), "hex"),
    Buffer.alloc(32),
    Buffer.from(outCommitment0.replace(/^0x/, ""), "hex"),
    Buffer.from(outCommitment1.replace(/^0x/, ""), "hex"),
    Buffer.from(onChainRoot.replace(/^0x/, ""), "hex"),
    Buffer.from(tokenField.replace(/^0x/, ""), "hex"),
    Buffer.alloc(32),
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

  const relayed = await submitShieldedTransferToRelayer(RELAYER_URL, {
    shieldedPool: deployment.shieldedPool,
    proofBytes: proofBytes.toString("hex"),
    transferMeta: transferMeta.toString("hex"),
    encryptedNote0: bytesArg(encryptNoteECDH({ token: tokenField, amount: recipientAmount.toString(), blinding: toHex32(outBlinding0), commitment: outCommitment0 }, taiwo.viewingPub)),
    encryptedNote1: bytesArg(encryptNoteECDH({ token: tokenField, amount: changeAmount.toString(), blinding: toHex32(outBlinding1), commitment: outCommitment1 }, owner.viewingPub)),
    channel0: bytes32Arg(route0.channel),
    channel1: bytes32Arg(route1.channel),
    subchannel0: bytes32Arg(route0.subchannel),
    subchannel1: bytes32Arg(route1.subchannel),
    fee: 0,
  });
  await waitForRelayerConfirmation(RELAYER_URL, relayed.requestId);
  console.log("Transfer confirmed");

  poolLeaves.push(outCommitment0, outCommitment1);
  const onChainRootAfter = `0x${runWithRetry("stellar", [
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
  const pathPayment = await merklePathForCommitment(hasher, poolLeaves, outCommitment0);

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
  const taiwoOwnerPkHex = recipientPk;
  const taiwoMembershipBlinding = deriveMembershipBlinding(taiwoOwnerPkHex);
  const taiwoApproved = await screenAspMembership(ASP_URL, taiwoOwnerPkHex, recipientAddr);
  if (taiwoApproved.status !== "approved") throw new Error(`Taiwo ASP screen failed: ${taiwoApproved.error}`);
  const taiwoAspLeaves = [
    computeAspLeafViaNoir(ownerPkHex, membershipBlinding),
    computeAspLeafViaNoir(taiwoOwnerPkHex, taiwoMembershipBlinding),
  ];
  const taiwoAspPath = await buildAspMembershipPath(
    hasher,
    taiwoAspLeaves,
    taiwoApproved.leafIndex ?? 1
  );

  const { proofBytes: aspProofBytes, publicInputsBytes } = generateAspUltraHonkProofCli(CIRCUITS_ASP_DIR, {
    spending_key: taiwo.spendingKey.toString(),
    in_amounts: [recipientAmount.toString(), "0"],
    in_blindings: [toHex32(outBlinding0), toHex32(0n)],
    merkle_siblings: [pathPayment.siblings, Array(20).fill(toHex32(0n))],
    merkle_directions: [pathPayment.directions, Array(20).fill(false)],
    out_amounts: [unshieldChangeAmount.toString(), "0"],
    out_recipient_pks: [recipientPk, toHex32(0n)],
    out_blindings: [toHex32(unshieldChangeBlinding), toHex32(0n)],
    membership_blinding: taiwoMembershipBlinding,
    asp_merkle_siblings: taiwoAspPath.siblings,
    asp_merkle_directions: taiwoAspPath.directions,
    token: tokenField,
    merkle_root: onChainRootAfter,
    nullifiers: [nfPayment, toHex32(0n)],
    out_commitments: [unshieldChangeCommitment, toHex32(0n)],
    fee: "0",
    fee_recipient_pk: toHex32(0n),
    mode: "1",
    unshield_recipient: taiwoRecipientField,
    unshield_amount: unshieldAmount.toString(),
    unshield_token_address: tokenField,
    asp_membership_root: taiwoApproved.aspRoot ?? taiwoAspPath.root,
    owner_pk_public: taiwoOwnerPkHex,
  });

  const balanceBefore = fetchTokenBalance(usdc, recipientAddr);
  const unshieldRelayed = await submitUnshieldToRelayer(RELAYER_URL, {
    shieldedPool: deployment.shieldedPool,
    proofBytes: aspProofBytes.toString("hex"),
    nullifier: bytes32Arg(nfPayment),
    token: usdc,
    recipient: recipientAddr,
    amount: unshieldAmount.toString(),
    merkleRoot: bytes32Arg(onChainRootAfter),
    newCommitment: bytes32Arg(unshieldChangeCommitment),
    useAsp: true,
    ownerPk: bytes32Arg(taiwoOwnerPkHex),
    aspGate: deployment.aspGate,
    publicInputs: publicInputsBytes.toString("hex"),
  });
  await waitForRelayerConfirmation(RELAYER_URL, unshieldRelayed.requestId);
  const balanceAfter = fetchTokenBalance(usdc, recipientAddr);
  if (balanceAfter - balanceBefore !== unshieldAmount) {
    throw new Error(`Unshield balance mismatch: expected +${unshieldAmount}, got +${balanceAfter - balanceBefore}`);
  }
  console.log("ASP unshield confirmed");

  // Deny-list rejection: deny owner, relayer should reject unshield
  await fetch(`${ASP_URL.replace(/\/$/, "")}/asp/deny`, {
    method: "POST",
    headers: { "content-type": "application/json", authorization: `Bearer ${ASP_ADMIN_TOKEN}` },
    body: JSON.stringify({ ownerPk: taiwoOwnerPkHex }),
  });

  const deniedRes = await fetch(`${RELAYER_URL.replace(/\/$/, "")}/relay/unshield`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      shieldedPool: deployment.shieldedPool,
      proofBytes: aspProofBytes.toString("hex"),
      nullifier: bytes32Arg(nfPayment),
      token: usdc,
      recipient: recipientAddr,
      amount: "1",
      merkleRoot: bytes32Arg(onChainRootAfter),
      newCommitment: bytes32Arg(toHex32(0n)),
      ownerPk: bytes32Arg(taiwoOwnerPkHex),
      aspGate: deployment.aspGate,
      publicInputs: publicInputsBytes.toString("hex"),
    }),
  });
  if (deniedRes.status !== 403) {
    throw new Error(`Expected 403 for denied owner, got ${deniedRes.status}`);
  }
  console.log("Deny-list gate OK (403)");

  console.log("ASP E2E complete on", NETWORK);
  console.log(JSON.stringify(deployment, null, 2));
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(() => stopProcesses());
