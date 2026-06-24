/** Plain-language UI copy for technical errors — presentation only. */

export function humanizeSyncError(message: string): string {
  const m = message.toLowerCase();
  if (m.includes("merkle") && (m.includes("sync") || m.includes("root") || m.includes("incomplete"))) {
    return "Couldn't refresh your balance from the chain. Wait a moment and try again.";
  }
  if (m.includes("transaction hash") || m.includes("no valid on-chain")) {
    return "This transfer didn't go through. No funds moved.";
  }
  if (m.includes("indexer unreachable") || m.includes("/api/indexer")) {
    return "Can't reach the pool indexer — archived notes may be missing until it's back online.";
  }
  if (m.includes("predates rpc") || m.includes("cannot be recovered")) {
    return "Some older pool activity isn't in RPC history. The indexer may still be catching up.";
  }
  return message;
}

export function humanizeTxDetail(detail: string): string {
  const m = detail.toLowerCase();
  if (m.includes("merkle")) {
    return "Balance sync incomplete — try refreshing";
  }
  if (m.includes("transaction hash") || m.includes("not applied")) {
    return "Didn't go through — no funds moved";
  }
  if (m.includes("proof") && m.includes("verif")) {
    return "Proof verification failed — try again";
  }
  return detail.length > 48 ? `${detail.slice(0, 45)}…` : detail;
}

export function noteStatusLabel(spent: boolean | undefined): string {
  return spent ? "used" : "available";
}
