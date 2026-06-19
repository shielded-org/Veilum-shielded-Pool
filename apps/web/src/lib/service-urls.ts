const LOCAL_RELAYER = "http://127.0.0.1:8787";
const LOCAL_ASP = "http://127.0.0.1:8788";

export type ServiceUrls = {
  relayerUrl: string;
  aspUrl: string;
};

let resolved: ServiceUrls | null = null;

function envUrl(key: "VITE_RELAYER_URL" | "VITE_ASP_URL"): string {
  return (import.meta.env[key] as string | undefined)?.trim() ?? "";
}

function isUnset(url: string, localDefault: string): boolean {
  return !url || url === localDefault;
}

/** Resolve relayer + ASP base URLs (Vite env, then /config/services.json fallback). */
export async function getServiceUrls(): Promise<ServiceUrls> {
  if (resolved) return resolved;

  let relayerUrl = envUrl("VITE_RELAYER_URL");
  let aspUrl = envUrl("VITE_ASP_URL");

  if (isUnset(relayerUrl, LOCAL_RELAYER) || isUnset(aspUrl, LOCAL_ASP)) {
    try {
      const res = await fetch("/config/services.json", { cache: "no-store" });
      if (res.ok) {
        const cfg = (await res.json()) as Partial<ServiceUrls>;
        if (isUnset(relayerUrl, LOCAL_RELAYER) && cfg.relayerUrl?.trim()) {
          relayerUrl = cfg.relayerUrl.trim();
        }
        if (isUnset(aspUrl, LOCAL_ASP) && cfg.aspUrl?.trim()) {
          aspUrl = cfg.aspUrl.trim();
        }
      }
    } catch {
      // local dev without services.json
    }
  }

  resolved = {
    relayerUrl: relayerUrl || LOCAL_RELAYER,
    aspUrl: aspUrl || LOCAL_ASP,
  };
  return resolved;
}

export function resetServiceUrlsCache(): void {
  resolved = null;
}
