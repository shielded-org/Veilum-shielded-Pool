#!/usr/bin/env node
/**
 * Debug merkle leaf rebuild vs on-chain root (testnet).
 * Usage: node scripts/debug-merkle.mjs
 */
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { Address, Contract, rpc, xdr } from "@stellar/stellar-sdk";

const { Api, Server: SorobanRpc } = rpc;
const __dirname = dirname(fileURLToPath(import.meta.url));
const deployment = JSON.parse(readFileSync(join(__dirname, "../apps/web/public/deployment.json"), "utf8"));
const networks = JSON.parse(readFileSync(join(__dirname, "../apps/web/public/config/networks.json"), "utf8"));

const poolId = deployment.shieldedPool;
const merkleId = deployment.merkleTree;
const aspGateId = deployment.aspGate;
const rpcUrl = networks.testnet.rpcUrl;
const eventsRpcUrl = networks.testnet.eventsRpcUrls?.[0] ?? rpcUrl;
const txRpcUrls = [rpcUrl, ...(networks.testnet.eventsRpcUrls ?? [])].filter(
  (u, i, a) => a.indexOf(u) === i
);
const deployLedger = deployment.deployLedger ?? 1;
const scanFrom = Math.max(deployLedger - 50, 1);

// --- copy extract logic from merkle-sync.ts ---
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

function extractCommitmentsFromTx(tx, poolId, aspGateId) {
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
    const fn = invokeContract.functionName().toString();
    const args = invokeContract.args();
    if (contract === poolId) {
      if (fn === "shield_routed" && args.length >= 4) {
        const c = scValBytesToHex32(args[3]);
        if (c) out.push({ fn, c });
      } else if (fn === "shielded_transfer_routed" && args.length >= 2) {
        const meta = scValBytesToHex(args[1]);
        if (meta.length >= 256) {
          out.push({ fn, c: `0x${meta.slice(128, 192)}` });
          out.push({ fn, c: `0x${meta.slice(192, 256)}` });
        }
      } else if (
        (fn === "unshield" || fn === "unshield_with_asp" || fn === "fulfill_unshield") &&
        args.length >= 7
      ) {
        const c = scValBytesToHex32(args[6]);
        if (c && c !== `0x${"00".repeat(32)}`) out.push({ fn, c });
      }
    } else if (aspGateId && contract === aspGateId && fn === "unshield_asp" && args.length >= 2) {
      const meta = scValBytesToHex(args[1]);
      if (meta.length >= 192) {
        const c = `0x${meta.slice(128, 192)}`;
        if (c !== `0x${"00".repeat(32)}`) out.push({ fn, c });
      }
    }
  }
  return out;
}

async function getTxWithFallback(txHash) {
  for (const url of txRpcUrls) {
    const rpc = new SorobanRpc(url);
    const tx = await rpc.getTransaction(txHash);
    if (tx.status !== Api.GetTransactionStatus.NOT_FOUND && tx.envelopeXdr) return tx;
  }
  return null;
}

async function syncLeaves(eventsRpc, poolId, startLedger) {
  const latest = await eventsRpc.getLatestLedger();
  const endLedger = latest.sequence;
  const eventRefs = [];
  let cursor;
  for (let pages = 0; pages < 64; pages++) {
    const page = cursor
      ? await eventsRpc.getEvents({ cursor, filters: [{ type: "contract", contractIds: [poolId] }], limit: 200 })
      : await eventsRpc.getEvents({
          startLedger: startLedger,
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
        topics: ev.topic?.map((t) => {
          try {
            const n = xdr.ScVal.fromXDR(t, "base64");
            if (n.switch() === xdr.ScValType.scvSymbol()) return n.sym().toString();
          } catch {}
          return "?";
        }),
      });
    }
    if (!page.cursor || page.events.length === 0) break;
    cursor = page.cursor;
  }
  eventRefs.sort(
    (a, b) =>
      a.ledger - b.ledger || a.transactionIndex - b.transactionIndex || a.operationIndex - b.operationIndex
  );
  const seenTx = new Set();
  const uniqueRefs = [];
  for (const ref of eventRefs) {
    if (seenTx.has(ref.txHash)) continue;
    seenTx.add(ref.txHash);
    uniqueRefs.push(ref);
  }
  const leaves = [];
  for (const ref of uniqueRefs) {
    const tx = await getTxWithFallback(ref.txHash);
    if (!tx || tx.status !== Api.GetTransactionStatus.SUCCESS) continue;
    const extracted = extractCommitmentsFromTx(tx, poolId, aspGateId);
    for (const e of extracted) {
      leaves.push({ ...e, txHash: ref.txHash.slice(0, 12), ledger: ref.ledger });
    }
  }
  return { leaves, eventCount: eventRefs.length, txCount: uniqueRefs.length };
}

async function readMerkleState(merkleId) {
  const { execFileSync } = await import("node:child_process");
  const src = "GAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAWHF";
  const rootRaw = execFileSync(
    "stellar",
    ["contract", "invoke", "--id", merkleId, "--source-account", src, "--network", "testnet", "--", "get_last_root"],
    { encoding: "utf8" }
  ).trim();
  const nextRaw = execFileSync(
    "stellar",
    ["contract", "invoke", "--id", merkleId, "--source-account", src, "--network", "testnet", "--", "get_next_index"],
    { encoding: "utf8" }
  ).trim();
  return {
    root: `0x${rootRaw.replace(/"/g, "").replace(/^0x/, "").padStart(64, "0").slice(-64)}`,
    nextIndex: Number(nextRaw.replace(/"/g, "")),
  };
}

const eventsRpc = new SorobanRpc(eventsRpcUrl);
console.log("pool", poolId);
console.log("merkle", merkleId);
console.log("scanFrom", scanFrom, "eventsRpc", eventsRpcUrl);

const state = await readMerkleState(merkleId);
console.log("on-chain", state);

const { leaves, eventCount, txCount } = await syncLeaves(eventsRpc, poolId, scanFrom);
console.log("events", eventCount, "unique txs", txCount, "leaves", leaves.length);
leaves.forEach((l, i) => console.log(`  [${i}] ${l.fn} ledger=${l.ledger} ${l.c} tx=${l.txHash}`));

if (leaves.length !== state.nextIndex) {
  console.log("COUNT MISMATCH");
}

// Compute merkle root via SDK (same as web app)
const { createLocalPoseidonHasher, buildLevelMaps, extractPath } = await import(
  "../packages/sdk/dist/hash.js"
);
const hasher = createLocalPoseidonHasher();
const leafHexes = leaves.map((l) => l.c);
const { levels, zeroes } = await buildLevelMaps(hasher, leafHexes, 20);
const path = extractPath(levels, zeroes, 0, 20);
console.log("computed root (batch):", path.root);
console.log("on-chain root:       ", state.root);
console.log("match:", path.root.toLowerCase() === state.root.toLowerCase());
