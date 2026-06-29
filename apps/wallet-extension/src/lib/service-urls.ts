export type ServiceUrls = {
  relayerUrl: string;
  aspUrl: string;
  indexerUrl: string;
};

export const DEFAULT_SERVICE_URLS: ServiceUrls = {
  relayerUrl: "https://veilum-shielded-pool-1.onrender.com",
  aspUrl: "https://veilum-shielded-pool.onrender.com",
  indexerUrl: "https://veilum-shielded-indexer.fly.dev",
};

let resolved: ServiceUrls | null = null;

/** Web dev proxies (/api/*) are invalid inside the extension popup. */
function isAbsoluteServiceUrl(url: string): boolean {
  return /^https?:\/\//i.test(url);
}

function resolveServiceUrl(
  envValue: string | undefined,
  jsonValue: string | undefined,
  fallback: string
): string {
  if (envValue && isAbsoluteServiceUrl(envValue)) return envValue.replace(/\/$/, "");
  if (jsonValue && isAbsoluteServiceUrl(jsonValue)) return jsonValue.replace(/\/$/, "");
  return fallback.replace(/\/$/, "");
}

export async function getServiceUrls(): Promise<ServiceUrls> {
  if (resolved) return resolved;

  const envUrls: ServiceUrls = {
    relayerUrl: resolveServiceUrl(
      import.meta.env.VITE_RELAYER_URL,
      undefined,
      DEFAULT_SERVICE_URLS.relayerUrl
    ),
    aspUrl: resolveServiceUrl(import.meta.env.VITE_ASP_URL, undefined, DEFAULT_SERVICE_URLS.aspUrl),
    indexerUrl: resolveServiceUrl(
      import.meta.env.VITE_INDEXER_URL,
      undefined,
      DEFAULT_SERVICE_URLS.indexerUrl
    ),
  };

  try {
    const configUrl =
      typeof chrome !== "undefined" && chrome.runtime?.getURL
        ? chrome.runtime.getURL("config/services.json")
        : "/config/services.json";
    const res = await fetch(configUrl);
    if (res.ok) {
      const json = (await res.json()) as Partial<ServiceUrls>;
      resolved = {
        relayerUrl: resolveServiceUrl(
          import.meta.env.VITE_RELAYER_URL,
          json.relayerUrl,
          DEFAULT_SERVICE_URLS.relayerUrl
        ),
        aspUrl: resolveServiceUrl(
          import.meta.env.VITE_ASP_URL,
          json.aspUrl,
          DEFAULT_SERVICE_URLS.aspUrl
        ),
        indexerUrl: resolveServiceUrl(
          import.meta.env.VITE_INDEXER_URL,
          json.indexerUrl,
          DEFAULT_SERVICE_URLS.indexerUrl
        ),
      };
      return resolved;
    }
  } catch {
    /* fall through */
  }

  resolved = envUrls;
  return resolved;
}

export function resetServiceUrlsCache(): void {
  resolved = null;
}
