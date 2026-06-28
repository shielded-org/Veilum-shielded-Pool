#!/usr/bin/env node
/**
 * End-to-end wallet refresh test (indexer channel path + decrypt + RPC tail).
 * Usage:
 *   node scripts/test-wallet-sync.mjs
 */
import { readFileSync } from "node:fs";
import { scValToNative, xdr, rpc } from "@stellar/stellar-sdk";
import { keccak_256 } from "@noble/hashes/sha3";
import { getSharedSecret } from "@noble/secp256k1";

const { Server: SorobanRpc } = rpc;

const deployment = JSON.parse(
  readFileSync(new URL("./deployment.json", import.meta.url), "utf8")
);

const VIEWING_PRIV = BigInt(
  process.env.VIEWING_PRIV?.replace(/n$/, "") ??
    "0x2797f2bab25f90ec793bd58071d0fbe64fef11273b8e6bd66e2ca1055c34ea3b"
);
const VIEWING_PUB =
  process.env.VIEWING_PUB ??
  "0x03cf76d1ebd448fdc5c2cc1bdd62a274d229022c0bfcebc7b679e65d46faa10a54";

const POOL_ID = deployment.shieldedPool;
const DEPLOY_LEDGER = deployment.deployLedger;
const INDEXER_URL = process.env.INDEXER_URL || "https://veilum-shielded-indexer.fly.dev";
const RPC_URL = process.env.STELLAR_RPC_URL || "https://soroban-testnet.stellar.org:443";

function hexToBytes(hex) {
  const clean = hex.replace(/^0x/, "");
  return Uint8Array.from({ length: clean.length / 2 }, (_, i) =>
    parseInt(clean.slice(i * 2, i * 2 + 2), 16)
  );
}

const BN254_MOD = 21888242871839275222246405745257275088548364400416034343698204186575808495617n;
function toHex32(value) {
  const mod = ((value % BN254_MOD) + BN254_MOD) % BN254_MOD;
  return `0x${mod.toString(16).padStart(64, "0")}`;
}

function bytes32Arg(hex) {
  return hex.replace(/^0x/, "").padStart(64, "0").slice(-64);
}

function routeChannel(viewingPubHex) {
  return bytes32Arg(`0x${Buffer.from(keccak_256(hexToBytes(viewingPubHex))).toString("hex")}`).toLowerCase();
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

function pickRefreshMode(priorCache, opts) {
  if (opts?.forceFull) return "full";
  if (opts?.deployLedger && priorCache?.deployLedger && priorCache.deployLedger !== opts.deployLedger) {
    return "full";
  }
  if (!priorCache?.lastScannedLedger) return "full";
  const hasCachedNotes =
    priorCache.notesChainVerified === true &&
    ((opts?.hasNotes ?? false) || (priorCache.notes?.length ?? 0) > 0);
  if (!hasCachedNotes) return "full";
  return "incremental";
}

async function fetchIndexerChannel(fromLedger, toLedger, channelHex) {
  const url = new URL(`${INDEXER_URL}/pool/${encodeURIComponent(POOL_ID)}/events`);
  url.searchParams.set("fromLedger", String(fromLedger));
  url.searchParams.set("toLedger", String(toLedger));
  url.searchParams.set("channel", channelHex);
  const t0 = Date.now();
  const res = await fetch(url.toString());
  const body = await res.json();
  return { ms: Date.now() - t0, events: body.events ?? [], channel: body.channel };
}

async function fetchRpcTail(fromLedger, toLedger) {
  const rpc = new SorobanRpc(RPC_URL);
  const t0 = Date.now();
  const page = await rpc.getEvents({
    startLedger: fromLedger,
    endLedger: toLedger,
    filters: [{ type: "contract", contractIds: [POOL_ID] }],
    limit: 200,
  });
  return { ms: Date.now() - t0, events: page.events ?? [] };
}

function bytes32FromTopic(topic) {
  try {
    const native = scValToNative(topic);
    if (native instanceof Uint8Array) {
      return Buffer.from(native).toString("hex").padStart(64, "0").slice(-64);
    }
    return null;
  } catch {
    return null;
  }
}

function routeEventsForChannel(events, channelHex) {
  const want = channelHex.replace(/^0x/i, "").toLowerCase();
  return events.filter((ev) => {
    const topics = ev.topic ?? [];
    if (topics.length < 2) return false;
    try {
      const name = scValToNative(topics[0]);
      if (name !== "route") return false;
      const ch = bytes32FromTopic(topics[1]);
      return ch != null && ch.toLowerCase() === want;
    } catch {
      return false;
    }
  });
}

async function main() {
  const channelHex = routeChannel(VIEWING_PUB);
  console.log("=== Wallet sync simulation ===");
  console.log("Viewing pub:", VIEWING_PUB.slice(0, 14) + "…");
  console.log("Channel:", channelHex);

  const statusRes = await fetch(`${INDEXER_URL}/pool/${POOL_ID}/status`);
  const status = await statusRes.json();
  const lastIndexed = status.lastIndexedLedger ?? status.lastIndexed;
  console.log("Indexer lastIndexed:", lastIndexed);

  // Broken state: cursor but no notes (v3 migration bug)
  const brokenCache = { lastScannedLedger: lastIndexed - 100, notes: [], deployLedger: DEPLOY_LEDGER };
  const brokenMode = pickRefreshMode(brokenCache, { deployLedger: DEPLOY_LEDGER, hasNotes: false });
  console.log("\nBroken cache (cursor, no notes) → mode:", brokenMode, brokenMode === "full" ? "✓" : "✗ FAIL");

  const unverifiedCache = {
    lastScannedLedger: lastIndexed - 5,
    notes: [{ id: "x" }],
    deployLedger: DEPLOY_LEDGER,
  };
  const unverifiedMode = pickRefreshMode(unverifiedCache, { deployLedger: DEPLOY_LEDGER, hasNotes: true });
  console.log("Unverified cache (cursor + notes, no flag) → mode:", unverifiedMode, unverifiedMode === "full" ? "✓" : "✗ FAIL");

  const goodCache = {
    lastScannedLedger: lastIndexed - 5,
    notes: [{ id: "x" }],
    notesChainVerified: true,
    deployLedger: DEPLOY_LEDGER,
  };
  const goodMode = pickRefreshMode(goodCache, { deployLedger: DEPLOY_LEDGER, hasNotes: true });
  console.log("Warm cache (cursor + notes) → mode:", goodMode, goodMode === "incremental" ? "✓" : "✗ FAIL");

  const t0 = Date.now();
  const { ms, events, channel } = await fetchIndexerChannel(DEPLOY_LEDGER, lastIndexed, channelHex);
  console.log(`\nIndexer channel fetch: ${events.length} events in ${ms}ms (filtered: ${Boolean(channel)})`);

  const notes = [];
  for (const row of events) {
    const value = row.value ? scValToNative(xdr.ScVal.fromXDR(row.value, "base64")) : null;
    const hex = Buffer.from(value).toString("hex");
    const plain = await decryptNoteECDH(hex, VIEWING_PRIV);
    if (plain) notes.push({ ledger: row.ledger, amount: plain.amount, commitment: plain.commitment?.slice(0, 14) });
  }

  console.log("Decrypted notes:", notes.length);
  for (const n of notes) {
    console.log(`  ledger ${n.ledger}  amount ${n.amount}  ${n.commitment}…`);
  }

  const totalMs = Date.now() - t0;
  console.log(`\nTotal discovery+decrypt: ${totalMs}ms`);

  // Simulate recipient incremental sync when indexer lags chain head (private transfer tail).
  const rpc = new SorobanRpc(RPC_URL);
  const latestSeq = (await rpc.getLatestLedger()).sequence;
  const simulatedIndexerLag = Math.min(8, Math.max(1, latestSeq - lastIndexed));
  const staleIndexed = latestSeq - simulatedIndexerLag;
  const priorCursor = Math.max(staleIndexed - 3, DEPLOY_LEDGER);
  const incrementalFrom = priorCursor + 1;
  console.log("\n--- Stale indexer + RPC tail (recipient path) ---");
  console.log("Chain head:", latestSeq, "| simulated indexer:", staleIndexed, "| scan from:", incrementalFrom);

  const tailT0 = Date.now();
  const staleIndexer = await fetchIndexerChannel(incrementalFrom, staleIndexed, channelHex);
  const tailFrom = Math.max(incrementalFrom, staleIndexed + 1);
  const rpcTail = tailFrom <= latestSeq ? await fetchRpcTail(tailFrom, latestSeq) : { ms: 0, events: [] };
  const mergedRoute = routeEventsForChannel(
    [...staleIndexer.events, ...rpcTail.events],
    channelHex
  );
  const tailMs = Date.now() - tailT0;
  const indexerAtHead = staleIndexed >= latestSeq - 1;
  const wouldSkipScan =
    staleIndexer.events.length === 0 && mergedRoute.length === 0 && indexerAtHead;
  console.log(
    `Indexer slice: ${staleIndexer.events.length} events (${staleIndexer.ms}ms) | RPC tail ${tailFrom}→${latestSeq}: ${rpcTail.events.length} pool events (${rpcTail.ms}ms)`
  );
  console.log(`Channel route events after merge: ${mergedRoute.length} in ${tailMs}ms`);
  console.log(
    "Incremental no-op fast path:",
    wouldSkipScan ? "would skip (indexer at head)" : "would scan — OK",
    wouldSkipScan && mergedRoute.length === 0 ? "✓" : wouldSkipScan ? "✗ FAIL" : "✓"
  );

  const speedOk = totalMs < 3000 && tailMs < 2500;
  const pass =
    notes.length >= 3 &&
    brokenMode === "full" &&
    goodMode === "incremental" &&
    unverifiedMode === "full" &&
    speedOk;
  console.log(`\n=== RESULT: ${pass ? "PASS" : "FAIL"} ===`);
  if (!pass) process.exit(1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
