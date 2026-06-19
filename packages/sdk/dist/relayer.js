export async function submitUnshieldToRelayer(relayerUrl, payload) {
    const res = await fetch(`${relayerUrl.replace(/\/$/, "")}/relay/unshield`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(payload),
    });
    const body = (await res.json());
    if (!res.ok) {
        throw new Error(body.error || `Relayer returned HTTP ${res.status}`);
    }
    return body;
}
export async function submitShieldedTransferToRelayer(relayerUrl, payload) {
    const res = await fetch(`${relayerUrl.replace(/\/$/, "")}/relay/shielded-transfer`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(payload),
    });
    const body = (await res.json());
    if (!res.ok) {
        throw new Error(body.error || `Relayer returned HTTP ${res.status}`);
    }
    return body;
}
export async function fetchRelayerStatus(relayerUrl, requestId) {
    const res = await fetch(`${relayerUrl.replace(/\/$/, "")}/relay/status/${requestId}`);
    const body = (await res.json());
    if (!res.ok) {
        throw new Error(body.error || `Relayer status HTTP ${res.status}`);
    }
    return body;
}
export async function waitForRelayerConfirmation(relayerUrl, requestId, timeoutMs = 600_000, pollMs = 3_000) {
    const started = Date.now();
    while (Date.now() - started < timeoutMs) {
        const status = await fetchRelayerStatus(relayerUrl, requestId);
        if (status.status === "confirmed") {
            const hash = status.txHash?.replace(/^0x/i, "") ?? "";
            if (!/^[0-9a-f]{64}$/i.test(hash)) {
                throw new Error("Relayer confirmed without a valid on-chain transaction hash");
            }
            return { ...status, txHash: hash.toLowerCase() };
        }
        if (status.status === "failed" || status.status === "timeout") {
            throw new Error(status.error || `Relayer request ${status.status}`);
        }
        await new Promise((r) => setTimeout(r, pollMs));
    }
    throw new Error(`Timed out waiting for relayer confirmation (${requestId})`);
}
