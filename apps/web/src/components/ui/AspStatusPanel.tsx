import type { AspScanResult, AspStatus } from "../../lib/asp";

type AspStatusPanelProps = {
  status: AspStatus | null;
  scanning: boolean;
  lastScan: AspScanResult | null;
  wallet: string | null;
  onRescan: () => void;
  rescanDisabled?: boolean;
};

const STATUS_LABEL: Record<AspStatus, string> = {
  approved: "Cleared",
  denied: "Blocked",
  pending: "Checking",
  unknown: "Not checked",
};

export function AspStatusPanel({
  status,
  scanning,
  lastScan,
  wallet,
  onRescan,
  rescanDisabled,
}: AspStatusPanelProps) {
  const resolved = scanning ? "pending" : status ?? "unknown";
  const tone =
    resolved === "approved" ? "ok" : resolved === "denied" ? "err" : "pending";

  const headline = (() => {
    if (scanning) return "Checking your wallet…";
    if (status === "approved")
      return lastScan
        ? "You're cleared to add funds"
        : "Compliance check passed";
    if (status === "denied") return "Shielding blocked";
    if (!wallet) return "Connect wallet to verify";
    return "Compliance check required";
  })();

  const detail = (() => {
    if (scanning) return "Scanning inbound payments to your wallet on-chain.";
    if (status === "approved" && lastScan) {
      const count = lastScan.inboundCount ?? lastScan.inboundSources?.length ?? 0;
      return `${count} inbound source${count === 1 ? "" : "s"} reviewed — all clear.`;
    }
    if (status === "denied" && lastScan?.reasons?.length) {
      return lastScan.reasons.join(" · ");
    }
    if (status === "denied") return "Fund sources did not pass the compliance scan.";
    if (!wallet) return "A one-time scan runs before your first deposit.";
    return "Run the check to confirm your wallet can deposit into the pool.";
  })();

  return (
    <aside className="form-aside asp-status-panel" aria-label="Compliance status">
      <div className="asp-status-panel__head">
        <h3 className="form-aside__title">Compliance</h3>
        <span className={`asp-status-panel__pill asp-status-panel__pill--${tone}`}>
          {scanning ? "…" : STATUS_LABEL[resolved]}
        </span>
      </div>

      <p className="asp-status-panel__headline">{headline}</p>
      <p className="asp-status-panel__detail">{detail}</p>

      {lastScan?.scannedAt && !scanning ? (
        <p className="asp-status-panel__meta mono">
          Last checked {new Date(lastScan.scannedAt).toLocaleString()}
        </p>
      ) : null}

      {wallet ? (
        <button
          type="button"
          className="btn btn-secondary btn-sm asp-status-panel__action"
          disabled={rescanDisabled}
          onClick={onRescan}
        >
          {scanning ? "Scanning…" : "Re-run check"}
        </button>
      ) : null}
    </aside>
  );
}
