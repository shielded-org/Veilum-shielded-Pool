import { execFileSync } from "node:child_process";
import { createHash, randomUUID } from "node:crypto";
import {
  existsSync,
  mkdirSync,
  readFileSync,
  writeFileSync,
} from "node:fs";
import http from "node:http";
import os from "node:os";
import path from "node:path";
import { loadEnvFile } from "node:process";
import { fileURLToPath } from "node:url";

import {
  buildAspMembershipPath,
  computeAspLeafViaNoir,
  createLocalPoseidonHasher,
} from "@stellar-shielded/sdk";

import { Keypair } from "@stellar/stellar-sdk";

import {
  backfillMembershipsFromChain,
  extendAspSorobanReader,
  resolveMembershipChain,
} from "./asp-chain.js";
import {
  approveMember,
  denyMember,
  deriveMembershipBlinding as deriveBlinding,
  membershipStatus,
  queuePending,
  runAspScreen,
} from "./asp-pipeline.js";
import { createAspSorobanReader, resolveAspSourceAddress } from "./soroban-read.js";
import { bytes32ScVal, createSorobanSubmitter } from "./soroban-submit.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
if (!process.env.CIRCUIT_ARTIFACTS_DIR) {
  process.env.CIRCUIT_ARTIFACTS_DIR = path.join(__dirname, "..", "artifacts");
}
const ASP_ROOT = path.resolve(__dirname, "..");
const ENV_PATH = path.join(ASP_ROOT, ".env");
if (existsSync(ENV_PATH)) {
  loadEnvFile(ENV_PATH);
}

const port = Number(process.env.PORT || process.env.ASP_PORT || 8788);
const host = process.env.ASP_HOST || "0.0.0.0";
const ADMIN_TOKEN = process.env.ASP_ADMIN_TOKEN || "dev-asp-admin-token";
const DATA_DIR = process.env.ASP_DATA_DIR || path.join(ASP_ROOT, "data");
const NETWORK = process.env.STELLAR_NETWORK || "futurenet";
const RPC_URL = process.env.STELLAR_RPC_URL || "https://rpc-futurenet.stellar.org:443";
const HORIZON_URL =
  process.env.STELLAR_HORIZON_URL ||
  (NETWORK === "testnet"
    ? "https://horizon-testnet.stellar.org"
    : NETWORK === "mainnet"
      ? "https://horizon.stellar.org"
      : NETWORK === "local"
        ? "http://localhost:8000"
        : "https://horizon-futurenet.stellar.org");
const NETWORK_PASSPHRASE =
  process.env.STELLAR_NETWORK_PASSPHRASE || "Test SDF Future Network ; October 2022";
const SOURCE_ACCOUNT = process.env.ASP_SOURCE_ACCOUNT || "bevis";
const ASP_SECRET = process.env.ASP_SECRET_KEY || null;
const ASP_PUBLIC_KEY = process.env.ASP_PUBLIC_KEY || null;
const ASP_MEMBERSHIP = process.env.ASP_MEMBERSHIP_CONTRACT || null;
const ASP_DENY = process.env.ASP_DENY_CONTRACT || null;
const AUTO_SCREEN =
  process.env.ASP_AUTO_SCREEN !== "0" && process.env.ASP_AUTO_SCREEN !== "false";

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

const SOURCE_ADDRESS = resolveAspSourceAddress({
  sourceAddress: process.env.ASP_SOURCE_ADDRESS || null,
  publicKey: ASP_PUBLIC_KEY,
  secretKey: ASP_SECRET,
  sourceAccount: SOURCE_ACCOUNT,
});

const aspSubmitter = ASP_SECRET
  ? createSorobanSubmitter({
      secretKey: ASP_SECRET,
      networkPassphrase: NETWORK_PASSPHRASE,
      primaryRpcUrl: RPC_URL,
      fallbackRpcUrls: RPC_FALLBACK_URLS,
    })
  : null;

const aspSorobanBase =
  ASP_MEMBERSHIP &&
  createAspSorobanReader({
    networkPassphrase: NETWORK_PASSPHRASE,
    primaryRpcUrl: RPC_URL,
    fallbackRpcUrls: RPC_FALLBACK_URLS,
    sourceAddress: SOURCE_ADDRESS,
    contractId: ASP_MEMBERSHIP,
  });

const aspSoroban =
  aspSorobanBase && ASP_MEMBERSHIP
    ? extendAspSorobanReader(aspSorobanBase, {
        contractId: ASP_MEMBERSHIP,
        horizonUrl: HORIZON_URL,
        sourceAddress: SOURCE_ADDRESS,
      })
    : null;

const DB_PATH = path.join(DATA_DIR, "asp-registry.json");

function stellarConfigDir() {
  if (process.env.STELLAR_CONFIG_DIR) return process.env.STELLAR_CONFIG_DIR;
  if (process.env.XDG_CONFIG_HOME) return path.join(process.env.XDG_CONFIG_HOME, "stellar");
  return path.join(os.homedir(), ".config", "stellar");
}

function ensureAspIdentity() {
  if (!ASP_SECRET) return;
  const identityDir = path.join(stellarConfigDir(), "identity");
  mkdirSync(identityDir, { recursive: true });
  writeFileSync(
    path.join(identityDir, `${SOURCE_ACCOUNT}.toml`),
    `secret_key = "${ASP_SECRET}"\n`
  );
  if (ASP_PUBLIC_KEY) {
    const addr = Keypair.fromSecret(ASP_SECRET).publicKey();
    if (addr !== ASP_PUBLIC_KEY) {
      throw new Error(`ASP_PUBLIC_KEY mismatch: expected ${ASP_PUBLIC_KEY}, got ${addr}`);
    }
  }
}

function ensureStellarNetwork() {
  try {
    execFileSync("stellar", ["--version"], { stdio: "ignore" });
  } catch {
    return;
  }
  try {
    execFileSync("stellar", ["network", "remove", NETWORK], { stdio: "ignore" });
  } catch {
    /* may not exist */
  }
  execFileSync(
    "stellar",
    ["network", "add", NETWORK, "--rpc-url", RPC_URL, "--network-passphrase", NETWORK_PASSPHRASE],
    { stdio: "ignore" }
  );
  execFileSync("stellar", ["network", "use", NETWORK], { stdio: "ignore" });
}

function loadDb() {
  mkdirSync(DATA_DIR, { recursive: true });
  if (!existsSync(DB_PATH)) {
    const initial = { pending: [], approved: [], denied: [], memberships: [] };
    writeFileSync(DB_PATH, JSON.stringify(initial, null, 2));
    return initial;
  }
  return JSON.parse(readFileSync(DB_PATH, "utf8"));
}

function saveDb(db) {
  mkdirSync(DATA_DIR, { recursive: true });
  writeFileSync(DB_PATH, JSON.stringify(db, null, 2));
}

function normalizePk(hex) {
  const h = hex.replace(/^0x/, "").toLowerCase();
  if (!/^[0-9a-f]{64}$/.test(h)) throw new Error("ownerPk must be 32-byte hex");
  return `0x${h}`;
}

function normalizeBlinding(hex) {
  const h = hex.replace(/^0x/, "").toLowerCase();
  if (!/^[0-9a-f]{64}$/.test(h)) throw new Error("membershipBlinding must be 32-byte hex");
  return `0x${h}`;
}

function normalizeStellarAddress(addr) {
  if (!addr || typeof addr !== "string") throw new Error("stellarAddress required");
  const trimmed = addr.trim();
  if (!trimmed.startsWith("G") && !trimmed.startsWith("C")) {
    throw new Error("stellarAddress must be a G... or C... address");
  }
  return trimmed;
}

function deriveMembershipBlinding(ownerPk) {
  return deriveBlinding(ownerPk, createHash);
}

async function invokeInsertMember(ownerPk, membershipBlinding) {
  if (!ASP_MEMBERSHIP) throw new Error("ASP_MEMBERSHIP_CONTRACT not configured");
  if (!aspSubmitter) throw new Error("ASP_SECRET_KEY required for on-chain membership");
  const args = [bytes32ScVal(ownerPk), bytes32ScVal(membershipBlinding)];
  const leafIndex = await aspSubmitter.simulateContractInvoke(
    ASP_MEMBERSHIP,
    "insert_member",
    args
  );
  await aspSubmitter.submitContractInvoke(ASP_MEMBERSHIP, "insert_member", args);
  aspSoroban?.invalidateMembershipIndex?.();
  const aspRoot = await aspSoroban.getLastRoot();
  return { leafIndex: Number(leafIndex), aspRoot };
}

async function invokeDenyOnChain(ownerPk, deny = true) {
  if (!ASP_DENY || !aspSubmitter) return;
  const fn = deny ? "deny" : "undeny";
  await aspSubmitter.submitContractInvoke(ASP_DENY, fn, [bytes32ScVal(ownerPk)]);
}

async function validateAspRoot(aspRoot, approvedRecord) {
  if (approvedRecord?.aspRoot?.toLowerCase() === aspRoot.toLowerCase()) {
    return true;
  }
  if (!aspSoroban) {
    throw new Error("ASP_MEMBERSHIP_CONTRACT not configured");
  }
  return aspSoroban.isKnownRoot(aspRoot);
}

const screenDeps = () => ({
  dataDir: DATA_DIR,
  horizonUrl: HORIZON_URL,
  deriveBlinding: deriveMembershipBlinding,
  invokeInsertMember: (ownerPk, membershipBlinding) =>
    invokeInsertMember(ownerPk, membershipBlinding),
  invokeDenyOnChain,
  contractId: ASP_MEMBERSHIP,
});

function json(res, statusCode, payload) {
  res.writeHead(statusCode, {
    "content-type": "application/json",
    "access-control-allow-origin": "*",
    "access-control-allow-methods": "GET,POST,OPTIONS",
    "access-control-allow-headers": "content-type,authorization",
  });
  res.end(JSON.stringify(payload));
}

function readBody(req, max = 100_000) {
  return new Promise((resolve, reject) => {
    let raw = "";
    req.on("data", (chunk) => {
      raw += chunk;
      if (raw.length > max) reject(new Error("Payload too large"));
    });
    req.on("end", () => {
      try {
        resolve(JSON.parse(raw || "{}"));
      } catch {
        reject(new Error("Invalid JSON"));
      }
    });
    req.on("error", reject);
  });
}

function requireAdmin(req) {
  const auth = req.headers.authorization || "";
  const token = auth.startsWith("Bearer ") ? auth.slice(7) : "";
  if (token !== ADMIN_TOKEN) throw new Error("Unauthorized");
}

ensureAspIdentity();
ensureStellarNetwork();

const server = http.createServer(async (req, res) => {
  if (req.method === "OPTIONS") {
    res.writeHead(204, {
      "access-control-allow-origin": "*",
      "access-control-allow-methods": "GET,POST,OPTIONS",
      "access-control-allow-headers": "content-type,authorization",
      "access-control-max-age": "86400",
    });
    res.end();
    return;
  }

  try {
    if (req.method === "GET" && req.url === "/healthz") {
      let onChainMembers = null;
      let indexedMembers = null;
      if (aspSoroban) {
        try {
          onChainMembers = await aspSoroban.getNextIndex();
        } catch {
          onChainMembers = null;
        }
        try {
          const hint = onChainMembers ?? 0;
          if (hint > 0) {
            indexedMembers = (
              await aspSoroban.buildMembershipChainThrough(hint - 1)
            ).length;
          } else {
            indexedMembers = 0;
          }
        } catch {
          indexedMembers = null;
        }
      }
      return json(res, 200, {
        ok: true,
        network: NETWORK,
        horizonUrl: HORIZON_URL,
        autoScreen: AUTO_SCREEN,
        aspMembership: ASP_MEMBERSHIP,
        aspDeny: ASP_DENY,
        sourceAddress: SOURCE_ADDRESS,
        submitterReady: Boolean(aspSubmitter),
        onChainMemberCount: onChainMembers,
        indexedMemberCount: indexedMembers,
        membershipIndexOk:
          onChainMembers != null &&
          indexedMembers != null &&
          onChainMembers === indexedMembers,
      });
    }

    if (req.method === "POST" && req.url === "/asp/screen") {
      const body = await readBody(req);
      const ownerPk = normalizePk(body.ownerPk);
      const stellarAddress = normalizeStellarAddress(body.stellarAddress);
      const tokenContractId =
        typeof body.tokenContractId === "string" ? body.tokenContractId.trim() : null;
      const db = loadDb();
      const result = await runAspScreen({
        ownerPk,
        stellarAddress,
        tokenContractId,
        db,
        saveDb,
        ...screenDeps(),
      });
      const code = result.status === "approved" ? 200 : result.status === "denied" ? 403 : 200;
      return json(res, code, result);
    }

    if (req.method === "POST" && req.url === "/asp/register") {
      const body = await readBody(req);
      const ownerPk = normalizePk(body.ownerPk);
      const db = loadDb();
      const status = membershipStatus(db, ownerPk);
      if (status === "denied") {
        return json(res, 403, { ok: false, status: "denied", error: "Owner is denied" });
      }
      if (status === "approved") {
        const record = db.approved.find((a) => a.ownerPk === ownerPk);
        return json(res, 200, { ok: true, status: "approved", ...record });
      }

      if (AUTO_SCREEN && body.stellarAddress) {
        const stellarAddress = normalizeStellarAddress(body.stellarAddress);
        const tokenContractId =
          typeof body.tokenContractId === "string" ? body.tokenContractId.trim() : null;
        const result = await runAspScreen({
          ownerPk,
          stellarAddress,
          tokenContractId,
          db: loadDb(),
          saveDb,
          ...screenDeps(),
        });
        const code = result.status === "approved" ? 200 : result.status === "denied" ? 403 : 202;
        return json(res, code, result);
      }

      const membershipBlinding =
        body.membershipBlinding != null
          ? normalizeBlinding(body.membershipBlinding)
          : deriveMembershipBlinding(ownerPk);
      if (status !== "pending") {
        queuePending(db, saveDb, ownerPk, membershipBlinding);
      }
      return json(res, 202, { ok: true, status: "pending", ownerPk });
    }

    if (req.method === "GET" && req.url?.startsWith("/asp/status/")) {
      const ownerPk = normalizePk(decodeURIComponent(req.url.split("/").pop() || ""));
      const db = loadDb();
      const status = membershipStatus(db, ownerPk);
      const record =
        db.approved.find((a) => a.ownerPk === ownerPk) ||
        db.pending.find((p) => p.ownerPk === ownerPk) ||
        db.denied.find((d) => d.ownerPk === ownerPk) ||
        null;
      return json(res, 200, { ok: true, status, record });
    }

    if (req.method === "GET" && req.url?.startsWith("/asp/check/")) {
      const ownerPk = normalizePk(decodeURIComponent(req.url.split("/").pop() || ""));
      const db = loadDb();
      const status = membershipStatus(db, ownerPk);
      const allowed = status === "approved";
      return json(res, allowed ? 200 : 403, { ok: allowed, status, ownerPk });
    }

    if (req.method === "POST" && req.url === "/asp/approve") {
      requireAdmin(req);
      const body = await readBody(req);
      const ownerPk = normalizePk(body.ownerPk);
      const db = loadDb();
      if (db.denied.some((d) => d.ownerPk === ownerPk)) {
        return json(res, 400, { ok: false, error: "Owner is denied" });
      }
      let membershipBlinding =
        body.membershipBlinding != null
          ? normalizeBlinding(body.membershipBlinding)
          : db.pending.find((p) => p.ownerPk === ownerPk)?.membershipBlinding;
      if (!membershipBlinding) membershipBlinding = deriveMembershipBlinding(ownerPk);

      const approved = await approveMember(db, saveDb, ownerPk, membershipBlinding, invokeInsertMember, {
        manual: true,
        contractId: ASP_MEMBERSHIP,
        approvedAt: new Date().toISOString(),
      });
      return json(res, 200, { ok: true, status: "approved", ...approved });
    }

    if (req.method === "POST" && req.url === "/asp/deny") {
      requireAdmin(req);
      const body = await readBody(req);
      const ownerPk = normalizePk(body.ownerPk);
      const db = loadDb();
      const denied = await denyMember(db, saveDb, ownerPk, invokeDenyOnChain, { manual: true });
      return json(res, 200, { ok: true, status: "denied", ownerPk, ...denied });
    }

    if (req.method === "POST" && req.url === "/asp/undeny") {
      requireAdmin(req);
      const body = await readBody(req);
      const ownerPk = normalizePk(body.ownerPk);
      const db = loadDb();
      db.denied = db.denied.filter((d) => d.ownerPk !== ownerPk);
      saveDb(db);
      await invokeDenyOnChain(ownerPk, false);
      return json(res, 200, { ok: true, status: "unknown", ownerPk });
    }

    if (req.method === "GET" && req.url === "/asp/pending") {
      requireAdmin(req);
      const db = loadDb();
      return json(res, 200, { ok: true, pending: db.pending });
    }

    if (req.method === "GET" && req.url?.startsWith("/asp/path/")) {
      const ownerPk = normalizePk(decodeURIComponent(req.url.split("/").pop() || ""));
      const db = loadDb();
      const approved = db.approved.find((a) => a.ownerPk === ownerPk);
      if (!approved) {
        return json(res, 404, { ok: false, error: "Not approved" });
      }
      if (!aspSoroban) {
        return json(res, 503, { ok: false, error: "ASP Soroban reader not configured" });
      }

      const { leafIndex, chain } = await resolveMembershipChain({
        db,
        aspReader: aspSoroban,
        contractId: ASP_MEMBERSHIP,
        ownerPk,
        leafIndexHint: approved.leafIndex ?? 0,
      });

      if (approved.leafIndex !== leafIndex) {
        approved.leafIndex = leafIndex;
        const aspRootNow = await aspSoroban.getLastRoot();
        approved.aspRoot = aspRootNow;
        backfillMembershipsFromChain(db, ASP_MEMBERSHIP, chain, aspRootNow);
        saveDb(db);
      } else {
        backfillMembershipsFromChain(db, ASP_MEMBERSHIP, chain, approved.aspRoot);
        saveDb(db);
      }

      const leafHashes = await Promise.all(
        chain.map((m) => computeAspLeafViaNoir(m.ownerPk, m.membershipBlinding))
      );
      const hasher = createLocalPoseidonHasher();
      const pathInfo = await buildAspMembershipPath(hasher, leafHashes, leafIndex);
      const aspRoot = pathInfo.root;
      const rootValid = await validateAspRoot(aspRoot, approved);
      if (!rootValid) {
        return json(res, 500, {
          ok: false,
          error: "ASP path root mismatch with on-chain tree — re-run compliance scan",
        });
      }
      return json(res, 200, {
        ok: true,
        ownerPk,
        membershipBlinding:
          approved.membershipBlinding ?? deriveMembershipBlinding(ownerPk),
        leafIndex,
        aspRoot,
        siblings: pathInfo.siblings,
        directions: pathInfo.directions,
      });
    }

    return json(res, 404, { error: "Not found" });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const status = message === "Unauthorized" ? 401 : 400;
    return json(res, status, { ok: false, error: message });
  }
});

async function bootstrapMembershipIndex() {
  if (!aspSoroban || !ASP_MEMBERSHIP) return;
  try {
    const next = await aspSoroban.getNextIndex();
    if (next <= 0) return;
    const chain = await aspSoroban.buildMembershipChainThrough(next - 1);
    const db = loadDb();
    const aspRoot = await aspSoroban.getLastRoot();
    backfillMembershipsFromChain(db, ASP_MEMBERSHIP, chain, aspRoot);
    saveDb(db);
    console.log(`ASP membership index: ${chain.length} on-chain inserts backfilled into registry`);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.warn(`ASP membership index backfill skipped: ${message}`);
  }
}

server.listen(port, host, () => {
  console.log(`ASP service listening on http://${host}:${port}`);
  console.log(`Network=${NETWORK} horizon=${HORIZON_URL} autoScreen=${AUTO_SCREEN}`);
  console.log(`Membership=${ASP_MEMBERSHIP ?? "unset"} deny=${ASP_DENY ?? "unset"}`);
  void bootstrapMembershipIndex();
});

server.on("error", (err) => {
  console.error("ASP server error:", err);
  process.exit(1);
});
