import { rpc } from "@stellar/stellar-sdk";

const { Api, Server: SorobanRpc } = rpc;

import { poolContractEventFilter } from "./pool-ledger";
import type { NetworkConfig } from "./types";

export type RpcLedgerWindow = {
  oldest: number;
  latest: number;
  rpcUrl: string;
};

export type EventsRpcHandle = {
  rpc: SorobanRpc;
  window: RpcLedgerWindow;
};

export type ScanLedgerRange = {
  scanFrom: number;
  endLedger: number;
};

const windowCache = new Map<string, { at: number; window: RpcLedgerWindow }>();
const eventsRpcPickCache = new Map<string, Promise<string>>();

const WINDOW_TTL_MS = 15_000;
const LEDGER_RANGE_RE = /ledger range:\s*(\d+)\s*-\s*(\d+)/i;

function rpcServer(url: string): SorobanRpc {
  return new SorobanRpc(url, { allowHttp: url.startsWith("http://") });
}

function cacheKey(url: string, poolId: string): string {
  return `${url}:${poolId}`;
}

export function parseLedgerRangeError(message: string): RpcLedgerWindow | null {
  const match = LEDGER_RANGE_RE.exec(message);
  if (!match) return null;
  const oldest = Number.parseInt(match[1], 10);
  const latest = Number.parseInt(match[2], 10);
  if (!Number.isFinite(oldest) || !Number.isFinite(latest) || oldest > latest) return null;
  return { oldest, latest, rpcUrl: "" };
}

export function isLedgerRangeError(err: unknown): boolean {
  const msg = err instanceof Error ? err.message : String(err);
  return LEDGER_RANGE_RE.test(msg);
}

/** Clamp a desired scan start into the range the RPC can serve. */
export function clampScanLedger(desiredStart: number, window: RpcLedgerWindow): number {
  const start = Number.isFinite(desiredStart) && desiredStart > 0 ? desiredStart : window.oldest;
  return Math.min(Math.max(start, window.oldest), window.latest);
}

export function resolveScanLedgerRange(
  desiredStart: number,
  window: RpcLedgerWindow
): ScanLedgerRange {
  const scanFrom = clampScanLedger(desiredStart, window);
  return { scanFrom, endLedger: window.latest };
}

/** Probe the ledger range retained by an RPC for getEvents. */
export async function probeLedgerWindow(
  rpcUrl: string,
  poolId: string,
  opts?: { force?: boolean }
): Promise<RpcLedgerWindow> {
  const key = cacheKey(rpcUrl, poolId);
  if (!opts?.force) {
    const hit = windowCache.get(key);
    if (hit && Date.now() - hit.at < WINDOW_TTL_MS) return hit.window;
  }

  const rpc = rpcServer(rpcUrl);
  const latest = await rpc.getLatestLedger();
  let probeStart = Math.max(latest.sequence - 100, 1);

  let page: Awaited<ReturnType<SorobanRpc["getEvents"]>>;
  try {
    page = await rpc.getEvents({
      startLedger: probeStart,
      filters: [poolContractEventFilter(poolId)],
      limit: 1,
    });
  } catch (err) {
    const parsed = parseLedgerRangeError(err instanceof Error ? err.message : String(err));
    if (!parsed) throw err;
    probeStart = parsed.oldest;
    page = await rpc.getEvents({
      startLedger: probeStart,
      filters: [poolContractEventFilter(poolId)],
      limit: 1,
    });
  }

  const oldest = page.oldestLedger ?? probeStart;
  const window: RpcLedgerWindow = {
    oldest,
    latest: page.latestLedger ?? latest.sequence,
    rpcUrl,
  };
  windowCache.set(key, { at: Date.now(), window });
  return window;
}

export function uniqueRpcUrls(config: NetworkConfig): string[] {
  return browserRpcUrls(config);
}

/** Browser fetches must use CORS-enabled RPC only (third-party mirrors block Vercel origins). */
export function browserRpcUrls(config: NetworkConfig): string[] {
  return [config.rpcUrl].filter(Boolean);
}

async function pickBestEventsRpcUrl(
  config: NetworkConfig,
  poolId: string,
  minLedger?: number
): Promise<string> {
  const cacheKeyStr = `${config.rpcUrl}:${poolId}:${minLedger ?? 0}:${(config.eventsRpcUrls ?? []).join(",")}`;
  const cached = eventsRpcPickCache.get(cacheKeyStr);
  if (cached) return cached;

  const promise = (async () => {
    const urls = uniqueRpcUrls(config);
    const probes = await Promise.all(
      urls.map(async (url) => {
        try {
          return await probeLedgerWindow(url, poolId);
        } catch {
          return null;
        }
      })
    );

    const windows = probes.filter((w): w is RpcLedgerWindow => w !== null);
    if (windows.length === 0) {
      throw new Error("No RPC endpoint could probe getEvents ledger window");
    }

    const need = minLedger && minLedger > 0 ? minLedger : 1;
    const covering = windows.filter((w) => w.oldest <= need);
    const pool = covering.length > 0 ? covering : windows;
    pool.sort((a, b) => a.oldest - b.oldest || a.latest - b.latest);
    return pool[0].rpcUrl;
  })();

  eventsRpcPickCache.set(cacheKeyStr, promise);
  return promise;
}

/**
 * Pick the RPC with the deepest event history that can serve `minLedger`.
 * Window is always freshly probed (not cached across scans).
 */
export async function pickEventsRpc(
  config: NetworkConfig,
  poolId: string,
  minLedger?: number,
  opts?: { force?: boolean }
): Promise<EventsRpcHandle> {
  const rpcUrl = await pickBestEventsRpcUrl(config, poolId, minLedger);
  const window = await probeLedgerWindow(rpcUrl, poolId, { force: opts?.force ?? true });
  return { rpc: rpcServer(rpcUrl), window };
}

/** True when on-chain activity predates every RPC event window (notes may be missing). */
export function historyGapBeforeWindow(deployLedger: number | undefined, window: RpcLedgerWindow): boolean {
  if (!deployLedger || deployLedger <= 0) return false;
  return deployLedger < window.oldest;
}

export function clearEventsRpcCache(): void {
  windowCache.clear();
  eventsRpcPickCache.clear();
}

/** Soroban RPC may return empty event pages while the cursor still has newer ledgers. */
export const MAX_CONTRACT_EVENT_PAGES = 128;
export const MAX_EMPTY_CONTRACT_EVENT_PAGES = 16;

export type ContractEventFilter = {
  type: "contract";
  contractIds: string[];
};

/**
 * Paginate getEvents until the cursor is exhausted or we hit safety limits.
 * Do not stop on the first empty page — RPC cursors often skip sparse ledger ranges.
 */
export async function fetchAllContractEvents(
  rpcClient: SorobanRpc,
  filter: ContractEventFilter,
  range: ScanLedgerRange,
  limit = 200
): Promise<Api.EventResponse[]> {
  const events: Api.EventResponse[] = [];
  let cursor: string | undefined;
  let pages = 0;
  let emptyStreak = 0;

  while (pages < MAX_CONTRACT_EVENT_PAGES) {
    const page = cursor
      ? await rpcClient.getEvents({ cursor, filters: [filter], limit })
      : await rpcClient.getEvents({
          startLedger: range.scanFrom,
          endLedger: range.endLedger,
          filters: [filter],
          limit,
        });

    pages += 1;
    if (page.events.length > 0) {
      emptyStreak = 0;
      events.push(...page.events);
    } else {
      emptyStreak += 1;
    }

    if (!page.cursor) break;
    if (emptyStreak >= MAX_EMPTY_CONTRACT_EVENT_PAGES) break;
    cursor = page.cursor;
  }

  return events;
}
