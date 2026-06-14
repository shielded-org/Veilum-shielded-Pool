#!/usr/bin/env node
/**
 * Deploy mock stablecoin contracts (USDC, EURC, YLDS, MGUSD) and enable each in the shielded pool.
 *
 * Requires: stellar CLI, funded deployer identity (default: bevis on testnet).
 *
 * Usage:
 *   node scripts/deploy-stables.mjs
 *   SKIP_BUILD=1 node scripts/deploy-stables.mjs   # reuse WASM, redeploy tokens only
 *   SKIP_DEPLOY=1 node scripts/deploy-stables.mjs  # only enable tokens already in deployment.json
 */
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync, writeFileSync, mkdirSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { loadEnvFile } from "node:process";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
const ENV_PATH = path.join(ROOT, ".env");
if (existsSync(ENV_PATH)) loadEnvFile(ENV_PATH);

const NETWORK = process.env.STELLAR_NETWORK || "testnet";
const DEPLOYER_ACCOUNT = process.env.STELLAR_SOURCE_ACCOUNT || "bevis";
const SKIP_BUILD = process.env.SKIP_BUILD === "1";
const SKIP_DEPLOY = process.env.SKIP_DEPLOY === "1";

const WASM_PATH = path.join(ROOT, "target/wasm32v1-none/release/mock_token.wasm");
const DEPLOYMENT_PATH = path.join(ROOT, "scripts/deployment.json");
const PUBLIC_DEPLOYMENT_PATH = path.join(ROOT, "apps/web/public/deployment.json");

const STABLES = [
  {
    key: "USDC",
    symbol: "USDC",
    name: "USD Coin",
    description: "Circle USD stablecoin (mock testnet)",
  },
  {
    key: "EURC",
    symbol: "EURC",
    name: "Euro Coin",
    description: "Circle euro stablecoin (mock testnet)",
  },
  {
    key: "YLDS",
    symbol: "YLDS",
    name: "Figure YLDS",
    description: "Yield-bearing dollar (mock testnet)",
  },
  {
    key: "MGUSD",
    symbol: "MGUSD",
    name: "MoneyGram USD",
    description: "MoneyGram USD stablecoin (mock testnet)",
  },
];

function runCapture(cmd, args) {
  return execFileSync(cmd, args, { encoding: "utf8", maxBuffer: 64 * 1024 * 1024 }).trim();
}

function run(cmd, args) {
  execFileSync(cmd, args, { stdio: "inherit", cwd: ROOT });
}

function stellarConfigDir() {
  if (process.env.STELLAR_CONFIG_DIR) return process.env.STELLAR_CONFIG_DIR;
  if (process.env.XDG_CONFIG_HOME) return path.join(process.env.XDG_CONFIG_HOME, "stellar");
  return path.join(os.homedir(), ".config", "stellar");
}

function loadNetworks() {
  return JSON.parse(readFileSync(path.join(ROOT, "packages/config/networks.json"), "utf8"));
}

function setupStellarNetwork() {
  const networks = loadNetworks();
  const cfg = networks[NETWORK];
  if (!cfg) throw new Error(`Unknown network: ${NETWORK}`);
  try {
    runCapture("stellar", ["network", "remove", NETWORK]);
  } catch {
    /* ok */
  }
  runCapture("stellar", [
    "network",
    "add",
    NETWORK,
    "--rpc-url",
    cfg.rpcUrl,
    "--network-passphrase",
    cfg.networkPassphrase,
  ]);
  runCapture("stellar", ["network", "use", NETWORK]);
  return cfg;
}

function ensureDeployerSecret() {
  const secret = process.env.STELLAR_SECRET_KEY;
  if (!secret) return;
  const identityDir = path.join(stellarConfigDir(), "identity");
  mkdirSync(identityDir, { recursive: true });
  writeFileSync(path.join(identityDir, `${DEPLOYER_ACCOUNT}.toml`), `secret_key = "${secret}"\n`);
}

function deployerAddress() {
  return runCapture("stellar", ["keys", "address", DEPLOYER_ACCOUNT]);
}

function buildMockToken() {
  if (SKIP_BUILD && existsSync(WASM_PATH)) return;
  console.log("Building mock-token contract…");
  run("npm", ["run", "build:contracts"]);
  if (!existsSync(WASM_PATH)) throw new Error(`Missing WASM: ${WASM_PATH}`);
}

function deployStableToken(deployerAddr, stable) {
  const out = runCapture("stellar", [
    "contract",
    "deploy",
    "--wasm",
    WASM_PATH,
    "--source-account",
    DEPLOYER_ACCOUNT,
    "--network",
    NETWORK,
    "--",
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
  return out.split("\n").pop().trim();
}

function enableTokenInPool(poolId, tokenId) {
  runCapture("stellar", [
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
  console.log(`  enabled in pool: ${tokenId}`);
}

function parseLatestLedgerSequence(output) {
  const m = String(output).match(/Sequence:\s*(\d+)/i);
  if (m) return Number(m[1]);
  const n = Number(String(output).trim());
  return Number.isFinite(n) ? n : null;
}

function syncPublicDeployment(deployment) {
  mkdirSync(path.dirname(PUBLIC_DEPLOYMENT_PATH), { recursive: true });
  writeFileSync(PUBLIC_DEPLOYMENT_PATH, JSON.stringify(deployment, null, 2));
}

function writeDeployment(deployment) {
  const out = { ...deployment };
  if (out.mockToken && !out.tokens?.USDC) {
    out.tokens = { ...(out.tokens ?? {}), USDC: out.mockToken };
  }
  delete out.mockToken;
  delete out.shieldedToken;
  writeFileSync(DEPLOYMENT_PATH, JSON.stringify(out, null, 2));
  syncPublicDeployment(out);
}

function main() {
  setupStellarNetwork();
  ensureDeployerSecret();
  const deployerAddr = deployerAddress();
  console.log(`Network: ${NETWORK}, deployer: ${deployerAddr}`);

  let deployment = existsSync(DEPLOYMENT_PATH)
    ? JSON.parse(readFileSync(DEPLOYMENT_PATH, "utf8"))
    : {};

  if (!deployment.shieldedPool) {
    throw new Error("deployment.json missing shieldedPool — run devnet-e2e or deploy pool first");
  }

  deployment.network = NETWORK;
  deployment.tokens = deployment.tokens ?? {};

  // Migrate legacy mockToken → USDC when reading old deployment files
  if (deployment.mockToken && !deployment.tokens.USDC) {
    deployment.tokens.USDC = deployment.mockToken;
    console.log(`Migrating mockToken → tokens.USDC (${deployment.mockToken})`);
  }
  delete deployment.mockToken;

  if (!SKIP_DEPLOY) {
    buildMockToken();
    console.log("Generating TypeScript bindings…");
    run("npm", ["run", "generate:bindings"]);

    for (const stable of STABLES) {
      if (deployment.tokens[stable.key] && process.env.FORCE_REDEPLOY !== "1") {
        console.log(`Skipping ${stable.key} (already deployed: ${deployment.tokens[stable.key]})`);
        continue;
      }
      console.log(`Deploying ${stable.key} (${stable.name})…`);
      const contractId = deployStableToken(deployerAddr, stable);
      deployment.tokens[stable.key] = contractId;
      console.log(`  ${stable.key}: ${contractId}`);
    }
  }

  console.log("Enabling tokens in shielded pool…");
  for (const stable of STABLES) {
    const tokenId = deployment.tokens[stable.key];
    if (!tokenId) {
      console.warn(`  skip ${stable.key}: not in deployment`);
      continue;
    }
    enableTokenInPool(deployment.shieldedPool, tokenId);
  }

  try {
    const ledger = parseLatestLedgerSequence(
      runCapture("stellar", ["ledger", "latest", "--network", NETWORK])
    );
    if (ledger) deployment.deployLedger = ledger;
  } catch {
    /* optional */
  }

  if (deployment.shieldedPool) {
    deployment.indexedRouteEvents = true;
  }

  writeDeployment(deployment);
  console.log("\nUpdated scripts/deployment.json and apps/web/public/deployment.json");
  console.log(JSON.stringify(deployment.tokens, null, 2));
}

main();
