import { getServiceUrls } from "./service-urls";
import type { ProofInputs } from "./proving";

export type RelayerResponse = {
  accepted?: boolean;
  requestId: string;
  txHash?: string | null;
  status: string;
  error?: string;
};

export async function submitShieldedTransferToRelayer(payload: {
  shieldedPool: string;
  /** Witness inputs — relayer proves with nargo+bb (matches on-chain verifier). */
  proofInputs?: ProofInputs;
  /** Legacy: pre-generated proof from browser (may fail on-chain). */
  proofBytes?: string;
  transferMeta: string;
  encryptedNote0: string;
  encryptedNote1: string;
  channel0: string;
  channel1: string;
  subchannel0: string;
  subchannel1: string;
  fee?: number;
}): Promise<RelayerResponse> {
  const { relayerUrl } = await getServiceUrls();
  const res = await fetch(`${relayerUrl.replace(/\/$/, "")}/relay/shielded-transfer`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(payload),
  });
  const body = (await res.json()) as RelayerResponse;
  if (!res.ok) throw new Error(body.error || `Relayer HTTP ${res.status}`);
  return body;
}

export async function submitUnshieldToRelayer(payload: {
  shieldedPool: string;
  proofBytes: string;
  nullifier: string;
  token: string;
  recipient: string;
  amount: string;
  merkleRoot: string;
  newCommitment: string;
  encryptedNote?: string;
  channel?: string;
  subchannel?: string;
  useAsp?: boolean;
  ownerPk?: string;
  aspGate?: string;
  publicInputs?: string;
}): Promise<RelayerResponse> {
  const { relayerUrl } = await getServiceUrls();
  const res = await fetch(`${relayerUrl.replace(/\/$/, "")}/relay/unshield`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(payload),
  });
  const body = (await res.json()) as RelayerResponse;
  if (!res.ok) throw new Error(body.error || `Relayer HTTP ${res.status}`);
  return body;
}

export async function fetchRelayerStatus(requestId: string): Promise<RelayerResponse> {
  const { relayerUrl } = await getServiceUrls();
  const res = await fetch(`${relayerUrl.replace(/\/$/, "")}/relay/status/${requestId}`);
  const body = (await res.json()) as RelayerResponse;
  if (!res.ok) throw new Error(body.error || `Relayer status HTTP ${res.status}`);
  return body;
}

export async function waitForRelayerConfirmation(
  requestId: string,
  timeoutMs = 600_000,
  pollMs = 3000
): Promise<RelayerResponse> {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    const status = await fetchRelayerStatus(requestId);
    if (status.status === "confirmed") {
      const hash = status.txHash?.replace(/^0x/i, "") ?? "";
      if (!/^[0-9a-f]{64}$/i.test(hash)) {
        throw new Error("Relayer confirmed without a valid on-chain transaction hash");
      }
      return { ...status, txHash: hash.toLowerCase() };
    }
    if (status.status === "failed" || status.status === "timeout") {
      throw new Error(status.error || `Relayer ${status.status}`);
    }
    await new Promise((r) => setTimeout(r, pollMs));
  }
  throw new Error("Timed out waiting for relayer");
}

export async function fetchRelayerHealth(): Promise<{ ok: boolean; relayerAddress?: string }> {
  const { relayerUrl } = await getServiceUrls();
  const res = await fetch(`${relayerUrl.replace(/\/$/, "")}/healthz`);
  if (!res.ok) return { ok: false };
  return (await res.json()) as { ok: boolean; relayerAddress?: string };
}

export async function requestFaucetMint(payload: {
  token: string;
  recipient: string;
  amount: string;
}): Promise<RelayerResponse> {
  const { relayerUrl } = await getServiceUrls();
  const res = await fetch(`${relayerUrl.replace(/\/$/, "")}/faucet/mint`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(payload),
  });
  const body = (await res.json()) as RelayerResponse;
  if (!res.ok) throw new Error(body.error || `Faucet HTTP ${res.status}`);
  return body;
}
