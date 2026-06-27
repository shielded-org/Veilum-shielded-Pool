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

/** Resolve relayer + ASP + indexer base URLs. Always same-origin /api/* (Vite or Vercel proxy). */
export async function getServiceUrls(): Promise<ServiceUrls> {
  if (resolved) return resolved;

  resolved = {
    relayerUrl: PROXY_RELAYER_URL,
    aspUrl: PROXY_ASP_URL,
    indexerUrl: PROXY_INDEXER_URL,
  };
  return resolved;
}

export function resetServiceUrlsCache(): void {
  resolved = null;
}
