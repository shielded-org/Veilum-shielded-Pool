import type { TxProgressStep } from "./types";

const STEP_ORDER: TxProgressStep[] = ["prepare", "witness", "proof", "submit", "confirm", "sync", "done"];

const STEP_PERCENT: Record<TxProgressStep, number> = {
  prepare: 8,
  witness: 22,
  proof: 48,
  submit: 68,
  confirm: 82,
  sync: 94,
  done: 100,
};

const STEP_LABEL: Record<TxProgressStep, string> = {
  prepare: "Preparing",
  witness: "Syncing merkle tree",
  proof: "Generating zero-knowledge proof",
  submit: "Submitting to relayer",
  confirm: "Confirming on-chain",
  sync: "Syncing balance from chain",
  done: "Complete",
};

export function txProgressPercent(step: TxProgressStep): number {
  return STEP_PERCENT[step] ?? 30;
}

export function txProgressLabel(step: TxProgressStep): string {
  return STEP_LABEL[step] ?? "Processing";
}

export function txProgressSteps(): TxProgressStep[] {
  return STEP_ORDER.filter((s) => s !== "done");
}

export function mapStatusMessageToTxStep(msg: string): TxProgressStep | null {
  const m = msg.toLowerCase();
  if (m.includes("restoring balance") || m.includes("updating balance") || m.includes("syncing balance")) {
    return "sync";
  }
  if (
    m.includes("confirming spend") ||
    m.includes("waiting on network") ||
    m.includes("processing on-chain") ||
    m.includes("transaction submitted") ||
    m.includes("waiting for confirmation")
  ) {
    return "confirm";
  }
  if (m.includes("submitting") || m.includes("relayer") || m.includes("bundle")) return "submit";
  if (
    m.includes("generating proof") ||
    m.includes("unshield proof") ||
    m.includes("zero-knowledge") ||
    m.includes("noir") ||
    m.includes("ultrahonk")
  ) {
    return "proof";
  }
  if (
    m.includes("merkle") ||
    m.includes("scanning") ||
    m.includes("resolving") ||
    m.includes("building circuit") ||
    m.includes("spendable")
  ) {
    return "witness";
  }
  if (m.includes("starting") || m.includes("preparing")) return "prepare";
  return null;
}

export function stepIndex(step: TxProgressStep): number {
  const idx = STEP_ORDER.indexOf(step);
  return idx >= 0 ? idx : 0;
}
