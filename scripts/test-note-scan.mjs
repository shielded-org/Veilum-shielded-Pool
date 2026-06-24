#!/usr/bin/env node
/**
 * Mirrors apps/web note scan (scanRouteEvents + merge) for debugging.
 * Usage:
 *   VIEWING_PRIV=0x...n VIEWING_PUB=0x... node scripts/test-note-scan.mjs
 */
import { readFileSync } from "node:fs";
import { scValToNative, xdr, rpc } from "@stellar/stellar-sdk";
import { keccak_256 } from "@noble/hashes/sha3";
import { getSharedSecret } from "@noble/secp256k1";

const { Server: SorobanRpc } = rpc;

const deployment = JSON.parse(
  readFileSync(new URL("./deployment.json", import.meta.url), "utf8")
);
const POOL_ID = deployment.shieldedPool;
const DEPLOY_LEDGER = deployment.deployLedger;
const RPC_URL = process.env.STELLAR_RPC_URL || "https://soroban-testnet.stellar.org:443";
const INDEXER_URL = process.env.INDEXER_URL || "https://veilum-shielded-indexer.fly.dev";

const VIEWING_PRIV = process.env.VIEWING_PRIV
  ? BigInt(process.env.VIEWING_PRIV.replace(/n$/, ""))
  : null;
const VIEWING_PUB =
  process.env.VIEWING_PUB ||
  "0x0248d289f7e217b906d8abbc87de23ea418aaba38fa850ce631a21c3a320d97e21";

const PAGE_LIMIT = 200;
const MAX_PAGES = 128;
const MAX_EMPTY = 16;

function hexToBytes(hex) {
  const clean = hex.replace(/^0x/, "");
  const out = new Uint8Array(clean.length / 2);
  for (let i = 0; i < out.length; i++) out[i] = parseInt(clean.slice(i * 2, i * 2 + 2), 16);
  return out;
}

const BN254_MOD = 21888242871839275222246405745257275088548364400416034343698204186575808495617n;
function toHex32(value) {
  const mod = ((value % BN254_MOD) + BN254_MOD) % BN254_MOD;
  return `0x${mod.toString(16).padStart(64, "0")}`;
}

function bytes32Arg(hex) {
  return hex.replace(/^0x/, "").padStart(64, "0").slice(-64);
}

function routeForRecipient(viewingPubHex, subchannelId) {
  const channel = `0x${Buffer.from(keccak_256(hexToBytes(viewingPubHex))).toString("hex")}`;
  const idBuf = new Uint8Array(8);
  new DataView(idBuf.buffer).setBigUint64(0, BigInt(subchannelId), false);
  const subchannel = `0x${Buffer.from(
    keccak_256(new Uint8Array([...hexToBytes(channel), ...idBuf]))
  ).toString("hex")}`;
  return { channel, subchannel };
}

async function hkdfSha256(ikm, salt, info, len = 32) {
  const key = await crypto.subtle.importKey("raw", ikm, "HKDF", false, ["deriveBits"]);
  const bits = await crypto.subtle.deriveBits({ name: "HKDF", hash: "SHA-256", salt, info }, key, len * 8);
  return new Uint8Array(bits);
}

async function decryptNoteECDH(encryptedNoteHex, viewingPriv) {
  try {
    const envelopeRaw = new TextDecoder().decode(hexToBytes(encryptedNoteHex.replace(/^0x/, "")));
    const envelope = JSON.parse(envelopeRaw);
    if (envelope.v !== 1) return null;
    const privBytes = hexToBytes(toHex32(viewingPriv));
    const shared = getSharedSecret(privBytes, hexToBytes(envelope.eph), true);
    const key = await hkdfSha256(shared, hexToBytes(envelope.salt), new TextEncoder().encode("zkproject-note-v1"));
    const cryptoKey = await crypto.subtle.importKey("raw", key, "AES-GCM", false, ["decrypt"]);
    const combined = new Uint8Array([...hexToBytes(envelope.ct), ...hexToBytes(envelope.tag)]);
    const plain = await crypto.subtle.decrypt({ name: "AES-GCM", iv: hexToBytes(envelope.iv) }, cryptoKey, combined);
    return JSON.parse(new TextDecoder().decode(plain));
  } catch {
    return null;
  }
}

async function tokenFieldFromContractId(contractId) {
  const enc = new TextEncoder().encode(contractId);
  const buf = await crypto.subtle.digest("SHA-256", enc);
  const arr = new Uint8Array(buf);
  arr[0] = 0;
  return `0x${Array.from(arr)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("")}`;
}

function eventTopicName(topic) {
  try {
    const native = scValToNative(topic);
    return typeof native === "string" ? native : null;
  } catch {
    return null;
  }
}

function bytes32FromUnknown(v) {
  if (v instanceof Uint8Array) return `0x${Buffer.from(v).toString("hex").padStart(64, "0").slice(-64)}`;
  if (typeof v === "string") {
    const clean = v.replace(/^0x/, "");
    if (clean.length >= 64) return `0x${clean.slice(-64)}`;
  }
  return null;
}

function encryptedNoteFromValue(value) {
  const native = scValToNative(value);
  if (native instanceof Uint8Array) return Buffer.from(native).toString("hex");
  if (Buffer.isBuffer(native)) return native.toString("hex");
  if (typeof native === "string") return native.replace(/^0x/, "");
  return null;
}

/** Same logic as apps/web/src/lib/scan.ts mergeContractEvents */
function contractEventKey(ev) {
  if (ev.id) return ev.id;
  return `${ev.txHash}:${ev.ledger}:${ev.transactionIndex}:${ev.operationIndex}`;
}

function mergeContractEvents(archived, rpcEvents) {
  const seen = new Set();
  const out = [];
  for (const ev of archived) {
    const key = contractEventKey(ev);
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(ev);
  }
  for (const ev of rpcEvents) {
    const key = contractEventKey(ev);
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(ev);
  }
  out.sort(
    (a, b) =>
      a.ledger - b.ledger ||
      a.transactionIndex - b.transactionIndex ||
      a.operationIndex - b.operationIndex
  );
  return { merged: out };
}

async function fetchAllContractEvents(rpcClient, poolId, scanFrom, endLedger) {
  const events = [];
  let cursor;
  let pages = 0;
  let emptyStreak = 0;
  const filter = { type: "contract", contractIds: [poolId] };
  while (pages < MAX_PAGES) {
    const page = cursor
      ? await rpcClient.getEvents({ cursor, filters: [filter], limit: PAGE_LIMIT })
      : await rpcClient.getEvents({
          startLedger: scanFrom,
          endLedger,
          filters: [filter],
          limit: PAGE_LIMIT,
        });
    pages++;
    if (page.events.length > 0) {
      emptyStreak = 0;
      events.push(...page.events);
    } else emptyStreak++;
    if (!page.cursor || emptyStreak >= MAX_EMPTY) break;
    cursor = page.cursor;
  }
  return { events, pages };
}

async function fetchIndexerGap(fromLedger, toLedger) {
  const url = `${INDEXER_URL}/pool/${encodeURIComponent(POOL_ID)}/events?fromLedger=${fromLedger}&toLedger=${toLedger}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`indexer ${res.status}`);
  const body = await res.json();
  return body.events ?? [];
}

function hydrateIndexerEvent(row) {
  return {
    id: row.id,
    ledger: row.ledger,
    txHash: row.txHash,
    transactionIndex: row.transactionIndex,
    operationIndex: row.operationIndex,
    topic: (row.topic ?? []).map((t) => xdr.ScVal.fromXDR(t, "base64")),
    value: row.value ? xdr.ScVal.fromXDR(row.value, "base64") : xdr.ScVal.scvVoid(),
  };
}

async function scanNotes(events, viewingPriv, channelHex) {
  const matched = [];
  let decryptFails = 0;
  for (const ev of events) {
    const topics = ev.topic ?? [];
    if (topics.length < 3 || eventTopicName(topics[0]) !== "route") continue;
    const evChannel = bytes32FromUnknown(scValToNative(topics[1]));
    if (!evChannel || bytes32Arg(evChannel).toLowerCase() !== channelHex) continue;
    const encrypted = encryptedNoteFromValue(ev.value);
    if (!encrypted) continue;
    if (!viewingPriv) {
      matched.push({ ledger: ev.ledger, txHash: ev.txHash, plain: null });
      continue;
    }
    const plain = await decryptNoteECDH(encrypted, viewingPriv);
    if (!plain) {
      decryptFails++;
      continue;
    }
    matched.push({ ledger: ev.ledger, txHash: ev.txHash, plain });
  }
  return { matched, decryptFails };
}

async function main() {
  const rpcClient = new SorobanRpc(RPC_URL);
  const latest = await rpcClient.getLatestLedger();
  const probe = await rpcClient.getEvents({
    startLedger: Math.max(latest.sequence - 100, 1),
    filters: [{ type: "contract", contractIds: [POOL_ID] }],
    limit: 1,
  });
  const rpcOldest = probe.oldestLedger ?? latest.sequence;
  const rpcLatest = probe.latestLedger ?? latest.sequence;
  const scanFrom = Math.max(DEPLOY_LEDGER - 50, rpcOldest);

  console.log("=== Note scan test (mirrors apps/web) ===");
  console.log("Pool:", POOL_ID);
  console.log("Deploy:", DEPLOY_LEDGER, "| RPC window:", rpcOldest, "→", rpcLatest);
  console.log("scanFrom:", scanFrom);

  const channelHex = bytes32Arg(routeForRecipient(VIEWING_PUB, 0).channel).toLowerCase();
  const eurcField = (await tokenFieldFromContractId(deployment.tokens.EURC)).toLowerCase();

  // 1) RPC only
  const rpcOnly = await fetchAllContractEvents(rpcClient, POOL_ID, scanFrom, rpcLatest);
  const rpcNotes = await scanNotes(rpcOnly.events, VIEWING_PRIV, channelHex);
  console.log("\n--- RPC only ---");
  console.log("pages:", rpcOnly.pages, "pool events:", rpcOnly.events.length);
  console.log("channel route events:", rpcNotes.matched.length, "decrypt fails:", rpcNotes.decryptFails);

  // 2) With indexer gap (app path)
  let archived = [];
  if (DEPLOY_LEDGER < rpcOldest) {
    const gapTo = rpcOldest - 1;
    const raw = await fetchIndexerGap(DEPLOY_LEDGER, gapTo);
    archived = raw.map(hydrateIndexerEvent);
    console.log("\n--- Indexer gap ---");
    console.log("requested:", DEPLOY_LEDGER, "→", gapTo, "| returned:", archived.length);
    if (archived.length) {
      console.log(
        "ledger range:",
        Math.min(...archived.map((e) => e.ledger)),
        "→",
        Math.max(...archived.map((e) => e.ledger))
      );
    }
  }

  const { merged } = mergeContractEvents(archived, rpcOnly.events);
  const mergedNotes = await scanNotes(merged, VIEWING_PRIV, channelHex);
  console.log("\n--- RPC + indexer merge (app path) ---");
  console.log("merged pool events:", merged.length);
  console.log("channel route events:", mergedNotes.matched.length, "decrypt fails:", mergedNotes.decryptFails);

  // 3) EURC breakdown
  if (VIEWING_PRIV) {
    for (const label of ["RPC only", "Merged"]) {
      const list = label === "RPC only" ? rpcNotes.matched : mergedNotes.matched;
      const eurc = list.filter((m) => m.plain?.token?.toLowerCase() === eurcField);
      console.log(`\n--- EURC notes (${label}) ---`);
      let total = 0n;
      for (const n of eurc.sort((a, b) => a.ledger - b.ledger)) {
        const amt = BigInt(n.plain.amount);
        total += amt;
        console.log(`  ledger ${n.ledger}  ${(Number(amt) / 1e7).toFixed(2)} EURC`);
      }
      console.log(`  total: ${(Number(total) / 1e7).toFixed(2)} EURC (${eurc.length} notes)`);
    }
  } else {
    console.log("\n(Set VIEWING_PRIV to decrypt notes)");
  }

  const ok = mergedNotes.matched.length === rpcNotes.matched.length;
  console.log("\n=== RESULT:", ok ? "PASS — merge matches RPC" : "FAIL — merge drops events ===");
  if (!ok) process.exit(1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
