const LOCAL_RELAYER = "http://127.0.0.1:8787";
const LOCAL_ASP = "http://127.0.0.1:8788";
const LOCAL_INDEXER = "http://127.0.0.1:8789";

/** Same-origin paths — proxied in Vite dev and Vercel prod (avoids Brave cross-site blocking). */
export const PROXY_RELAYER_URL = "/api/relayer";
export const PROXY_ASP_URL = "/api/asp";
export const PROXY_INDEXER_URL = "/api/indexer";

export type ServiceUrls = {
  relayerUrl: string;
  aspUrl: string;
  indexerUrl: string;
};

let resolved: ServiceUrls | null = null;

function envUrl(key: "VITE_RELAYER_URL" | "VITE_ASP_URL" | "VITE_INDEXER_URL"): string {
  return (import.meta.env[key] as string | undefined)?.trim() ?? "";
}

function isLocalDevHost(): boolean {
  if (typeof window === "undefined") return import.meta.env.DEV;
  const host = window.location.hostname;
  return host === "localhost" || host === "127.0.0.1";
}

/** Resolve relayer + ASP base URLs. Production uses same-origin proxy; local dev uses env or localhost. */
export async function getServiceUrls(): Promise<ServiceUrls> {
  if (resolved) return resolved;

  if (!isLocalDevHost()) {
    resolved = { relayerUrl: PROXY_RELAYER_URL, aspUrl: PROXY_ASP_URL, indexerUrl: PROXY_INDEXER_URL };
    return resolved;
  }

  let relayerUrl = envUrl("VITE_RELAYER_URL");
  let aspUrl = envUrl("VITE_ASP_URL");
  let indexerUrl = envUrl("VITE_INDEXER_URL");

  if (!relayerUrl || !aspUrl || !indexerUrl) {
    try {
      const res = await fetch("/config/services.json", { cache: "no-store" });
      if (res.ok) {
        const cfg = (await res.json()) as Partial<ServiceUrls>;
        if (!relayerUrl && cfg.relayerUrl?.trim()) relayerUrl = cfg.relayerUrl.trim();
        if (!aspUrl && cfg.aspUrl?.trim()) aspUrl = cfg.aspUrl.trim();
        if (!indexerUrl && cfg.indexerUrl?.trim()) indexerUrl = cfg.indexerUrl.trim();
      }
    } catch {
      // optional local override file
    }
  }

  resolved = {
    relayerUrl: relayerUrl || LOCAL_RELAYER,
    aspUrl: aspUrl || LOCAL_ASP,
    indexerUrl: indexerUrl || LOCAL_INDEXER,
  };
  return resolved;
}

export function resetServiceUrlsCache(): void {
  resolved = null;
}
