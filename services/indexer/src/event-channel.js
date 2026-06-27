import { scValToNative, xdr } from "@stellar/stellar-sdk";

function decodeTopic(topic) {
  if (topic == null) return null;
  if (typeof topic === "string") return xdr.ScVal.fromXDR(topic, "base64");
  return topic;
}

function topicName(topic) {
  try {
    const native = scValToNative(decodeTopic(topic));
    return typeof native === "string" ? native : null;
  } catch {
    return null;
  }
}

function bytes32Hex(topic) {
  try {
    const native = scValToNative(decodeTopic(topic));
    if (native instanceof Uint8Array) {
      return Buffer.from(native).toString("hex").padStart(64, "0").slice(-64);
    }
    if (Buffer.isBuffer(native)) {
      return native.toString("hex").padStart(64, "0").slice(-64);
    }
    return null;
  } catch {
    return null;
  }
}

/** Extract normalized channel hex from an indexed route event row. */
export function channelHexFromRouteEvent(ev) {
  const topics = ev.topic ?? [];
  if (topics.length < 2) return null;
  if (topicName(topics[0]) !== "route") return null;
  return bytes32Hex(topics[1]);
}

export function normalizeChannelParam(channel) {
  if (!channel || typeof channel !== "string") return null;
  const clean = channel.replace(/^0x/i, "").toLowerCase();
  if (clean.length < 64) return null;
  return clean.slice(-64);
}

/** Lower bound: first index where events[i].ledger >= ledger. */
export function ledgerLowerBound(events, ledger) {
  let lo = 0;
  let hi = events.length;
  while (lo < hi) {
    const mid = (lo + hi) >>> 1;
    if (events[mid].ledger < ledger) lo = mid + 1;
    else hi = mid;
  }
  return lo;
}

/** Upper bound: first index where events[i].ledger > ledger. */
export function ledgerUpperBound(events, ledger) {
  let lo = 0;
  let hi = events.length;
  while (lo < hi) {
    const mid = (lo + hi) >>> 1;
    if (events[mid].ledger <= ledger) lo = mid + 1;
    else hi = mid;
  }
  return lo;
}

export function rebuildRoutesByChannel(events) {
  const routesByChannel = {};
  for (const ev of events) {
    const channel = channelHexFromRouteEvent(ev);
    if (!channel) continue;
    if (!routesByChannel[channel]) routesByChannel[channel] = [];
    routesByChannel[channel].push(ev);
  }
  for (const list of Object.values(routesByChannel)) {
    list.sort(
      (a, b) =>
        a.ledger - b.ledger ||
        a.transactionIndex - b.transactionIndex ||
        a.operationIndex - b.operationIndex
    );
  }
  return routesByChannel;
}
