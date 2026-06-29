import { rpc } from "@stellar/stellar-sdk";

const { Api, Server: SorobanRpc } = rpc;

const RPC_TIMEOUT_MS = 20_000;
const HORIZON_RETRIES = 3;

export type TxEnvelopeResult = {
  envelopeXdr: string;
  status: Api.GetTransactionStatus;
  source: "rpc" | "horizon";
};

function envelopeXdrToString(envelopeXdr: unknown): string | null {
  if (!envelopeXdr) return null;
  if (typeof envelopeXdr === "string") return envelopeXdr;
  const env = envelopeXdr as { toXDR?: (fmt: string) => string };
  if (typeof env.toXDR === "function") return env.toXDR("base64");
  return null;
}

async function withTimeout<T>(label: string, fn: () => Promise<T>): Promise<T> {
  return Promise.race([
    fn(),
    new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error(`${label} timeout`)), RPC_TIMEOUT_MS)
    ),
  ]);
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

function horizonUrls(horizonUrl?: string): string[] {
  const urls = [horizonUrl, "https://horizon-testnet.stellar.org", "https://horizon.stellar.org"]
    .filter(Boolean)
    .map((u) => u!.replace(/\/$/, ""));
  return [...new Set(urls)];
}

async function fetchHorizonEnvelope(urls: string[], txHash: string): Promise<TxEnvelopeResult | null> {
  for (const base of urls) {
    for (let attempt = 0; attempt < HORIZON_RETRIES; attempt++) {
      try {
        const res = await withTimeout(`horizon ${txHash.slice(0, 8)}`, () =>
          fetch(`${base}/transactions/${txHash}`, { cache: "no-store" })
        );
        if (res.status === 404) break;
        if (!res.ok) {
          await sleep(300 * (attempt + 1));
          continue;
        }
        const body = (await res.json()) as { envelope_xdr?: string; successful?: boolean };
        if (!body.envelope_xdr) break;
        const status =
          body.successful === false
            ? Api.GetTransactionStatus.FAILED
            : Api.GetTransactionStatus.SUCCESS;
        return { envelopeXdr: body.envelope_xdr, status, source: "horizon" };
      } catch {
        if (attempt < HORIZON_RETRIES - 1) await sleep(300 * (attempt + 1));
      }
    }
  }
  return null;
}

/**
 * Fetch a transaction envelope for merkle commitment extraction.
 * Soroban RPC drops old txs outside its retention window; Horizon keeps them longer.
 */
export async function fetchTransactionEnvelope(
  rpcUrls: string[],
  txHash: string,
  horizonUrl?: string
): Promise<TxEnvelopeResult | null> {
  for (const rpcUrl of rpcUrls) {
    const server = new SorobanRpc(rpcUrl, { allowHttp: rpcUrl.startsWith("http://") });
    try {
      const tx = await withTimeout(`getTransaction ${txHash.slice(0, 8)}`, () =>
        server.getTransaction(txHash)
      );
      const envelopeXdr = envelopeXdrToString(tx.envelopeXdr);
      if (tx.status !== Api.GetTransactionStatus.NOT_FOUND && envelopeXdr) {
        return { envelopeXdr, status: tx.status, source: "rpc" };
      }
    } catch {
      /* try next RPC */
    }
  }

  return fetchHorizonEnvelope(horizonUrls(horizonUrl), txHash);
}
