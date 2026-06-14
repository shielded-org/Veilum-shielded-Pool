export type StellarShieldedTransferPayload = {
  network?: string;
  shieldedPool: string;
  proofBytes: string;
  transferMeta: string;
  encryptedNote0: string;
  encryptedNote1: string;
  channel0: string;
  channel1: string;
  subchannel0: string;
  subchannel1: string;
  fee?: string | number;
};

export type RelayerResponse = {
  accepted?: boolean;
  requestId: string;
  txHash?: string | null;
  status: string;
  error?: string;
  createdAt?: string;
};

export type StellarUnshieldPayload = {
  network?: string;
  shieldedPool: string;
  proofBytes: string;
  nullifier: string;
  token: string;
  recipient: string;
  amount: string | number;
  merkleRoot: string;
  newCommitment: string;
  encryptedNote?: string;
  channel?: string;
  subchannel?: string;
};

export async function submitUnshieldToRelayer(
  relayerUrl: string,
  payload: StellarUnshieldPayload
): Promise<RelayerResponse> {
  const res = await fetch(`${relayerUrl.replace(/\/$/, "")}/relay/unshield`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(payload),
  });
  const body = (await res.json()) as RelayerResponse;
  if (!res.ok) {
    throw new Error(body.error || `Relayer returned HTTP ${res.status}`);
  }
  return body;
}

export async function submitShieldedTransferToRelayer(
  relayerUrl: string,
  payload: StellarShieldedTransferPayload
): Promise<RelayerResponse> {
  const res = await fetch(`${relayerUrl.replace(/\/$/, "")}/relay/shielded-transfer`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(payload),
  });
  const body = (await res.json()) as RelayerResponse;
  if (!res.ok) {
    throw new Error(body.error || `Relayer returned HTTP ${res.status}`);
  }
  return body;
}

export async function fetchRelayerStatus(relayerUrl: string, requestId: string): Promise<RelayerResponse> {
  const res = await fetch(`${relayerUrl.replace(/\/$/, "")}/relay/status/${requestId}`);
  const body = (await res.json()) as RelayerResponse;
  if (!res.ok) {
    throw new Error(body.error || `Relayer status HTTP ${res.status}`);
  }
  return body;
}

export async function waitForRelayerConfirmation(
  relayerUrl: string,
  requestId: string,
  timeoutMs = 600_000,
  pollMs = 3_000
): Promise<RelayerResponse> {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    const status = await fetchRelayerStatus(relayerUrl, requestId);
    if (status.status === "confirmed") return status;
    if (status.status === "failed" || status.status === "timeout") {
      throw new Error(status.error || `Relayer request ${status.status}`);
    }
    await new Promise((r) => setTimeout(r, pollMs));
  }
  throw new Error(`Timed out waiting for relayer confirmation (${requestId})`);
}
