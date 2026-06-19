#!/usr/bin/env node
/** Compare merkle leaf rebuild across RPCs; find what produces a given root. */
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { Address, rpc, xdr } from "@stellar/stellar-sdk";
import { createLocalPoseidonHasher, buildLevelMaps, extractPath, computeIncrementalMerkleRoot } from "../packages/sdk/dist/hash.js";

const { Api, Server } = rpc;
const __dirname = dirname(fileURLToPath(import.meta.url));
const deployment = JSON.parse(readFileSync(join(__dirname, "../apps/web/public/deployment.json"), "utf8"));
const networks = JSON.parse(readFileSync(join(__dirname, "../apps/web/public/config/networks.json"), "utf8"));

const poolId = deployment.shieldedPool;
const merkleId = deployment.merkleTree;
const scanFrom = deployment.deployLedger - 50;
const TARGET_WRONG = "0x193d45e000a4af6c9b5648ec4b47b48eb0b87d01aefaf4b77f1bbb85b264413e".toLowerCase();
const TARGET_OK = "0x00412e33af8925496517e6f75f72595258611beae9ac36d505ee875318995d7d".toLowerCase();

const RPCS = [
  networks.testnet.rpcUrl,
  ...(networks.testnet.eventsRpcUrls ?? []),
];

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
  return `0x${Buffer.from(val.bytes()).toString("hex").padStart(64, "0").slice(-64)}`;
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
    } else if ((fn === "unshield" || fn === "unshield_with_asp" || fn === "fulfill_unshield") && args.length >= 7) {
      const c = scValBytesToHex32(args[6]);
      if (c && c !== `0x${"00".repeat(32)}`) out.push(c);
    }
  }
  return out;
}

async function syncLeaves(rpcUrl, startLedger) {
  const rpcClient = new Server(rpcUrl);
  const latest = await rpcClient.getLatestLedger();
  const eventRefs = [];
  let cursor;
  for (let p = 0; p < 64; p++) {
    const page = cursor
      ? await rpcClient.getEvents({ cursor, filters: [{ type: "contract", contractIds: [poolId] }], limit: 200 })
      : await rpcClient.getEvents({
          startLedger: startLedger,
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
  eventRefs.sort((a, b) => a.ledger - b.ledger || a.transactionIndex - b.transactionIndex || a.operationIndex - b.operationIndex);
  const seen = new Set();
  const unique = [];
  for (const r of eventRefs) {
    if (seen.has(r.txHash)) continue;
    seen.add(r.txHash);
    unique.push(r);
  }
  const leaves = [];
  const txFailures = [];
  for (const ref of unique) {
    try {
      const tx = await rpcClient.getTransaction(ref.txHash);
      if (tx.status !== Api.GetTransactionStatus.SUCCESS) {
        txFailures.push({ tx: ref.txHash.slice(0, 12), status: tx.status });
        continue;
      }
      leaves.push(...extractCommitmentsFromTx(tx, poolId));
    } catch (e) {
      txFailures.push({ tx: ref.txHash.slice(0, 12), err: String(e).slice(0, 60) });
    }
  }
  return { leaves, events: eventRefs.length, txs: unique.length, txFailures, latest: latest.sequence };
}

async function rootOf(leaves) {
  const h = createLocalPoseidonHasher();
  const inc = await computeIncrementalMerkleRoot(h, leaves);
  const { levels, zeroes } = await buildLevelMaps(h, leaves);
  const batch = extractPath(levels, zeroes, 0, 20).root;
  return { inc, batch };
}

const hasher = createLocalPoseidonHasher();
console.log("Target wrong root:", TARGET_WRONG);
console.log("Target ok root:   ", TARGET_OK);
console.log("scanFrom:", scanFrom, "\n");

for (const url of RPCS) {
  const host = new URL(url).host;
  for (const start of [scanFrom, 1, 3020000, 3140000]) {
    try {
      const { leaves, events, txs, txFailures, latest } = await syncLeaves(url, start);
      const { inc, batch } = await rootOf(leaves);
      const match = inc.toLowerCase() === TARGET_OK ? "OK" : inc.toLowerCase() === TARGET_WRONG ? "WRONG" : "OTHER";
      console.log(`[${host}] start=${start} latest=${latest} events=${events} txs=${txs} leaves=${leaves.length} root=${inc.slice(0, 18)}… ${match}`);
      if (match === "WRONG" || match === "OK") {
        leaves.forEach((l, i) => console.log(`  ${i}: ${l}`));
      }
      if (txFailures.length) console.log("  txFailures:", txFailures);
    } catch (e) {
      console.log(`[${host}] start=${start} ERR:`, String(e).slice(0, 100));
    }
  }
}

// YLDS token field
const ylds = deployment.tokens.YLDS;
const { createHash } = await import("node:crypto");
const digest = createHash("sha256").update(ylds).digest();
digest[0] = 0;
const yldsField = `0x${digest.toString("hex")}`;
console.log("\nYLDS contract:", ylds);
console.log("YLDS token field:", yldsField);
