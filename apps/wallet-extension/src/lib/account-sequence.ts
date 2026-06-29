import type { rpc } from "@stellar/stellar-sdk";

export type SorobanRpc = rpc.Server;

export async function fetchAccountSequence(rpcClient: SorobanRpc, publicKey: string): Promise<bigint> {
  const account = await rpcClient.getAccount(publicKey);
  return BigInt(account.sequenceNumber());
}

export async function waitForSequenceAtLeast(
  rpcClient: SorobanRpc,
  publicKey: string,
  minSequence: bigint,
  timeoutMs = 45_000
): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const seq = await fetchAccountSequence(rpcClient, publicKey);
    if (seq >= minSequence) return;
    await new Promise((r) => setTimeout(r, 1200));
  }
  throw new Error(
    `Account sequence did not reach ${minSequence} within ${Math.round(timeoutMs / 1000)}s — try again in a moment`
  );
}

export function isBadSequenceError(err: unknown): boolean {
  const msg = err instanceof Error ? err.message : String(err);
  return /txBadSeq|bad sequence|sequence number/i.test(msg);
}

export function formatStellarSubmitError(send: unknown): Error {
  const raw = typeof send === "string" ? send : JSON.stringify(send);
  if (/txBadSeq/i.test(raw)) {
    return new Error(
      "Transaction sequence was out of date (txBadSeq). This usually clears after a short wait — please try again."
    );
  }
  return new Error(raw);
}
