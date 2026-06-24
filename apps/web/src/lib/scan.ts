import { scValToNative, xdr, rpc } from "@stellar/stellar-sdk";

const { Api, Server: SorobanRpc } = rpc;

import { decryptNoteECDH, routeForRecipient } from "./keys";
import { poolContractEventFilter, subchannelScanWindow } from "./pool-ledger";
import {
  fetchAllContractEvents,
  isLedgerRangeError,
  probeLedgerWindow,
  resolveScanLedgerRange,
  type RpcLedgerWindow,
} from "./rpc-events";
import { scanDebug } from "./scan-debug";
import { nullifierSpent } from "./soroban";
import type { DecryptedNote, Hex32, NetworkConfig } from "./types";
import { bytes32Arg, parseHex32 } from "./utils";

const PAGE_LIMIT = 500;
const DECRYPT_BATCH = 64;

type RouteEvent = {
  txHash: string;
  encryptedNoteHex: string;
  ledger: number;
};

export type ScanProgress = {
  pages: number;
  eventsScanned: number;
  channelMatched: number;
  notesFound: number;
};

export type ScanRouteResult = {
  notes: DecryptedNote[];
  lastScannedLedger: number;
  eventsScanned: number;
  channelMatched: number;
};

export type ScanRouteOptions = {
  /** Pool emits (route, channel, subchannel) indexed topics — filter client-side on RPC. */
  indexedRouteEvents?: boolean;
  routeCursor?: number;
  tokenFieldFilter?: Hex32;
  /** RPC retention window — clamps startLedger before getEvents. */
  ledgerWindow?: RpcLedgerWindow;
  /** Full history rescan: match every subchannel on the viewing channel. */
  scanAllSubchannels?: boolean;
  /** Expand incremental subchannel window using known local note count. */
  knownNoteCount?: number;
  onProgress?: (p: ScanProgress) => void;
};

export async function scanRouteEvents(
  rpcClient: SorobanRpc,
  poolId: string,
  startLedger: number,
  viewingPriv: bigint,
  viewingPub: Hex32,
  options: ScanRouteOptions = {}
): Promise<ScanRouteResult> {
  if (!options.ledgerWindow?.rpcUrl) {
    throw new Error("Note scan requires a probed RPC ledger window");
  }

  let window = options.ledgerWindow;
  let range = resolveScanLedgerRange(startLedger, window);

  scanDebug("scanRouteEvents:start", {
    poolId,
    startLedger,
    scanFrom: range.scanFrom,
    endLedger: range.endLedger,
    indexedRouteEvents: options.indexedRouteEvents ?? false,
    scanAllSubchannels: options.scanAllSubchannels ?? false,
    routeCursor: options.routeCursor ?? 0,
    viewingPubPrefix: `${viewingPub.slice(0, 10)}…`,
  });

  if (range.scanFrom > range.endLedger) {
    return { notes: [], lastScannedLedger: range.endLedger, eventsScanned: 0, channelMatched: 0 };
  }

  const runScan = () =>
    options.indexedRouteEvents
      ? scanIndexedRouteEvents(
          rpcClient,
          poolId,
          range.scanFrom,
          range.endLedger,
          viewingPriv,
          viewingPub,
          options
        )
      : scanLegacyRouteEvents(
          rpcClient,
          poolId,
          range.scanFrom,
          range.endLedger,
          viewingPriv,
          viewingPub,
          options
        );

  try {
    return await runScan();
  } catch (err) {
    if (!isLedgerRangeError(err) || !window.rpcUrl) throw err;
    window = await probeLedgerWindow(window.rpcUrl, poolId, { force: true });
    range = resolveScanLedgerRange(startLedger, window);
    if (range.scanFrom > range.endLedger) {
      return { notes: [], lastScannedLedger: range.endLedger, eventsScanned: 0, channelMatched: 0 };
    }
    options.ledgerWindow = window;
    return await runScan();
  }
}

/**
 * Indexed pool events: topics = [route, channel, subchannel], value = encrypted note.
 * Soroban RPC topic filters are unreliable on testnet — fetch pool events and match topics locally.
 */
async function scanIndexedRouteEvents(
  rpcClient: SorobanRpc,
  poolId: string,
  scanFrom: number,
  endLedger: number,
  viewingPriv: bigint,
  viewingPub: Hex32,
  options: ScanRouteOptions
): Promise<ScanRouteResult> {
  const viewingChannel = routeForRecipient(viewingPub, 0).channel;
  const channelHex = bytes32Arg(viewingChannel).toLowerCase();
  const windowCursor = Math.max(
    options.routeCursor ?? 0,
    options.knownNoteCount ?? 0,
    (options.routeCursor ?? 0) + (options.knownNoteCount ?? 0)
  );
  const subchannelHex = options.scanAllSubchannels
    ? null
    : new Set(
        subchannelScanWindow(windowCursor).map((id) =>
          bytes32Arg(routeForRecipient(viewingPub, id).subchannel).toLowerCase()
        )
      );

  const notes: DecryptedNote[] = [];
  let pages = 0;
  let eventsScanned = 0;
  let channelMatched = 0;
  let lastScannedLedger = Math.max(scanFrom - 1, 0);

  const events = await fetchAllContractEvents(
    rpcClient,
    poolContractEventFilter(poolId),
    { scanFrom, endLedger },
    PAGE_LIMIT
  );

  for (let i = 0; i < events.length; i += PAGE_LIMIT) {
    const chunk = events.slice(i, i + PAGE_LIMIT);
    pages += 1;
    const batch: RouteEvent[] = [];
    for (const ev of chunk) {
      eventsScanned += 1;
      lastScannedLedger = Math.max(lastScannedLedger, ev.ledger);
      const parsed = parseIndexedRouteEventForViewer(ev, channelHex, subchannelHex);
      if (parsed) {
        channelMatched += 1;
        batch.push(parsed);
      }
    }

    notes.push(...(await decryptRouteBatch(batch, viewingPriv, options.tokenFieldFilter)));
    options.onProgress?.({ pages, eventsScanned, channelMatched, notesFound: notes.length });
  }

  if (eventsScanned === 0) lastScannedLedger = endLedger;

  scanDebug("scanIndexedRouteEvents:done", {
    poolId,
    scanFrom,
    endLedger,
    pages,
    eventsScanned,
    channelMatched,
    notesFound: notes.length,
    scanAllSubchannels: options.scanAllSubchannels ?? false,
    subchannelFilter: subchannelHex === null ? "all" : subchannelHex.size,
    lastScannedLedger,
  });

  return {
    notes: dedupeNotes(notes),
    lastScannedLedger,
    eventsScanned,
    channelMatched,
  };
}

/** Legacy pool: channel in event body (RoutedNote struct). */
async function scanLegacyRouteEvents(
  rpcClient: SorobanRpc,
  poolId: string,
  scanFrom: number,
  endLedger: number,
  viewingPriv: bigint,
  viewingPub: Hex32,
  options: ScanRouteOptions
): Promise<ScanRouteResult> {
  const viewingChannel = routeForRecipient(viewingPub, 0).channel;

  const notes: DecryptedNote[] = [];
  let pages = 0;
  let eventsScanned = 0;
  let channelMatched = 0;
  let lastScannedLedger = Math.max(scanFrom - 1, 0);

  const events = await fetchAllContractEvents(
    rpcClient,
    poolContractEventFilter(poolId),
    { scanFrom, endLedger },
    PAGE_LIMIT
  );

  for (let i = 0; i < events.length; i += PAGE_LIMIT) {
    const chunk = events.slice(i, i + PAGE_LIMIT);
    pages += 1;
    const batch: RouteEvent[] = [];
    for (const ev of chunk) {
      eventsScanned += 1;
      lastScannedLedger = Math.max(lastScannedLedger, ev.ledger);
      const parsed = parseLegacyRouteEvent(ev, viewingChannel);
      if (parsed) {
        channelMatched += 1;
        batch.push(parsed);
      }
    }

    notes.push(...(await decryptRouteBatch(batch, viewingPriv, options.tokenFieldFilter)));

    options.onProgress?.({ pages, eventsScanned, channelMatched, notesFound: notes.length });
  }

  if (eventsScanned === 0) lastScannedLedger = endLedger;

  return {
    notes: dedupeNotes(notes),
    lastScannedLedger,
    eventsScanned,
    channelMatched,
  };
}

function parseIndexedRouteEventForViewer(
  ev: Api.EventResponse,
  channelHex: string,
  subchannelHex: Set<string> | null
): RouteEvent | null {
  try {
    const topics = ev.topic ?? [];
    if (topics.length < 3) return null;
    if (eventTopicName(topics[0]) !== "route") return null;

    const evChannel = bytes32FromUnknown(scValToNative(topics[1]));
    if (!evChannel || bytes32Arg(evChannel).toLowerCase() !== channelHex) return null;

    const evSub = bytes32FromUnknown(scValToNative(topics[2]));
    if (
      subchannelHex !== null &&
      (!evSub || !subchannelHex.has(bytes32Arg(evSub).toLowerCase()))
    ) {
      return null;
    }

    const encrypted = encryptedNoteFromValue(ev.value);
    if (!encrypted) return null;

    return { txHash: ev.txHash, encryptedNoteHex: encrypted, ledger: ev.ledger };
  } catch {
    return null;
  }
}

async function decryptRouteBatch(
  batch: RouteEvent[],
  viewingPriv: bigint,
  tokenFieldFilter?: Hex32
): Promise<DecryptedNote[]> {
  const notes: DecryptedNote[] = [];
  for (let i = 0; i < batch.length; i += DECRYPT_BATCH) {
    const chunk = batch.slice(i, i + DECRYPT_BATCH);
    const decrypted = await Promise.all(
      chunk.map(async (item) => {
        const plain = await decryptNoteECDH(item.encryptedNoteHex, viewingPriv);
        if (!plain) return null;
        if (tokenFieldFilter && plain.token.toLowerCase() !== tokenFieldFilter.toLowerCase()) {
          return null;
        }
        return {
          id: `${plain.commitment}:${item.txHash}`,
          commitment: plain.commitment as Hex32,
          token: plain.token as Hex32,
          amount: BigInt(plain.amount),
          blinding: parseHex32(plain.blinding),
          txHash: item.txHash,
          createdAt: new Date().toISOString(),
        } satisfies DecryptedNote;
      })
    );
    for (const n of decrypted) {
      if (n) notes.push(n);
    }
  }
  return notes;
}

function dedupeNotes(notes: DecryptedNote[]): DecryptedNote[] {
  const dedup = new Map<string, DecryptedNote>();
  for (const n of notes) dedup.set(n.id, n);
  return Array.from(dedup.values());
}

function parseLegacyRouteEvent(ev: Api.EventResponse, viewingChannel: Hex32): RouteEvent | null {
  try {
    const topics = ev.topic ?? [];
    const topic0 = topics[0];
    if (!topic0 || eventTopicName(topic0) !== "route") return null;

    const value = scValToNative(ev.value) as Record<string, unknown> | null;
    if (!value || typeof value !== "object") return null;

    const channelRaw = value.channel;
    if (!channelMatches(channelRaw, viewingChannel)) return null;

    const encrypted = value.encrypted_note ?? value.encryptedNote;
    if (!encrypted) return null;

    return {
      txHash: ev.txHash,
      encryptedNoteHex: bytesToHex(encrypted),
      ledger: ev.ledger,
    };
  } catch {
    return null;
  }
}

function encryptedNoteFromValue(value: xdr.ScVal): string | null {
  const native = scValToNative(value);
  if (native instanceof Uint8Array) return Buffer.from(native).toString("hex");
  if (Buffer.isBuffer(native)) return native.toString("hex");
  if (typeof native === "string") return native.replace(/^0x/, "");
  if (native && typeof native === "object") {
    const obj = native as Record<string, unknown>;
    const enc = obj.encrypted_note ?? obj.encryptedNote;
    if (enc) return bytesToHex(enc);
  }
  return null;
}

function channelMatches(eventChannel: unknown, viewingChannel: Hex32): boolean {
  const eventHex = bytes32FromUnknown(eventChannel);
  if (!eventHex) return false;
  return bytes32Arg(eventHex).toLowerCase() === bytes32Arg(viewingChannel).toLowerCase();
}

function bytes32FromUnknown(v: unknown): string | null {
  if (v instanceof Uint8Array) {
    return `0x${Buffer.from(v).toString("hex").padStart(64, "0").slice(-64)}`;
  }
  if (Buffer.isBuffer(v)) {
    return `0x${v.toString("hex").padStart(64, "0").slice(-64)}`;
  }
  if (typeof v === "string") {
    const clean = v.replace(/^0x/, "");
    if (clean.length >= 64) return `0x${clean.slice(-64)}`;
  }
  return null;
}

function eventTopicName(topic: xdr.ScVal): string | null {
  try {
    const native = scValToNative(topic);
    return typeof native === "string" ? native : null;
  } catch {
    if (topic.switch() === xdr.ScValType.scvSymbol()) return topic.sym().toString();
    if (topic.switch() === xdr.ScValType.scvString()) return topic.str().toString();
    return null;
  }
}

function bytesToHex(v: unknown): string {
  if (v instanceof Uint8Array) return Buffer.from(v).toString("hex");
  if (typeof v === "string") return v.replace(/^0x/, "");
  if (Buffer.isBuffer(v)) return v.toString("hex");
  return String(v).replace(/^0x/, "");
}

export async function resolveNoteSpendStatus(
  rpcClient: SorobanRpc,
  config: NetworkConfig,
  poolId: string,
  source: string,
  notes: DecryptedNote[],
  spendingKey: bigint,
  nullifierFn: (sk: bigint, c: Hex32) => Promise<Hex32>,
  onlyNoteIds?: Set<string>
): Promise<DecryptedNote[]> {
  if (notes.length === 0) return [];
  const toCheck = onlyNoteIds ? notes.filter((n) => onlyNoteIds.has(n.id)) : notes;
  if (toCheck.length === 0) return notes;

  const BATCH = 12;
  const resolvedMap = new Map<string, DecryptedNote>();
  for (let i = 0; i < toCheck.length; i += BATCH) {
    const chunk = toCheck.slice(i, i + BATCH);
    const resolved = await Promise.all(
      chunk.map(async (note) => {
        try {
          const nf = await nullifierFn(spendingKey, note.commitment);
          const spent = await nullifierSpent(rpcClient, config, source, poolId, nf);
          return { ...note, nullifier: nf, spent };
        } catch {
          return { ...note, spent: note.spent ?? false };
        }
      })
    );
    for (const n of resolved) resolvedMap.set(n.id, n);
  }

  return notes.map((n) => resolvedMap.get(n.id) ?? n);
}
