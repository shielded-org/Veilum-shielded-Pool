import { existsSync, readFileSync } from "node:fs";
import http from "node:http";
import path from "node:path";
import { loadEnvFile } from "node:process";
import { fileURLToPath } from "node:url";

import { indexPoolEvents } from "./pool-events-index.js";
import { createEventStore } from "./store.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const INDEXER_ROOT = path.resolve(__dirname, "..");
const ENV_PATH = path.join(INDEXER_ROOT, ".env");
if (existsSync(ENV_PATH)) {
  loadEnvFile(ENV_PATH);
}

const port = Number(process.env.PORT || process.env.INDEXER_PORT || 8789);
const host = process.env.INDEXER_HOST || "0.0.0.0";
const DATA_DIR = process.env.INDEXER_DATA_DIR || path.join(INDEXER_ROOT, "data");
const POLL_MS = Number(process.env.INDEXER_POLL_MS || 60_000);

const RPC_URL = process.env.STELLAR_RPC_URL || "https://soroban-testnet.stellar.org:443";
const RPC_FALLBACKS = (process.env.STELLAR_RPC_FALLBACK_URLS || "")
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean);

function loadDeploymentDefaults() {
  const candidates = [
    path.join(INDEXER_ROOT, "../../apps/web/public/deployment.json"),
    path.join(INDEXER_ROOT, "../../scripts/deployment.json"),
  ];
  for (const file of candidates) {
    if (!existsSync(file)) continue;
    try {
      return JSON.parse(readFileSync(file, "utf8"));
    } catch {
      /* try next */
    }
  }
  return {};
}

const deployment = loadDeploymentDefaults();
const POOL_ID = process.env.INDEXER_POOL_ID || deployment.shieldedPool || null;
const DEPLOY_LEDGER = Number(process.env.INDEXER_DEPLOY_LEDGER || deployment.deployLedger || 0) || null;

const store = createEventStore(DATA_DIR);
let indexing = false;
let lastIndexError = null;
let lastIndexAt = null;

async function runIndex() {
  if (!POOL_ID || indexing) return;
  indexing = true;
  try {
    const result = await indexPoolEvents({
      poolId: POOL_ID,
      deployLedger: DEPLOY_LEDGER,
      rpcUrls: [RPC_URL, ...RPC_FALLBACKS],
      store,
    });
    lastIndexError = null;
    lastIndexAt = new Date().toISOString();
    console.log(
      `[indexer] pool=${POOL_ID.slice(0, 8)}… fetched=${result.fetched} total=${result.total} latest=${result.latest}`
    );
  } catch (err) {
    lastIndexError = err instanceof Error ? err.message : String(err);
    console.error("[indexer] error:", lastIndexError);
  } finally {
    indexing = false;
  }
}

function sendJson(res, status, body) {
  const payload = JSON.stringify(body);
  res.writeHead(status, {
    "Content-Type": "application/json",
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
  });
  res.end(payload);
}

function parseUrl(req) {
  return new URL(req.url ?? "/", `http://${req.headers.host ?? "localhost"}`);
}

const server = http.createServer(async (req, res) => {
  if (req.method === "OPTIONS") {
    res.writeHead(204, {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type",
    });
    res.end();
    return;
  }

  if (req.method !== "GET") {
    sendJson(res, 405, { error: "method_not_allowed" });
    return;
  }

  const url = parseUrl(req);

  if (url.pathname === "/health") {
    sendJson(res, 200, {
      ok: true,
      poolId: POOL_ID,
      deployLedger: DEPLOY_LEDGER,
      indexing,
      lastIndexAt,
      lastIndexError,
      status: POOL_ID ? store.getStatus(POOL_ID) : null,
    });
    return;
  }

  const eventsMatch = url.pathname.match(/^\/pool\/([^/]+)\/events$/);
  if (eventsMatch) {
    const poolId = decodeURIComponent(eventsMatch[1]);
    const fromLedger = Number(url.searchParams.get("fromLedger") || 0);
    const toLedger = Number(url.searchParams.get("toLedger") || Number.MAX_SAFE_INTEGER);
    const events = store.queryEvents(poolId, fromLedger, toLedger);
    sendJson(res, 200, {
      poolId,
      fromLedger,
      toLedger,
      count: events.length,
      events,
    });
    return;
  }

  const statusMatch = url.pathname.match(/^\/pool\/([^/]+)\/status$/);
  if (statusMatch) {
    const poolId = decodeURIComponent(statusMatch[1]);
    const status = store.getStatus(poolId);
    if (!status) {
      sendJson(res, 404, { error: "pool_not_indexed" });
      return;
    }
    sendJson(res, 200, status);
    return;
  }

  sendJson(res, 404, { error: "not_found" });
});

server.listen(port, host, () => {
  console.log(`[indexer] listening on http://${host}:${port}`);
  console.log(`[indexer] pool=${POOL_ID ?? "unset"} deployLedger=${DEPLOY_LEDGER ?? "unset"}`);
  if (POOL_ID) {
    void runIndex();
    setInterval(() => void runIndex(), POLL_MS);
  } else {
    console.warn("[indexer] INDEXER_POOL_ID unset — only serving stored data");
  }
});
