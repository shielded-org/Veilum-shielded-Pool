import { RELAYER_URL } from "./types";

export type RelayerResponse = {
  accepted?: boolean;
  requestId: string;
  txHash?: string | null;
  status: string;
  error?: string;
};

export async function submitShieldedTransferToRelayer(payload: {
  shieldedPool: string;
  proofBytes: string;
  transferMeta: string;
  encryptedNote0: string;
  encryptedNote1: string;
  channel0: string;
  channel1: string;
  subchannel0: string;
  subchannel1: string;
  fee?: number;
}): Promise<RelayerResponse> {
  const res = await fetch(`${RELAYER_URL.replace(/\/$/, "")}/relay/shielded-transfer`, {
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
}): Promise<RelayerResponse> {
  const res = await fetch(`${RELAYER_URL.replace(/\/$/, "")}/relay/unshield`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(payload),
  });
  const body = (await res.json()) as RelayerResponse;
  if (!res.ok) throw new Error(body.error || `Relayer HTTP ${res.status}`);
  return body;
}

export async function fetchRelayerStatus(requestId: string): Promise<RelayerResponse> {
  const res = await fetch(`${RELAYER_URL.replace(/\/$/, "")}/relay/status/${requestId}`);
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
    if (status.status === "confirmed") return status;
    if (status.status === "failed" || status.status === "timeout") {
      throw new Error(status.error || `Relayer ${status.status}`);
    }
    await new Promise((r) => setTimeout(r, pollMs));
  }
  throw new Error("Timed out waiting for relayer");
}

export async function fetchRelayerHealth(): Promise<{ ok: boolean; relayerAddress?: string }> {
  const res = await fetch(`${RELAYER_URL.replace(/\/$/, "")}/healthz`);
  if (!res.ok) return { ok: false };
  return (await res.json()) as { ok: boolean; relayerAddress?: string };
}

export async function requestFaucetMint(payload: {
  token: string;
  recipient: string;
  amount: string;
}): Promise<RelayerResponse> {
  const res = await fetch(`${RELAYER_URL.replace(/\/$/, "")}/faucet/mint`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(payload),
  });
  const body = (await res.json()) as RelayerResponse;
  if (!res.ok) throw new Error(body.error || `Faucet HTTP ${res.status}`);
  return body;
}
