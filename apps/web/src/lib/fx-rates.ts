/** Cached EUR → USD rate (1 EUR = eurUsd USD). */

export type FxRateSnapshot = {
  eurUsd: number;
  fetchedAt: number;
  source: string;
};

const CACHE_KEY = "veilum-fx-eurusd";
const CACHE_TTL_MS = 5 * 60 * 1000;

const COINGECKO_URL =
  "https://api.coingecko.com/api/v3/simple/price?ids=euro-coin&vs_currencies=usd";
const FRANKFURTER_URL = "https://api.frankfurter.app/latest?from=EUR&to=USD";

function readCache(): FxRateSnapshot | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = sessionStorage.getItem(CACHE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as FxRateSnapshot;
    if (typeof parsed.eurUsd !== "number" || parsed.eurUsd <= 0) return null;
    if (Date.now() - parsed.fetchedAt > CACHE_TTL_MS) return null;
    return parsed;
  } catch {
    return null;
  }
}

function writeCache(snapshot: FxRateSnapshot) {
  try {
    sessionStorage.setItem(CACHE_KEY, JSON.stringify(snapshot));
  } catch {
    /* quota / private mode */
  }
}

async function fetchFromCoinGecko(): Promise<number | null> {
  const res = await fetch(COINGECKO_URL, { cache: "no-store" });
  if (!res.ok) return null;
  const body = (await res.json()) as { "euro-coin"?: { usd?: number } };
  const rate = body["euro-coin"]?.usd;
  return typeof rate === "number" && rate > 0 ? rate : null;
}

async function fetchFromFrankfurter(): Promise<number | null> {
  const res = await fetch(FRANKFURTER_URL, { cache: "no-store" });
  if (!res.ok) return null;
  const body = (await res.json()) as { rates?: { USD?: number } };
  const rate = body.rates?.USD;
  return typeof rate === "number" && rate > 0 ? rate : null;
}

let inFlight: Promise<FxRateSnapshot> | null = null;

/** Fetch EUR/USD with session cache; CoinGecko first, Frankfurter (ECB) fallback. */
export async function fetchEurUsdRate(force = false): Promise<FxRateSnapshot> {
  if (!force) {
    const cached = readCache();
    if (cached) return cached;
  }

  if (inFlight) return inFlight;

  inFlight = (async () => {
    let rate = await fetchFromCoinGecko();
    let source = "CoinGecko";
    if (rate === null) {
      rate = await fetchFromFrankfurter();
      source = "Frankfurter (ECB)";
    }
    if (rate === null) {
      throw new Error("Unable to load EUR/USD exchange rate");
    }

    const snapshot: FxRateSnapshot = { eurUsd: rate, fetchedAt: Date.now(), source };
    writeCache(snapshot);
    return snapshot;
  })();

  try {
    return await inFlight;
  } finally {
    inFlight = null;
  }
}

export function readCachedEurUsdRate(): FxRateSnapshot | null {
  return readCache();
}

/** Last cached rate regardless of TTL — used when live fetch fails. */
export function readStaleEurUsdRate(): FxRateSnapshot | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = sessionStorage.getItem(CACHE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as FxRateSnapshot;
    if (typeof parsed.eurUsd !== "number" || parsed.eurUsd <= 0) return null;
    return parsed;
  } catch {
    return null;
  }
}
