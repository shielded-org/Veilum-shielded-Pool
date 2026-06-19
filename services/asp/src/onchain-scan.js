import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { Horizon, StrKey } from "@stellar/stellar-sdk";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const DEFAULT_SCAN_LIMIT = Number(process.env.ASP_SCAN_LIMIT || 80);
const DEFAULT_HOP_DEPTH = Number(process.env.ASP_SCAN_HOP_DEPTH || 1);

function normalizeAddress(addr) {
  if (!addr || typeof addr !== "string") return null;
  const trimmed = addr.trim();
  if (!trimmed.startsWith("G") && !trimmed.startsWith("C")) return null;
  try {
    if (trimmed.startsWith("G")) {
      StrKey.decodeEd25519PublicKey(trimmed);
    } else {
      StrKey.decodeContract(trimmed);
    }
    return trimmed;
  } catch {
    return null;
  }
}

function loadBadAccounts(dataDir) {
  const fromEnv = (process.env.ASP_BAD_ACCOUNTS || "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  const filePath = path.join(dataDir, "bad-stellar-accounts.json");
  let fromFile = [];
  if (existsSync(filePath)) {
    try {
      const parsed = JSON.parse(readFileSync(filePath, "utf8"));
      if (Array.isArray(parsed)) fromFile = parsed;
      else if (Array.isArray(parsed.accounts)) fromFile = parsed.accounts;
    } catch {
      /* ignore malformed */
    }
  }
  return new Set(
    [...fromEnv, ...fromFile].map((a) => normalizeAddress(a)).filter(Boolean)
  );
}

function assetMatchesToken(asset, tokenContractId) {
  if (!tokenContractId) return true;
  if (!asset) return false;
  if (asset === "native") return false;
  if (typeof asset === "string") return asset.includes(tokenContractId);
  if (asset.issuer === tokenContractId) return true;
  if (asset.contract_id === tokenContractId) return true;
  if (asset.contract === tokenContractId) return true;
  return false;
}

async function collectInboundSources(server, accountId, tokenContractId, scanLimit) {
  const sources = new Map();

  function addSource(address, reason, txHash) {
    const normalized = normalizeAddress(address);
    if (!normalized || normalized === accountId) return;
    const existing = sources.get(normalized);
    if (existing) {
      existing.hits += 1;
      return;
    }
    sources.set(normalized, { address: normalized, reason, txHash, hits: 1 });
  }

  const payments = await server
    .payments()
    .forAccount(accountId)
    .order("desc")
    .limit(scanLimit)
    .call();

  for (const record of payments.records) {
    if (record.type === "payment" && record.to === accountId && record.from) {
      if (assetMatchesToken(record.asset, tokenContractId)) {
        addSource(record.from, "inbound_payment", record.transaction_hash);
      }
    }
    if (record.type === "create_account" && record.account === accountId && record.funder) {
      addSource(record.funder, "create_account_funder", record.transaction_hash);
    }
    if (record.type === "account_merge" && record.into === accountId && record.account) {
      addSource(record.account, "account_merge_source", record.transaction_hash);
    }
  }

  const operations = await server
    .operations()
    .forAccount(accountId)
    .order("desc")
    .limit(scanLimit)
    .call();

  for (const op of operations.records) {
    if (!op.transaction_successful) continue;
    if (op.type === "payment" && op.to === accountId && op.from) {
      if (assetMatchesToken(op.asset, tokenContractId)) {
        addSource(op.from, "operation_payment", op.transaction_hash);
      }
    }
    if (op.type === "create_account" && op.account === accountId && op.funder) {
      addSource(op.funder, "operation_create_account", op.transaction_hash);
    }
    if (op.type === "invoke_host_function" && op.source_account) {
      addSource(op.source_account, "contract_invoke_initiator", op.transaction_hash);
    }
  }

  const effects = await server
    .effects()
    .forAccount(accountId)
    .order("desc")
    .limit(scanLimit)
    .call();

  for (const effect of effects.records) {
    if (effect.type === "account_credited" && effect.account === accountId) {
      if (assetMatchesToken(effect.asset, tokenContractId) && effect.source_account) {
        addSource(effect.source_account, "account_credited", effect.transaction_hash);
      }
    }
  }

  return [...sources.values()];
}

async function scanHop(server, accountId, badSet, hopDepth, scanLimit, visited) {
  if (hopDepth <= 0 || visited.has(accountId)) return [];
  visited.add(accountId);

  const flagged = [];
  if (badSet.has(accountId)) {
    flagged.push({ address: accountId, reason: "account_on_denylist", hop: 0 });
  }

  const inbound = await collectInboundSources(server, accountId, null, scanLimit);
  for (const src of inbound) {
    if (badSet.has(src.address)) {
      flagged.push({
        address: src.address,
        reason: `bad_source:${src.reason}`,
        hop: 1,
        txHash: src.txHash,
      });
    }
    if (hopDepth > 1) {
      const nested = await scanHop(server, src.address, badSet, hopDepth - 1, Math.max(20, scanLimit / 2), visited);
      for (const n of nested) {
        flagged.push({ ...n, hop: n.hop + 1 });
      }
    }
  }
  return flagged;
}

/**
 * Full on-chain fund-source scan for a Stellar account about to shield.
 * @returns {Promise<{ clean: boolean, reasons: string[], inboundSources: object[], scannedAt: string }>}
 */
export async function scanFundSources({
  horizonUrl,
  accountId,
  tokenContractId = null,
  dataDir,
  scanLimit = DEFAULT_SCAN_LIMIT,
  hopDepth = DEFAULT_HOP_DEPTH,
}) {
  const stellarAddress = normalizeAddress(accountId);
  if (!stellarAddress) {
    return {
      clean: false,
      reasons: ["invalid_stellar_address"],
      inboundSources: [],
      scannedAt: new Date().toISOString(),
    };
  }

  const badSet = loadBadAccounts(dataDir);
  const server = new Horizon.Server(horizonUrl);

  try {
    await server.loadAccount(stellarAddress);
  } catch (err) {
    const notFound = err?.response?.status === 404;
    if (notFound) {
      return {
        clean: true,
        reasons: [],
        inboundSources: [],
        scannedAt: new Date().toISOString(),
        note: "account_not_found_on_horizon_treated_as_clean",
      };
    }
    throw err;
  }

  const inboundSources = await collectInboundSources(
    server,
    stellarAddress,
    tokenContractId,
    scanLimit
  );

  const reasons = [];
  if (badSet.has(stellarAddress)) {
    reasons.push(`depositor_on_denylist:${stellarAddress}`);
  }

  for (const src of inboundSources) {
    if (badSet.has(src.address)) {
      reasons.push(`inbound_from_denylist:${src.address} (${src.reason})`);
    }
  }

  if (hopDepth > 1) {
    const visited = new Set([stellarAddress]);
    for (const src of inboundSources) {
      const nested = await scanHop(
        server,
        src.address,
        badSet,
        hopDepth - 1,
        Math.max(20, Math.floor(scanLimit / 2)),
        visited
      );
      for (const n of nested) {
        reasons.push(`hop${n.hop}_denylist:${n.address} (${n.reason})`);
      }
    }
  }

  const uniqueReasons = [...new Set(reasons)];
  return {
    clean: uniqueReasons.length === 0,
    reasons: uniqueReasons,
    inboundSources,
    inboundCount: inboundSources.length,
    hopDepth,
    scanLimit,
    tokenContractId,
    stellarAddress,
    scannedAt: new Date().toISOString(),
  };
}
